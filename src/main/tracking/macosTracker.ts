import { exec } from 'child_process';
import { promisify } from 'util';
import { BROWSER_APP_NAMES } from '../config/defaults';

const execAsync = promisify(exec);

export interface RawActivity {
  app_name: string | null;
  window_title: string | null;
  browser_url: string | null;
  browser_domain: string | null;
  idle_seconds: number;
  is_idle: boolean;
}

// ─── AppleScript helpers ──────────────────────────────────────────────────────

/**
 * Get the frontmost application name and window title.
 * Returns null fields on failure.
 */
async function getFrontmostApp(): Promise<{ app_name: string | null; window_title: string | null }> {
  const script = `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      set windowTitle to ""
      try
        set windowTitle to name of front window of frontApp
      end try
      return appName & "|||" & windowTitle
    end tell
  `;

  try {
    const { stdout } = await execAsync(`osascript -e '${escapeAppleScript(script)}'`);
    const parts = stdout.trim().split('|||');
    return {
      app_name: parts[0]?.trim() || null,
      window_title: parts[1]?.trim() || null,
    };
  } catch {
    return { app_name: null, window_title: null };
  }
}

/**
 * Get the URL from a browser application using AppleScript.
 * Supports Chrome, Safari, Firefox (with limitations), Arc, Brave.
 */
async function getBrowserUrl(app_name: string): Promise<string | null> {
  let script: string;

  const normalizedName = app_name.toLowerCase();

  if (normalizedName.includes('safari')) {
    script = `tell application "Safari"
      if (count of windows) > 0 then
        try
          return URL of current tab of front window
        end try
      end if
      return ""
    end tell`;
  } else if (
    normalizedName.includes('chrome') ||
    normalizedName.includes('chromium')
  ) {
    script = `tell application "Google Chrome"
      if (count of windows) > 0 then
        try
          return URL of active tab of front window
        end try
      end if
      return ""
    end tell`;
  } else if (normalizedName.includes('arc')) {
    script = `tell application "Arc"
      if (count of windows) > 0 then
        try
          return URL of active tab of front window
        end try
      end if
      return ""
    end tell`;
  } else if (normalizedName.includes('brave')) {
    script = `tell application "Brave Browser"
      if (count of windows) > 0 then
        try
          return URL of active tab of front window
        end try
      end if
      return ""
    end tell`;
  } else if (normalizedName.includes('edge')) {
    script = `tell application "Microsoft Edge"
      if (count of windows) > 0 then
        try
          return URL of active tab of front window
        end try
      end if
      return ""
    end tell`;
  } else if (normalizedName.includes('firefox')) {
    // Firefox doesn't support AppleScript URL access; parse from window title
    return null;
  } else {
    return null;
  }

  try {
    const { stdout } = await execAsync(`osascript -e '${escapeAppleScript(script)}'`, {
      timeout: 2000,
    });
    const url = stdout.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Get system idle time in seconds using IOKit.
 */
async function getIdleSeconds(): Promise<number> {
  try {
    const { stdout } = await execAsync(
      "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF/1000000000; exit}'",
      { timeout: 1500 }
    );
    const seconds = parseFloat(stdout.trim());
    return isNaN(seconds) ? 0 : seconds;
  } catch {
    return 0;
  }
}

// ─── Domain extraction ────────────────────────────────────────────────────────

/**
 * Extract domain from a URL string.
 */
export function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Remove 'www.' prefix for cleaner matching
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // Try to parse from window title patterns like "Something - domain.com"
    const match = url.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    return match ? match[1] : null;
  }
}

/**
 * Check if an app name is a known browser.
 */
export function isBrowser(app_name: string | null): boolean {
  if (!app_name) return false;
  return BROWSER_APP_NAMES.some((b) =>
    app_name.toLowerCase().includes(b.toLowerCase())
  );
}

// ─── Main poll function ───────────────────────────────────────────────────────

/**
 * Capture the current system activity snapshot.
 * This is the main entry point called by the activity tracker poll loop.
 */
export async function captureActivity(
  idleThresholdSeconds: number,
  enableBrowserTracking: boolean
): Promise<RawActivity> {
  // Run these in parallel for speed
  const [appInfo, idleSeconds] = await Promise.all([
    getFrontmostApp(),
    getIdleSeconds(),
  ]);

  const isIdle = idleSeconds >= idleThresholdSeconds;

  let browser_url: string | null = null;
  let browser_domain: string | null = null;

  // Only fetch browser URL if not idle and browser tracking is enabled
  if (!isIdle && enableBrowserTracking && isBrowser(appInfo.app_name)) {
    browser_url = await getBrowserUrl(appInfo.app_name!);
    browser_domain = extractDomain(browser_url);

    // Fallback: try to extract domain from window title
    if (!browser_domain && appInfo.window_title) {
      browser_domain = extractDomainFromTitle(appInfo.window_title);
    }
  }

  return {
    app_name: appInfo.app_name,
    window_title: appInfo.window_title,
    browser_url,
    browser_domain,
    idle_seconds: idleSeconds,
    is_idle: isIdle,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Try to extract a domain from a browser window title.
 * Many browsers append the domain or site name to the tab title.
 * e.g. "GitHub - stackoverflow.com" or "Twitter / X"
 */
function extractDomainFromTitle(title: string): string | null {
  // Pattern: "Something | domain.com" or "Something - domain.com"
  const domainPattern = /[-|–]\s*([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(\s|$)/;
  const match = title.match(domainPattern);
  if (match) {
    return match[1].replace(/^www\./, '');
  }
  return null;
}

/**
 * Escape single quotes in AppleScript strings.
 */
function escapeAppleScript(script: string): string {
  // We're using shell substitution with single quotes, so we need to
  // handle single quotes carefully. Replace ' with '"'"'
  return script.replace(/'/g, "'\"'\"'");
}
