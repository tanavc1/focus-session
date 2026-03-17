/**
 * macOS Activity Tracker — OS-level capture layer.
 *
 * Performance design:
 *  • ONE unified AppleScript per poll (gets app + window title + browser URL in a single
 *    subprocess spawn instead of the previous 2-3 separate calls).
 *  • Idle time via Electron's powerMonitor.getSystemIdleTime() — zero subprocess spawn,
 *    zero disk I/O, synchronous, always fresh.
 *  • AppleScript is skipped entirely when the user is idle (no subprocess cost at all).
 *  • Hard 3s timeout prevents a hung script from stalling the poll loop.
 */

import { powerMonitor, systemPreferences } from 'electron';
import { exec }         from 'child_process';
import { promisify }    from 'util';
import { BROWSER_APP_NAMES } from '../config/defaults';

const execAsync = promisify(exec);

export interface RawActivity {
  app_name:       string | null;
  window_title:   string | null;
  browser_url:    string | null;
  browser_domain: string | null;
  idle_seconds:   number;
  is_idle:        boolean;
}

// ─── Domain extraction ────────────────────────────────────────────────────────

export function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    const m = url.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    return m ? m[1] : null;
  }
}

export function isBrowser(app_name: string | null): boolean {
  if (!app_name) return false;
  return BROWSER_APP_NAMES.some((b) => app_name.toLowerCase().includes(b.toLowerCase()));
}

// ─── Single unified AppleScript ───────────────────────────────────────────────
//
// Returns "appName|||windowTitle|||browserUrl" in ONE exec() call.
// Previously this was 2 separate subprocess spawns (one for app/title, one
// for browser URL). Merging them saves 100-200 ms of fork+exec overhead per
// poll when the active app is a browser.

function buildUnifiedScript(enableBrowserTracking: boolean): string {
  const browserBlock = enableBrowserTracking ? `
    set browserNames to {"Safari", "Google Chrome", "Arc", "Brave Browser", "Microsoft Edge", "Chromium", "Opera", "Vivaldi"}
    repeat with bName in browserNames
      if appName contains bName then
        try
          if appName contains "Safari" then
            tell application "Safari"
              if (count of windows) > 0 then
                set browserUrl to URL of current tab of front window
              end if
            end tell
          else if appName is "Arc" then
            tell application "Arc"
              if (count of windows) > 0 then
                set browserUrl to URL of active tab of front window
              end if
            end tell
          else if appName contains "Brave" then
            tell application "Brave Browser"
              if (count of windows) > 0 then
                set browserUrl to URL of active tab of front window
              end if
            end tell
          else if appName contains "Edge" then
            tell application "Microsoft Edge"
              if (count of windows) > 0 then
                set browserUrl to URL of active tab of front window
              end if
            end tell
          else if appName contains "Chrome" or appName contains "Chromium" then
            tell application "Google Chrome"
              if (count of windows) > 0 then
                set browserUrl to URL of active tab of front window
              end if
            end tell
          end if
        end try
        exit repeat
      end if
    end repeat
  ` : '';

  return `
try
  tell application "System Events"
    set frontApp to first application process whose frontmost is true
    set appName to name of frontApp
    set winTitle to ""
    try
      set winTitle to name of front window of frontApp
    end try
    set browserUrl to ""
    ${browserBlock}
    return appName & "|||" & winTitle & "|||" & browserUrl
  end tell
on error
  return "|||"
end try
`;
}

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\"'\"'");
}

// ─── Main capture function ────────────────────────────────────────────────────

/**
 * Capture the current system activity snapshot.
 *
 * Performance profile (per poll):
 *  • 0 subprocesses when idle  (powerMonitor is synchronous, in-process)
 *  • 1 subprocess when active  (unified AppleScript — was 2 previously)
 */
export async function captureActivity(
  idleThresholdSeconds:  number,
  enableBrowserTracking: boolean,
): Promise<RawActivity> {
  // Idle time: synchronous, in-process, free. No subprocess needed.
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const isIdle      = idleSeconds >= idleThresholdSeconds;

  // When idle, skip AppleScript entirely — saves an entire subprocess spawn.
  if (isIdle) {
    return { app_name: null, window_title: null, browser_url: null, browser_domain: null, idle_seconds: idleSeconds, is_idle: true };
  }

  // Check Accessibility permission WITHOUT prompting the user (false = don't ask).
  // If not granted, fall back to lsappinfo which requires no special permission.
  const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(false);
  if (!hasAccessibility) {
    const app_name = await getFrontmostAppFallback();
    return { app_name, window_title: null, browser_url: null, browser_domain: null, idle_seconds: idleSeconds, is_idle: false };
  }

  // One script gets everything: app name, window title, and browser URL.
  const script  = buildUnifiedScript(enableBrowserTracking);
  const escaped = shellEscape(script);

  try {
    const { stdout } = await execAsync(`osascript -e '${escaped}'`, { timeout: 3_000 });
    const parts = stdout.trim().split('|||');

    const app_name     = parts[0]?.trim() || null;
    const window_title = parts[1]?.trim() || null;
    const raw_url      = parts[2]?.trim() || null;
    const browser_url  = (raw_url && raw_url.startsWith('http')) ? raw_url : null;
    const browser_domain = browser_url
      ? extractDomain(browser_url)
      : (app_name && isBrowser(app_name) && window_title)
        ? extractDomainFromTitle(window_title)
        : null;

    return { app_name, window_title, browser_url, browser_domain, idle_seconds: idleSeconds, is_idle: false };
  } catch {
    // Script timed out — try lsappinfo as a last resort.
    const app_name = await getFrontmostAppFallback();
    return { app_name, window_title: null, browser_url: null, browser_domain: null, idle_seconds: idleSeconds, is_idle: false };
  }
}

// ─── lsappinfo fallback (no Accessibility permission needed) ─────────────────
// lsappinfo is a macOS built-in that returns the frontmost app without requiring
// Accessibility permission. Used when the user hasn't granted Accessibility yet.

async function getFrontmostAppFallback(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('lsappinfo front', { timeout: 1_000 });
    // lsappinfo output starts with: (pid) "App Name" ASN:... bundleID:...
    const m = stdout.match(/"([^"]+)"/);
    const name = m?.[1]?.trim();
    // Filter out system processes that aren't real apps
    if (!name || name === 'loginwindow' || name === 'Dock' || name === 'NotificationCenter') return null;
    return name;
  } catch {
    return null;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractDomainFromTitle(title: string): string | null {
  const m = title.match(/[-|–]\s*([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(\s|$)/);
  return m ? m[1].replace(/^www\./, '') : null;
}
