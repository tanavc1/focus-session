/**
 * Activity Tracker
 * ────────────────
 * Polls macOS for the active app/URL every N seconds and enriches each
 * snapshot with structured context (file/project names, page metadata, etc.).
 *
 * Smart screenshot strategy — NO configurable interval:
 *   • Event-driven  : screenshot fires when the context changes (new app,
 *                     domain, or file) with a 5-second minimum between shots.
 *   • 60-second baseline : even when context is stable, we take a fresh
 *                     screenshot every 60 s to keep the vision model current.
 *   • Fully async   : screenshot + vision-model analysis never blocks the
 *                     poll loop. Results land in state and appear in the
 *                     next poll's activity broadcast.
 */

import { BrowserWindow, Notification } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { captureActivity } from './macosTracker';
import { insertActivityEvent, getAllSettings, addVisionSnapshot } from '../database/db';
import { classifyActivity } from '../analytics/distractionClassifier';
import { analyzeScreenshot } from '../llm/aiClient';
import {
  fetchUrlMetadata,
  parseAppContext,
  buildContextSummary,
} from './activityEnricher';
import type { CurrentActivity, PageMetadata } from '../../shared/types';

const execAsync = promisify(exec);

// ─── Constants ────────────────────────────────────────────────────────────────

/** Consecutive distracting polls before sending a focus notification. 3 s × 20 = ~60 s. */
const DISTRACTION_NOTIFY_POLLS = 20;
/** Seconds of continuous productive activity = flow state. */
const FLOW_THRESHOLD_SECONDS   = 25 * 60; // 25 minutes
/** Minimum ms between focus notifications (5 minutes). */
const NOTIFICATION_COOLDOWN_MS   = 5 * 60 * 1000;
/** Minimum ms between any two screenshots (event-driven rate-limit). */
const SCREENSHOT_MIN_INTERVAL_MS = 5_000;
/** Maximum ms before we force a baseline screenshot even with no context change. */
const SCREENSHOT_BASELINE_MS     = 180_000;

// ─── Settings cache ───────────────────────────────────────────────────────────
// Avoid a DB read on every 3-second poll.
const SETTINGS_CACHE_TTL_MS = 60_000; // re-read settings at most every 60 s
let _cachedSettings: ReturnType<typeof getAllSettings> | null = null;
let _settingsCachedAt = 0;

function getCachedSettings(): ReturnType<typeof getAllSettings> {
  const now = Date.now();
  if (!_cachedSettings || now - _settingsCachedAt > SETTINGS_CACHE_TTL_MS) {
    _cachedSettings  = getAllSettings();
    _settingsCachedAt = now;
  }
  return _cachedSettings;
}

/** Call this when the user saves settings so the next poll uses fresh values. */
export function invalidateSettingsCache(): void {
  _cachedSettings = null;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface TrackerState {
  isRunning:      boolean;
  sessionId:      string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastActivity:   CurrentActivity | null;
  sessionStartedAt: number | null;

  // Focus-notification counters
  consecutiveDistractionPolls: number;
  lastNotificationAt:          number | null;

  // Flow state
  consecutiveFocusSeconds: number;
  inFlow:                  boolean;
  flowStartedAt:           number | null;

  // Context-change detection (determines when to take a screenshot)
  lastContextKey: string;

  // Vision / screenshot pipeline
  lastScreenshotAt:     number;   // epoch ms of last screenshot taken
  visionPending:        boolean;  // true while a screenshot+analysis is in flight
  lastVisionDescription: string | null;

  // URL metadata (fire-and-forget, cached in activityEnricher)
  lastFetchedUrl: string | null;
  lastMetadata:   PageMetadata | null;

  // Raw-event write deduplication (heartbeat every 5 unchanged polls)
  lastWrittenKey:        string;
  unchangedPollCount:    number;
}

const state: TrackerState = {
  isRunning:      false,
  sessionId:      null,
  intervalHandle: null,
  lastActivity:   null,
  sessionStartedAt: null,

  consecutiveDistractionPolls: 0,
  lastNotificationAt:          null,

  consecutiveFocusSeconds: 0,
  inFlow:                  false,
  flowStartedAt:           null,

  lastContextKey: '',

  lastScreenshotAt:      0,
  visionPending:         false,
  lastVisionDescription: null,

  lastFetchedUrl: null,
  lastMetadata:   null,

  lastWrittenKey:        '',
  unchangedPollCount:    0,
};

// ─── Screenshot helper ────────────────────────────────────────────────────────

async function takeScreenshot(): Promise<string | null> {
  const tmp = `/tmp/focus-vision-${Date.now()}.png`;
  try {
    await execAsync(`screencapture -x -m -t png "${tmp}"`,    { timeout: 5_000 });
    await execAsync(`sips -Z 800 "${tmp}" --out "${tmp}"`,    { timeout: 3_000 });
    const { stdout } = await execAsync(`base64 -i "${tmp}"`,  { timeout: 3_000 });
    await execAsync(`rm -f "${tmp}"`);
    return stdout.trim();
  } catch (err) {
    console.warn('[Vision] Screenshot failed:', err);
    try { await execAsync(`rm -f "${tmp}"`); } catch { /* ignore */ }
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startTracking(sessionId: string): void {
  if (state.isRunning) stopTracking();

  const settings = getAllSettings();

  state.isRunning       = true;
  state.sessionId       = sessionId;
  state.sessionStartedAt = Date.now();

  // Reset all runtime state
  state.consecutiveDistractionPolls = 0;
  state.lastNotificationAt          = null;

  state.consecutiveFocusSeconds = 0;
  state.inFlow                  = false;
  state.flowStartedAt           = null;

  state.lastContextKey = '';
  state.lastScreenshotAt = 0;
  state.visionPending               = false;
  state.lastVisionDescription       = null;
  state.lastFetchedUrl              = null;
  state.lastMetadata                = null;

  console.log(`[Tracker] Starting session ${sessionId}`);
  console.log(`[Tracker] Poll interval: ${settings.tracking_interval_ms} ms`);
  console.log(`[Tracker] Vision: ${settings.vision_enabled ? `enabled (${settings.vision_model})` : 'disabled'}`);
  console.log('[Tracker] Screenshot mode: event-driven (context change) + 60 s baseline');

  // Immediate first poll, then on interval
  poll(sessionId, settings.idle_threshold_seconds, settings.enable_browser_tracking);
  state.intervalHandle = setInterval(
    () => poll(sessionId, settings.idle_threshold_seconds, settings.enable_browser_tracking),
    settings.tracking_interval_ms,
  );
}

export function stopTracking(): void {
  if (state.intervalHandle !== null) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
  state.isRunning       = false;
  state.sessionId       = null;
  state.lastActivity    = null;
  state.sessionStartedAt = null;

  state.consecutiveDistractionPolls = 0;
  state.lastNotificationAt          = null;
  state.lastContextKey              = '';
  state.lastScreenshotAt            = 0;
  state.visionPending               = false;
  state.lastVisionDescription       = null;
  state.lastFetchedUrl              = null;
  state.lastMetadata                = null;
  state.lastWrittenKey              = '';
  state.unchangedPollCount          = 0;

  console.log('[Tracker] Stopped');
}

export function getCurrentActivity(): CurrentActivity | null {
  return state.lastActivity;
}

// ─── Activity update callback (for main-process consumers, e.g. tray) ─────────

type ActivityCallback = (activity: CurrentActivity | null) => void;
let _activityCallback: ActivityCallback | null = null;

export function registerActivityCallback(cb: ActivityCallback): () => void {
  _activityCallback = cb;
  return () => { _activityCallback = null; };
}

// ─── Async vision pipeline ────────────────────────────────────────────────────

/**
 * Take a screenshot and run vision analysis in the background.
 * Stores the text description in state; never blocks the poll loop.
 */
function captureAndAnalyzeAsync(sessionId: string, trigger: 'context-change' | 'baseline'): void {
  state.visionPending    = true;
  state.lastScreenshotAt = Date.now();

  (async () => {
    try {
      const screenshot = await takeScreenshot();
      if (!screenshot) return;

      const settings = getCachedSettings();
      if (!settings.vision_enabled || !settings.vision_model) return;

      const description = await analyzeScreenshot(settings, screenshot);
      if (!description) return;

      state.lastVisionDescription = description;

      const time  = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const label = `[${time} · ${trigger}] ${description}`;
      addVisionSnapshot(sessionId, label);

      console.log(`[Vision] ${trigger} → ${description.slice(0, 90)}…`);
    } catch (err) {
      console.warn('[Vision] Async pipeline error (non-fatal):', err);
    } finally {
      state.visionPending = false;
    }
  })();
}

// ─── Main poll ────────────────────────────────────────────────────────────────

async function poll(
  sessionId:             string,
  idleThresholdSeconds:  number,
  enableBrowserTracking: boolean,
): Promise<void> {
  try {
    const settings = getCachedSettings();
    const raw = await captureActivity(idleThresholdSeconds, enableBrowserTracking);

    // ── Persist raw event (deduplicated) ─────────────────────────────────────
    // Write on every context change, then once per 5 polls (15 s heartbeat)
    // when activity is stable. This keeps block-duration accuracy within ±15 s
    // while cutting DB writes by ~80% during steady work.
    const eventKey = `${raw.app_name}::${raw.window_title}::${raw.browser_domain}::${raw.is_idle ? 1 : 0}`;
    const activityChanged = eventKey !== state.lastWrittenKey;
    if (activityChanged) {
      state.unchangedPollCount = 0;
      state.lastWrittenKey     = eventKey;
    } else {
      state.unchangedPollCount++;
    }
    const shouldWrite = activityChanged || state.unchangedPollCount % 5 === 0;
    if (shouldWrite) {
      insertActivityEvent({
        session_id:     sessionId,
        timestamp:      Date.now(),
        app_name:       raw.app_name,
        window_title:   raw.window_title,
        browser_domain: raw.browser_domain,
        is_idle:        raw.is_idle ? 1 : 0,
      });
    }

    const classification = classifyActivity(
      raw.app_name,
      raw.browser_domain,
      raw.window_title,
      raw.is_idle,
    );

    // ── App-context parsing (desktop apps) ───────────────────────────────────
    // For browser apps the domain/URL gives us better context than the title.
    const appContext = raw.browser_domain
      ? null
      : parseAppContext(raw.app_name, raw.window_title);

    // ── URL metadata (fire-and-forget; result available next poll via cache) ─
    if (!raw.is_idle && raw.browser_url && raw.browser_url !== state.lastFetchedUrl) {
      // Fire async, don't await — the cache will serve it on the next poll
      fetchUrlMetadata(raw.browser_url)
        .then((meta) => {
          state.lastMetadata  = meta;
          state.lastFetchedUrl = raw.browser_url;
        })
        .catch(() => { /* non-fatal */ });
    }
    // Use cached metadata synchronously (available after first poll on same URL)
    const metadata = (raw.browser_url === state.lastFetchedUrl) ? state.lastMetadata : null;

    // ── Context summary ──────────────────────────────────────────────────────
    const context_summary = buildContextSummary({
      appName:     raw.app_name,
      domain:      raw.browser_domain,
      windowTitle: raw.window_title,
      fullUrl:     raw.browser_url,
      appContext,
      metadata,
    });

    // ── Smart screenshot trigger ─────────────────────────────────────────────
    // Key captures the "what changed" signals: app, domain (or URL for browsers),
    // and window title for desktop apps (file switches, project changes).
    const contextKey = [
      raw.app_name,
      raw.browser_url ?? raw.browser_domain,        // URL is more specific than domain
      raw.browser_domain ? null : raw.window_title, // only track title for desktop apps
    ].join('::');

    const now              = Date.now();
    const contextChanged   = contextKey !== state.lastContextKey && contextKey !== '::';
    const baselineExpired  = (now - state.lastScreenshotAt) >= SCREENSHOT_BASELINE_MS;
    const minIntervalOk    = (now - state.lastScreenshotAt) >= SCREENSHOT_MIN_INTERVAL_MS;

    // Skip vision entirely if all windows are minimized or hidden
    const allWindowsHidden = BrowserWindow.getAllWindows().every(
      (w) => w.isMinimized() || !w.isVisible(),
    );

    if (
      !raw.is_idle         &&
      !state.visionPending &&
      !allWindowsHidden    &&
      settings.vision_enabled &&
      settings.vision_model   &&
      (contextChanged || baselineExpired) &&
      minIntervalOk
    ) {
      const trigger = contextChanged ? 'context-change' : 'baseline';
      captureAndAnalyzeAsync(sessionId, trigger);
    }

    // Always update the context key (even when we skip the screenshot)
    if (contextChanged) state.lastContextKey = contextKey;

    // ── Build rich CurrentActivity ───────────────────────────────────────────
    const elapsed = state.sessionStartedAt
      ? Math.floor((Date.now() - state.sessionStartedAt) / 1000)
      : 0;

    // ── Flow state tracking ───────────────────────────────────────────────────
    const pollIntervalSec = settings.tracking_interval_ms / 1000;
    if (classification === 'productive') {
      state.consecutiveFocusSeconds += pollIntervalSec;
      if (!state.inFlow && state.consecutiveFocusSeconds >= FLOW_THRESHOLD_SECONDS) {
        state.inFlow        = true;
        state.flowStartedAt = now - state.consecutiveFocusSeconds * 1000;
        console.log(`[Flow] Flow state entered after ${Math.round(state.consecutiveFocusSeconds / 60)} min`);
      }
    } else if (classification === 'idle') {
      // Idle doesn't break flow, but doesn't build toward it either
    } else {
      // Distracting / neutral / unknown — breaks flow
      if (state.inFlow) {
        console.log(`[Flow] Flow state ended — ${Math.round(state.consecutiveFocusSeconds / 60)} min`);
      }
      state.consecutiveFocusSeconds = 0;
      state.inFlow                  = false;
      state.flowStartedAt           = null;
    }

    const activity: CurrentActivity = {
      app_name:       raw.app_name,
      window_title:   raw.window_title,
      browser_domain: raw.browser_domain,
      full_url:       raw.browser_url,
      is_idle:        raw.is_idle,
      classification,
      session_elapsed_seconds: elapsed,
      // Enrichment
      app_context:             appContext   ?? undefined,
      page_metadata:           metadata     ?? undefined,
      context_summary,
      last_vision_description: state.lastVisionDescription ?? undefined,
      // Flow
      in_flow:               state.inFlow,
      flow_duration_seconds: state.inFlow ? Math.round(state.consecutiveFocusSeconds) : undefined,
    };

    state.lastActivity = activity;

    // ── Focus notification ────────────────────────────────────────────────────
    if (classification === 'distracting') {
      state.consecutiveDistractionPolls++;

      if (state.consecutiveDistractionPolls >= DISTRACTION_NOTIFY_POLLS) {
        const cooledDown =
          !state.lastNotificationAt ||
          (now - state.lastNotificationAt) >= NOTIFICATION_COOLDOWN_MS;

        if (settings.enable_focus_notifications && cooledDown && Notification.isSupported()) {
          const what = raw.browser_domain ?? raw.app_name ?? 'a distracting app';
          const mins = Math.round(
            (state.consecutiveDistractionPolls * settings.tracking_interval_ms) / 60_000,
          );
          new Notification({
            title: "You're off track",
            body:  `You've been on ${what} for ~${mins} min. Time to refocus.`,
          }).show();
          state.lastNotificationAt          = now;
          state.consecutiveDistractionPolls = 0;
          console.log(`[Notif] Focus alert — ${what}`);
        }
      }
    } else {
      state.consecutiveDistractionPolls = 0;
    }

    // ── Notify main-process subscribers (e.g. tray) ──────────────────────────
    _activityCallback?.(activity);

    // ── Broadcast to renderer ────────────────────────────────────────────────
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('activity:update', activity);
    });
  } catch (err) {
    console.error('[Tracker] Poll error:', err);
  }
}
