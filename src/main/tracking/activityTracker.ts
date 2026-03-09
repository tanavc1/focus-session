import { BrowserWindow } from 'electron';
import { captureActivity } from './macosTracker';
import { insertActivityEvent, getActiveSession, getAllSettings } from '../database/db';
import { classifyActivity } from '../analytics/distractionClassifier';
import type { CurrentActivity } from '../../shared/types';

interface TrackerState {
  isRunning: boolean;
  sessionId: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastActivity: CurrentActivity | null;
  sessionStartedAt: number | null;
}

const state: TrackerState = {
  isRunning: false,
  sessionId: null,
  intervalHandle: null,
  lastActivity: null,
  sessionStartedAt: null,
};

/**
 * Start polling for activity for the given session.
 */
export function startTracking(sessionId: string): void {
  if (state.isRunning) {
    stopTracking();
  }

  const settings = getAllSettings();

  state.isRunning = true;
  state.sessionId = sessionId;
  state.sessionStartedAt = Date.now();

  console.log(`[Tracker] Starting activity tracking for session ${sessionId}`);
  console.log(`[Tracker] Poll interval: ${settings.tracking_interval_ms}ms`);

  // Poll immediately, then on interval
  poll(sessionId, settings.idle_threshold_seconds, settings.enable_browser_tracking);

  state.intervalHandle = setInterval(
    () => poll(sessionId, settings.idle_threshold_seconds, settings.enable_browser_tracking),
    settings.tracking_interval_ms
  );
}

/**
 * Stop the active tracking loop.
 */
export function stopTracking(): void {
  if (state.intervalHandle !== null) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
  state.isRunning = false;
  state.sessionId = null;
  state.lastActivity = null;
  state.sessionStartedAt = null;
  console.log('[Tracker] Stopped activity tracking');
}

/**
 * Get the most recent activity snapshot (for live display in renderer).
 */
export function getCurrentActivity(): CurrentActivity | null {
  return state.lastActivity;
}

/**
 * Single poll tick: capture activity, persist it, broadcast to renderer.
 */
async function poll(
  sessionId: string,
  idleThresholdSeconds: number,
  enableBrowserTracking: boolean
): Promise<void> {
  try {
    const raw = await captureActivity(idleThresholdSeconds, enableBrowserTracking);

    // Persist event to DB
    insertActivityEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      app_name: raw.app_name,
      window_title: raw.window_title,
      browser_domain: raw.browser_domain,
      is_idle: raw.is_idle ? 1 : 0,
    });

    // Classify for live display
    const classification = classifyActivity(
      raw.app_name,
      raw.browser_domain,
      raw.window_title,
      raw.is_idle
    );

    const elapsed = state.sessionStartedAt
      ? Math.floor((Date.now() - state.sessionStartedAt) / 1000)
      : 0;

    const activity: CurrentActivity = {
      app_name: raw.app_name,
      window_title: raw.window_title,
      browser_domain: raw.browser_domain,
      is_idle: raw.is_idle,
      classification,
      session_elapsed_seconds: elapsed,
    };

    state.lastActivity = activity;

    // Push live update to all renderer windows
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('activity:update', activity);
      }
    });
  } catch (err) {
    console.error('[Tracker] Poll error:', err);
  }
}
