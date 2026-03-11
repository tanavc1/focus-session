import { ipcMain } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { v4 as uuidv4 } from 'uuid';
import {
  createSession,
  getSession,
  getActiveSession,
  endSession,
  listSessions,
  getEventsBySession,
  upsertActivityBlocks,
  getBlocksBySession,
  getAllSettings,
  setSetting,
  getAllClassifications,
  upsertClassification,
  deleteClassification,
  setSessionExcluded,
  setCachedReport,
  getVisionSnapshots,
  addVisionSnapshot,
  getDayPlan,
  upsertDayPlan,
  getDayStats,
  getWeekStats,
  getStreakInfo,
  getTopAppsAllTime,
  getTopDistractionsAllTime,
  computeFlowPeriods,
  deleteSession,
} from '../database/db';
import { startTracking, stopTracking, getCurrentActivity, invalidateSettingsCache } from '../tracking/activityTracker';
import { setTraySession } from '../tray';
import { groupEventsIntoBlocks, computeSessionReport } from '../analytics/sessionAnalyzer';
import { generateSessionSummary, analyzeScreenshot, checkAiStatus } from '../llm/aiClient';
import { invalidateClassificationCache } from '../analytics/distractionClassifier';
import type { IpcResponse, SessionReport, DayPlan } from '../../shared/types';

// Helper to wrap handler responses
function ok<T>(data: T): IpcResponse<T> {
  return { success: true, data };
}
function err(error: string): IpcResponse<never> {
  return { success: false, error };
}

// ─── Screenshot helper (CLI subprocess, non-blocking) ────────────────────────

async function takeScreenshot(): Promise<{ data: string; mimeType: 'image/png' } | null> {
  const tmp = `/tmp/focus-snap-${Date.now()}.png`;
  try {
    await execAsync(`screencapture -x -m -t png "${tmp}"`, { timeout: 5_000 });
    await execAsync(`sips -Z 720 "${tmp}" --out "${tmp}"`, { timeout: 3_000 });
    const { stdout } = await execAsync(`base64 -i "${tmp}"`, { timeout: 3_000 });
    execAsync(`rm -f "${tmp}"`).catch(() => {});
    return { data: stdout.trim(), mimeType: 'image/png' };
  } catch {
    execAsync(`rm -f "${tmp}"`).catch(() => {});
    return null;
  }
}

export function registerIpcHandlers(): void {
  // ─── Session handlers ──────────────────────────────────────────────────────

  ipcMain.handle('session:start', async (_event, args: { title: string; goal: string; target_duration?: number }) => {
    try {
      const existing = getActiveSession();
      if (existing) {
        endSession(existing.id);
        stopTracking();
      }

      const id = uuidv4();
      const session = createSession(id, args.title, args.goal, args.target_duration);
      startTracking(id);
      setTraySession(session);
      return ok(session);
    } catch (e) {
      console.error('[IPC] session:start error:', e);
      return err(String(e));
    }
  });

  ipcMain.handle('session:end', async (_event, args: { session_id: string }) => {
    try {
      const session = getSession(args.session_id);
      if (!session) return err('Session not found');

      // Auto-delete sessions shorter than 30 seconds — nothing meaningful happened
      const durationMs = Date.now() - session.started_at;
      if (durationMs < 30_000) {
        stopTracking();
        deleteSession(args.session_id);
        setTraySession(null);
        return ok(null); // null signals "deleted, not completed" to renderer
      }

      stopTracking();
      endSession(args.session_id);

      // Build activity blocks from raw events
      const events = getEventsBySession(args.session_id);
      const updatedSession = getSession(args.session_id)!;
      const blocks = groupEventsIntoBlocks(events, args.session_id, session.goal);
      upsertActivityBlocks(blocks);

      // Vision snapshot at session end (works with Ollama or cloud providers)
      const settings = getAllSettings();
      if (settings.vision_enabled && settings.vision_model) {
        try {
          const screenshot = await takeScreenshot();
          if (screenshot) {
            const description = await analyzeScreenshot(settings, screenshot.data, screenshot.mimeType);
            if (description) {
              addVisionSnapshot(args.session_id, `[Session end] ${description}`);
            }
          }
        } catch (visionErr) {
          console.warn('[IPC] Vision snapshot at session end failed (non-fatal):', visionErr);
        }
      }

      setTraySession(null);
      return ok(updatedSession);
    } catch (e) {
      console.error('[IPC] session:end error:', e);
      return err(String(e));
    }
  });

  ipcMain.handle('session:current', async () => {
    try {
      const session = getActiveSession();
      return ok(session);
    } catch (e) {
      return err(String(e));
    }
  });

  ipcMain.handle('session:get', async (_event, args: { session_id: string }) => {
    try {
      const session = getSession(args.session_id);
      return ok(session);
    } catch (e) {
      return err(String(e));
    }
  });

  ipcMain.handle('sessions:list', async () => {
    try {
      const sessions = listSessions();
      return ok(sessions);
    } catch (e) {
      return err(String(e));
    }
  });

  ipcMain.handle('session:toggle-excluded', async (_event, args: { session_id: string; excluded: boolean }) => {
    try {
      setSessionExcluded(args.session_id, args.excluded);
      const session = getSession(args.session_id);
      return ok(session);
    } catch (e) {
      return err(String(e));
    }
  });

  // ─── Report handler ────────────────────────────────────────────────────────

  ipcMain.handle('session:report', async (_event, args: { session_id: string; force_refresh?: boolean }) => {
    try {
      const session = getSession(args.session_id);
      if (!session) return err('Session not found');

      // Return cached report if available (and not forcing refresh)
      if (!args.force_refresh && session.report_json) {
        try {
          const cached = JSON.parse(session.report_json);
          const report: SessionReport = { ...cached, session };
          return ok(report);
        } catch {
          // Corrupted cache — fall through to regenerate
        }
      }

      const blocks = getBlocksBySession(args.session_id);
      const reportBase = computeSessionReport(session, blocks);
      const settings = getAllSettings();

      let llm_summary: string | undefined;
      let coaching_suggestions: string[] | undefined;
      let ai_provider_used: string | undefined;
      const vision_snapshots = getVisionSnapshots(args.session_id);

      if (settings.enable_llm) {
        try {
          const result = await generateSessionSummary(settings, reportBase, vision_snapshots.length > 0 ? vision_snapshots : undefined);
          if (result) {
            llm_summary = result.summary;
            coaching_suggestions = result.suggestions;
            ai_provider_used = result.provider;
          }
        } catch (llmErr) {
          console.warn('[IPC] LLM enrichment failed (non-fatal):', llmErr);
        }
      }

      const report: SessionReport = {
        ...reportBase,
        llm_summary,
        coaching_suggestions,
        vision_snapshots: vision_snapshots.length > 0 ? vision_snapshots : undefined,
        ai_provider_used,
      };

      // Cache the report (store without the session field to avoid duplication)
      const { session: _s, ...reportWithoutSession } = report;
      try {
        setCachedReport(args.session_id, JSON.stringify(reportWithoutSession));
      } catch (cacheErr) {
        console.warn('[IPC] Failed to cache report (non-fatal):', cacheErr);
      }

      return ok(report);
    } catch (e) {
      console.error('[IPC] session:report error:', e);
      return err(String(e));
    }
  });

  // ─── Vision snapshot (on-demand) ───────────────────────────────────────────

  ipcMain.handle('session:vision-snapshot', async (_event, args: { session_id: string }) => {
    try {
      const settings = getAllSettings();
      if (!settings.vision_enabled || !settings.vision_model) {
        return err('Vision not enabled or no vision model configured');
      }
      const screenshot = await takeScreenshot();
      if (!screenshot) return err('Failed to capture screenshot');

      const description = await analyzeScreenshot(settings, screenshot.data, screenshot.mimeType);
      if (!description) return err('Vision model returned no description');

      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      addVisionSnapshot(args.session_id, `[${timestamp}] ${description}`);
      return ok(description);
    } catch (e) {
      return err(String(e));
    }
  });

  // ─── Activity handlers ─────────────────────────────────────────────────────

  ipcMain.handle('activity:current', async () => {
    try {
      const activity = getCurrentActivity();
      return ok(activity);
    } catch (e) {
      return err(String(e));
    }
  });

  // ─── Settings handlers ─────────────────────────────────────────────────────

  ipcMain.handle('settings:get', async () => {
    try {
      const settings = getAllSettings();
      return ok(settings);
    } catch (e) {
      return err(String(e));
    }
  });

  ipcMain.handle('settings:set', async (_event, args: Record<string, unknown>) => {
    try {
      for (const [key, value] of Object.entries(args)) {
        setSetting(key, value);
      }
      invalidateSettingsCache();
      return ok(getAllSettings());
    } catch (e) {
      return err(String(e));
    }
  });

  // ─── Classification handlers ───────────────────────────────────────────────

  ipcMain.handle('classifications:list', async () => {
    try {
      return ok(getAllClassifications());
    } catch (e) {
      return err(String(e));
    }
  });

  ipcMain.handle('classifications:upsert', async (_event, args) => {
    try {
      const result = upsertClassification(args);
      invalidateClassificationCache();
      return ok(result);
    } catch (e) {
      return err(String(e));
    }
  });

  ipcMain.handle('classifications:delete', async (_event, args: { id: number }) => {
    try {
      deleteClassification(args.id);
      invalidateClassificationCache();
      return ok(true);
    } catch (e) {
      return err(String(e));
    }
  });

  // ─── Day Plan handlers ─────────────────────────────────────────────────────

  ipcMain.handle('dayplan:get', async (_event, args: { date: string }) => {
    try {
      return ok(getDayPlan(args.date));
    } catch (e) { return err(String(e)); }
  });

  ipcMain.handle('dayplan:set', async (_event, args: Omit<DayPlan, 'created_at' | 'updated_at'>) => {
    try {
      const plan = upsertDayPlan({ ...args, id: args.id || uuidv4() });
      return ok(plan);
    } catch (e) { return err(String(e)); }
  });

  // ─── Stats handlers ────────────────────────────────────────────────────────

  ipcMain.handle('stats:day', async (_event, args: { date: string }) => {
    try {
      return ok(getDayStats(args.date));
    } catch (e) { return err(String(e)); }
  });

  ipcMain.handle('stats:week', async (_event, args: { end_date: string }) => {
    try {
      return ok(getWeekStats(args.end_date));
    } catch (e) { return err(String(e)); }
  });

  ipcMain.handle('stats:streak', async () => {
    try {
      return ok(getStreakInfo());
    } catch (e) { return err(String(e)); }
  });

  ipcMain.handle('stats:top-apps', async (_event, args: { days?: number }) => {
    try {
      return ok(getTopAppsAllTime(args.days ?? 30));
    } catch (e) { return err(String(e)); }
  });

  ipcMain.handle('stats:top-distractions', async (_event, args: { days?: number }) => {
    try {
      return ok(getTopDistractionsAllTime(args.days ?? 30));
    } catch (e) { return err(String(e)); }
  });

  // ─── Flow periods for a session ────────────────────────────────────────────

  ipcMain.handle('session:flow-periods', async (_event, args: { session_id: string }) => {
    try {
      const blocks = getBlocksBySession(args.session_id);
      const periods = computeFlowPeriods(blocks);
      const flowSeconds = periods.reduce((a, p) => a + p.duration_seconds, 0);
      return ok({ periods, flow_seconds: flowSeconds });
    } catch (e) { return err(String(e)); }
  });

  // ─── AI/LLM status handler ────────────────────────────────────────────────

  ipcMain.handle('llm:status', async () => {
    try {
      const settings = getAllSettings();
      const status = await checkAiStatus(settings);
      return ok({
        is_running: status.is_running,
        is_configured: status.is_configured,
        provider: status.provider,
        models: status.models,
        endpoint: settings.ollama_endpoint,
        message: status.message,
      });
    } catch (e) {
      return ok({
        is_running: false,
        is_configured: false,
        provider: 'ollama',
        models: [],
        endpoint: '',
        message: String(e),
      });
    }
  });
}
