import { ipcMain } from 'electron';
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
} from '../database/db';
import { startTracking, stopTracking, getCurrentActivity } from '../tracking/activityTracker';
import { groupEventsIntoBlocks, computeSessionReport } from '../analytics/sessionAnalyzer';
import {
  checkOllamaStatus,
  listOllamaModels,
  generate,
  buildSummaryPrompt,
  parseLlmResponse,
} from '../llm/ollamaClient';
import { invalidateClassificationCache } from '../analytics/distractionClassifier';
import type { IpcResponse, Session, SessionReport } from '../../shared/types';

// Helper to wrap handler responses
function ok<T>(data: T): IpcResponse<T> {
  return { success: true, data };
}
function err(error: string): IpcResponse<never> {
  return { success: false, error };
}

export function registerIpcHandlers(): void {
  // ─── Session handlers ──────────────────────────────────────────────────────

  ipcMain.handle('session:start', async (_event, args: { title: string; goal: string; target_duration?: number }) => {
    try {
      // End any existing active session first
      const existing = getActiveSession();
      if (existing) {
        endSession(existing.id);
        stopTracking();
      }

      const id = uuidv4();
      const session = createSession(id, args.title, args.goal, args.target_duration);
      startTracking(id);
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

      stopTracking();
      endSession(args.session_id);

      // Build activity blocks from raw events
      const events = getEventsBySession(args.session_id);
      const updatedSession = getSession(args.session_id)!;
      const blocks = groupEventsIntoBlocks(events, args.session_id, session.goal);
      upsertActivityBlocks(blocks);

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

  // ─── Report handler ────────────────────────────────────────────────────────

  ipcMain.handle('session:report', async (_event, args: { session_id: string }) => {
    try {
      const session = getSession(args.session_id);
      if (!session) return err('Session not found');

      const blocks = getBlocksBySession(args.session_id);
      const reportBase = computeSessionReport(session, blocks);

      // Try LLM enrichment if enabled
      const settings = getAllSettings();
      let llm_summary: string | undefined;
      let coaching_suggestions: string[] | undefined;

      if (settings.enable_llm) {
        try {
          const isUp = await checkOllamaStatus(settings.ollama_endpoint);
          if (isUp) {
            const prompt = buildSummaryPrompt(reportBase);
            const response = await generate(
              settings.ollama_endpoint,
              settings.ollama_model,
              prompt
            );
            if (response) {
              const parsed = parseLlmResponse(response);
              llm_summary = parsed.summary;
              coaching_suggestions = parsed.suggestions;
            }
          }
        } catch (llmErr) {
          console.warn('[IPC] LLM enrichment failed (non-fatal):', llmErr);
        }
      }

      const report: SessionReport = {
        ...reportBase,
        llm_summary,
        coaching_suggestions,
      };

      return ok(report);
    } catch (e) {
      console.error('[IPC] session:report error:', e);
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

  // ─── LLM handlers ─────────────────────────────────────────────────────────

  ipcMain.handle('llm:status', async () => {
    try {
      const settings = getAllSettings();
      const isUp = await checkOllamaStatus(settings.ollama_endpoint);
      const models = isUp ? await listOllamaModels(settings.ollama_endpoint) : [];
      return ok({ is_running: isUp, models, endpoint: settings.ollama_endpoint });
    } catch (e) {
      return ok({ is_running: false, models: [], endpoint: '' });
    }
  });

  ipcMain.handle('llm:generate', async (_event, args: { prompt: string }) => {
    try {
      const settings = getAllSettings();
      const response = await generate(settings.ollama_endpoint, settings.ollama_model, args.prompt);
      return ok(response);
    } catch (e) {
      return err(String(e));
    }
  });
}
