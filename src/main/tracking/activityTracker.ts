/**
 * Activity Tracker — smart polling engine.
 *
 * Performance design:
 *  • screencapture CLI (subprocess) replaces desktopCapturer to avoid blocking
 *    the Electron main thread and causing Mac freezes.
 *  • macosTracker uses powerMonitor + unified AppleScript (see macosTracker.ts).
 *  • Post-idle cooldown: 30 s after returning from idle before any vision capture,
 *    so the burst of context-change events on resumption doesn't trigger back-to-back
 *    expensive vision model calls (eliminates the "lag after idle" feeling).
 *  • Baseline screenshots every 3 minutes — still captures stable work well.
 *  • DB writes deduplicated: write on change + heartbeat every 5 polls (~15 s).
 *  • Settings cached 60 s so the poll loop never hits the DB for config.
 */

import { BrowserWindow, Notification, systemPreferences } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
import { captureActivity } from './macosTracker';
import { insertActivityEvent, getAllSettings, addVisionSnapshot } from '../database/db';
import { classifyActivity } from '../analytics/distractionClassifier';
import { analyzeScreenshot } from '../llm/aiClient';
import { fetchUrlMetadata, parseAppContext, buildContextSummary } from './activityEnricher';
import type { CurrentActivity, PageMetadata } from '../../shared/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISTRACTION_NOTIFY_POLLS     = 20;          // polls × interval ≈ 60 s
const FLOW_THRESHOLD_SECONDS       = 25 * 60;
const NOTIFICATION_COOLDOWN_MS     = 5 * 60 * 1000;
const SCREENSHOT_MIN_INTERVAL_MS   = 8_000;
const SCREENSHOT_BASELINE_MS       = 180_000;     // 3 minutes
const POST_IDLE_VISION_COOLDOWN_MS = 30_000;      // 30 s after resuming from idle

// ─── Settings cache ───────────────────────────────────────────────────────────

const SETTINGS_CACHE_TTL_MS = 60_000;
let _cachedSettings: ReturnType<typeof getAllSettings> | null = null;
let _settingsCachedAt = 0;

function getCachedSettings(): ReturnType<typeof getAllSettings> {
  const now = Date.now();
  if (!_cachedSettings || now - _settingsCachedAt > SETTINGS_CACHE_TTL_MS) {
    _cachedSettings   = getAllSettings();
    _settingsCachedAt = now;
  }
  return _cachedSettings;
}

export function invalidateSettingsCache(): void {
  _cachedSettings = null;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface TrackerState {
  isRunning:        boolean;
  sessionId:        string | null;
  intervalHandle:   ReturnType<typeof setInterval> | null;
  lastActivity:     CurrentActivity | null;
  sessionStartedAt: number | null;

  consecutiveDistractionPolls: number;
  lastNotificationAt:          number | null;

  consecutiveFocusSeconds: number;
  inFlow:                  boolean;
  flowStartedAt:           number | null;

  lastContextKey:    string;
  lastScreenshotAt:  number;
  visionPending:     boolean;
  lastVisionDescription: string | null;

  lastFetchedUrl: string | null;
  lastMetadata:   PageMetadata | null;

  lastWrittenKey:     string;
  unchangedPollCount: number;

  wasIdleLastPoll: boolean;
  idleResumedAt:   number | null;
  lastIdleSeconds: number;

  // Live accumulated stats for real-time display
  liveFocusSeconds:      number;
  liveDistractedSeconds: number;
  liveIdleSeconds:       number;
  liveContextSwitches:   number;
  liveLastNonIdleApp:    string | null;
}

const state: TrackerState = {
  isRunning:        false,
  sessionId:        null,
  intervalHandle:   null,
  lastActivity:     null,
  sessionStartedAt: null,

  consecutiveDistractionPolls: 0,
  lastNotificationAt:          null,

  consecutiveFocusSeconds: 0,
  inFlow:                  false,
  flowStartedAt:           null,

  lastContextKey:       '',
  lastScreenshotAt:     0,
  visionPending:        false,
  lastVisionDescription: null,

  lastFetchedUrl: null,
  lastMetadata:   null,

  lastWrittenKey:     '',
  unchangedPollCount: 0,

  wasIdleLastPoll: false,
  idleResumedAt:   null,
  lastIdleSeconds: 0,

  liveFocusSeconds:      0,
  liveDistractedSeconds: 0,
  liveIdleSeconds:       0,
  liveContextSwitches:   0,
  liveLastNonIdleApp:    null,
};

// ─── CPU load check ───────────────────────────────────────────────────────────

function isCpuOverloaded(): boolean {
  // Skip vision when system load is high to prevent Mac from freezing
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  return loadAvg / cpuCount > 0.75;
}

// ─── Screenshot via CLI (avoids blocking main thread) ─────────────────────────
//
// Uses screencapture CLI in a subprocess so it never blocks the Electron
// main thread. This replaces desktopCapturer which caused Mac freezes.

async function takeScreenshot(): Promise<{ data: string; mimeType: 'image/png' } | null> {
  // Check screen recording permission WITHOUT prompting.
  // 'not-determined' or 'denied' → skip silently. Only 'granted' proceeds.
  // This prevents repeated permission pop-ups when the user hasn't granted access.
  const screenStatus = systemPreferences.getMediaAccessStatus('screen');
  if (screenStatus !== 'granted') {
    return null;
  }
  if (isCpuOverloaded()) {
    console.log('[Vision] CPU overloaded - skipping screenshot');
    return null;
  }
  const tmp = `/tmp/fs-${Date.now()}.png`;
  try {
    await execAsync(`screencapture -x -m -t png "${tmp}"`, { timeout: 4_000 });
    await execAsync(`sips -Z 720 "${tmp}" --out "${tmp}"`, { timeout: 3_000 });
    const { stdout } = await execAsync(`base64 -i "${tmp}"`, { timeout: 2_000 });
    execAsync(`rm -f "${tmp}"`).catch(() => {});
    return { data: stdout.trim(), mimeType: 'image/png' };
  } catch {
    execAsync(`rm -f "${tmp}"`).catch(() => {});
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startTracking(sessionId: string): void {
  if (state.isRunning) stopTracking();

  const settings = getAllSettings();

  Object.assign(state, {
    isRunning:       true,
    sessionId,
    sessionStartedAt: Date.now(),
    consecutiveDistractionPolls: 0,
    lastNotificationAt:          null,
    consecutiveFocusSeconds:     0,
    inFlow:                      false,
    flowStartedAt:               null,
    lastContextKey:              '',
    lastScreenshotAt:            0,
    visionPending:               false,
    lastVisionDescription:       null,
    lastFetchedUrl:              null,
    lastMetadata:                null,
    lastWrittenKey:              '',
    unchangedPollCount:          0,
    wasIdleLastPoll:             false,
    idleResumedAt:               null,
    lastIdleSeconds:             0,
    liveFocusSeconds:            0,
    liveDistractedSeconds:       0,
    liveIdleSeconds:             0,
    liveContextSwitches:         0,
    liveLastNonIdleApp:          null,
  });

  console.log(`[Tracker] Starting session ${sessionId}`);
  console.log(`[Tracker] Poll: ${settings.tracking_interval_ms} ms | Vision: ${settings.vision_enabled ? settings.vision_model : 'off'}`);
  console.log('[Tracker] Screenshot engine: screencapture CLI (subprocess, non-blocking)');

  poll(sessionId);
  state.intervalHandle = setInterval(
    () => poll(sessionId),
    settings.tracking_interval_ms,
  );
}

export function stopTracking(): void {
  if (state.intervalHandle !== null) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
  Object.assign(state, {
    isRunning:     false,
    sessionId:     null,
    lastActivity:  null,
    sessionStartedAt: null,
    consecutiveDistractionPolls: 0,
    lastNotificationAt:          null,
    lastContextKey:              '',
    lastScreenshotAt:            0,
    visionPending:               false,
    lastVisionDescription:       null,
    lastFetchedUrl:              null,
    lastMetadata:                null,
    lastWrittenKey:              '',
    unchangedPollCount:          0,
    wasIdleLastPoll:             false,
    idleResumedAt:               null,
    lastIdleSeconds:             0,
    liveFocusSeconds:            0,
    liveDistractedSeconds:       0,
    liveIdleSeconds:             0,
    liveContextSwitches:         0,
    liveLastNonIdleApp:          null,
  });
  console.log('[Tracker] Stopped');
}

export function getCurrentActivity(): CurrentActivity | null {
  return state.lastActivity;
}

// ─── Tray callback ────────────────────────────────────────────────────────────

type ActivityCallback = (activity: CurrentActivity | null) => void;
let _activityCallback: ActivityCallback | null = null;

export function registerActivityCallback(cb: ActivityCallback): () => void {
  _activityCallback = cb;
  return () => { _activityCallback = null; };
}

// ─── Async vision pipeline ────────────────────────────────────────────────────

function captureAndAnalyzeAsync(sessionId: string, trigger: 'context-change' | 'baseline'): void {
  state.visionPending    = true;
  state.lastScreenshotAt = Date.now();

  (async () => {
    try {
      const shot = await takeScreenshot();
      if (!shot) return;

      // Guard: abort if session ended or changed while screenshot was being taken
      if (!state.isRunning || state.sessionId !== sessionId) return;

      const settings = getCachedSettings();
      if (!settings.vision_enabled || !settings.vision_model) return;

      const description = await analyzeScreenshot(settings, shot.data, shot.mimeType as 'image/png' | 'image/jpeg');
      if (!description) return;

      // Guard again after the (potentially slow) LLM call
      if (!state.isRunning || state.sessionId !== sessionId) return;

      state.lastVisionDescription = description;
      const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      addVisionSnapshot(sessionId, `[${time} · ${trigger}] ${description}`);
      console.log(`[Vision] ${trigger} → ${description.slice(0, 80)}…`);
    } catch (err) {
      console.warn('[Vision] Pipeline error (non-fatal):', err);
    } finally {
      state.visionPending = false;
    }
  })().catch((err) => console.error('[Vision] Unexpected rejection:', err));
}

// ─── Main poll ────────────────────────────────────────────────────────────────

async function poll(sessionId: string): Promise<void> {
  try {
    const settings = getCachedSettings();
    const raw      = await captureActivity(settings.idle_threshold_seconds, settings.enable_browser_tracking);

    // ── Idle-resumption tracking ─────────────────────────────────────────────
    const wasIdle = state.wasIdleLastPoll;
    state.wasIdleLastPoll = raw.is_idle;
    if (wasIdle && !raw.is_idle) {
      state.idleResumedAt = Date.now();
      console.log('[Tracker] Resumed from idle — 30 s vision cooldown active');
    }

    // ── Idle seconds tracking (for accurate idle detection) ──────────────────
    state.lastIdleSeconds = raw.idle_seconds ?? 0;

    // Reset flow if idle for more than 5 minutes — otherwise a 2-hour sleep would
    // leave the user "in flow" when they return, which is clearly wrong.
    if (raw.is_idle && (raw.idle_seconds ?? 0) > 300) {
      if (state.inFlow) {
        console.log(`[Flow] Exited — idle for ${Math.round((raw.idle_seconds ?? 0) / 60)} min`);
      }
      state.consecutiveFocusSeconds = 0;
      state.inFlow        = false;
      state.flowStartedAt = null;
    }

    // ── DB write (deduplicated) ──────────────────────────────────────────────
    const eventKey       = `${raw.app_name}::${raw.window_title}::${raw.browser_domain}::${raw.is_idle ? 1 : 0}`;
    const activityChanged = eventKey !== state.lastWrittenKey;
    if (activityChanged) {
      state.unchangedPollCount = 0;
      state.lastWrittenKey     = eventKey;
    } else {
      state.unchangedPollCount++;
    }
    if (activityChanged || state.unchangedPollCount % 5 === 0) {
      insertActivityEvent({
        session_id:     sessionId,
        timestamp:      Date.now(),
        app_name:       raw.app_name,
        window_title:   raw.window_title,
        browser_domain: raw.browser_domain,
        is_idle:        raw.is_idle ? 1 : 0,
      });
    }

    // ── Classification ───────────────────────────────────────────────────────
    const classification = classifyActivity(
      raw.app_name, raw.browser_domain, raw.window_title, raw.is_idle,
    );

    // ── Live stats accumulation ──────────────────────────────────────────────
    // Accumulate per-poll so the renderer can show a real-time focus score
    // and breakdown without waiting for the session to end.
    const pollSec = settings.tracking_interval_ms / 1000;
    if (raw.is_idle) {
      state.liveIdleSeconds += pollSec;
    } else if (classification === 'productive') {
      state.liveFocusSeconds += pollSec;
    } else if (classification === 'distracting') {
      state.liveDistractedSeconds += pollSec;
    }
    // Count non-idle app transitions as context switches
    if (!raw.is_idle && raw.app_name) {
      if (state.liveLastNonIdleApp !== null && state.liveLastNonIdleApp !== raw.app_name) {
        state.liveContextSwitches++;
      }
      state.liveLastNonIdleApp = raw.app_name;
    }

    // ── Context enrichment ───────────────────────────────────────────────────
    const appContext = raw.browser_domain
      ? null
      : parseAppContext(raw.app_name, raw.window_title);

    if (!raw.is_idle && raw.browser_url && raw.browser_url !== state.lastFetchedUrl) {
      fetchUrlMetadata(raw.browser_url)
        .then((meta) => { state.lastMetadata = meta; state.lastFetchedUrl = raw.browser_url; })
        .catch(() => { /* non-fatal */ });
    }
    const metadata = (raw.browser_url === state.lastFetchedUrl) ? state.lastMetadata : null;

    const context_summary = buildContextSummary({
      appName: raw.app_name, domain: raw.browser_domain,
      windowTitle: raw.window_title, fullUrl: raw.browser_url,
      appContext, metadata,
    });

    // ── Vision trigger ───────────────────────────────────────────────────────
    const now         = Date.now();
    const contextKey  = [
      raw.app_name,
      raw.browser_url ?? raw.browser_domain,
      raw.browser_domain ? null : raw.window_title,
    ].join('::');

    const contextSwitched  = contextKey !== state.lastContextKey && contextKey !== '::';
    const baselineExpired  = (now - state.lastScreenshotAt) >= SCREENSHOT_BASELINE_MS;
    const minIntervalOk    = (now - state.lastScreenshotAt) >= SCREENSHOT_MIN_INTERVAL_MS;
    const postIdleCooldown = state.idleResumedAt
      ? (now - state.idleResumedAt) < POST_IDLE_VISION_COOLDOWN_MS
      : false;
    if (
      !raw.is_idle         &&
      !state.visionPending &&
      !postIdleCooldown    &&
      settings.vision_enabled &&
      settings.vision_model   &&
      (contextSwitched || baselineExpired) &&
      minIntervalOk
    ) {
      captureAndAnalyzeAsync(sessionId, contextSwitched ? 'context-change' : 'baseline');
    }

    if (contextSwitched) state.lastContextKey = contextKey;

    // ── Flow state ───────────────────────────────────────────────────────────
    const pollIntervalSec = settings.tracking_interval_ms / 1000;
    if (classification === 'productive') {
      state.consecutiveFocusSeconds += pollIntervalSec;
      if (!state.inFlow && state.consecutiveFocusSeconds >= FLOW_THRESHOLD_SECONDS) {
        state.inFlow        = true;
        state.flowStartedAt = now - state.consecutiveFocusSeconds * 1000;
        console.log(`[Flow] Entered after ${Math.round(state.consecutiveFocusSeconds / 60)} min`);
      }
    } else if (classification !== 'idle') {
      if (state.inFlow) console.log(`[Flow] Exited — ${Math.round(state.consecutiveFocusSeconds / 60)} min`);
      state.consecutiveFocusSeconds = 0;
      state.inFlow        = false;
      state.flowStartedAt = null;
    }

    // ── Build activity ───────────────────────────────────────────────────────
    const elapsed  = state.sessionStartedAt ? Math.floor((now - state.sessionStartedAt) / 1000) : 0;
    const activity: CurrentActivity = {
      app_name:       raw.app_name,
      window_title:   raw.window_title,
      browser_domain: raw.browser_domain,
      full_url:       raw.browser_url,
      is_idle:        raw.is_idle,
      classification,
      session_elapsed_seconds: elapsed,
      app_context:             appContext ?? undefined,
      page_metadata:           metadata  ?? undefined,
      context_summary,
      last_vision_description: state.lastVisionDescription ?? undefined,
      in_flow:               state.inFlow,
      flow_duration_seconds: state.inFlow ? Math.round(state.consecutiveFocusSeconds) : undefined,
      // Live stats — drives real-time score + breakdown in ActiveSessionPage
      live_focus_seconds:      Math.round(state.liveFocusSeconds),
      live_distracted_seconds: Math.round(state.liveDistractedSeconds),
      live_idle_seconds:       Math.round(state.liveIdleSeconds),
      live_context_switches:   state.liveContextSwitches,
      focus_streak_seconds:    Math.round(state.consecutiveFocusSeconds),
    };

    state.lastActivity = activity;

    // ── Distraction notification ─────────────────────────────────────────────
    if (classification === 'distracting') {
      state.consecutiveDistractionPolls++;
      if (state.consecutiveDistractionPolls >= DISTRACTION_NOTIFY_POLLS) {
        const cooledDown = !state.lastNotificationAt ||
          (now - state.lastNotificationAt) >= NOTIFICATION_COOLDOWN_MS;
        if (settings.enable_focus_notifications && cooledDown && Notification.isSupported()) {
          const what = raw.browser_domain ?? raw.app_name ?? 'a distracting site';
          const mins = Math.round((state.consecutiveDistractionPolls * settings.tracking_interval_ms) / 60_000);
          new Notification({
            title: "You're off track",
            body:  `${what} for ~${mins} min. Time to refocus.`,
          }).show();
          state.lastNotificationAt          = now;
          state.consecutiveDistractionPolls = 0;
        }
      }
    } else {
      state.consecutiveDistractionPolls = 0;
    }

    // ── Broadcast ────────────────────────────────────────────────────────────
    _activityCallback?.(activity);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed()) return;
      try { win.webContents.send('activity:update', activity); } catch { /* window destroyed mid-send */ }
    });
  } catch (err) {
    console.error('[Tracker] Poll error:', err);
  }
}
