/**
 * Update checker for Focus.
 *
 * macOS requires code signing for silent auto-install (Squirrel.Mac).
 * Since this is an unsigned app, we do the next best thing:
 *   1. Check GitHub releases API for the latest version
 *   2. Compare it with the running app version
 *   3. Notify the renderer if an update is available
 *   4. User clicks → opens download URL → drags new app over old one
 *
 * Runs once on startup after a 15-second delay (so it never slows launch).
 */

import { app, BrowserWindow, shell } from 'electron';
import https from 'https';

const GITHUB_REPO = 'tanavc1/focus-session';
const CHECK_DELAY_MS = 15_000; // wait 15s after launch before checking

interface GithubRelease {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
  body: string;
}

/** Fetch the latest GitHub release metadata. */
function fetchLatestRelease(): Promise<GithubRelease | null> {
  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': `Focus/${app.getVersion()}`,
          Accept: 'application/vnd.github+json',
        },
        timeout: 8_000,
      },
      (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data) as GithubRelease); }
          catch { resolve(null); }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/** Compare two semver strings. Returns true if remote > local. */
function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [rMaj, rMin, rPatch] = parse(remote);
  const [lMaj, lMin, lPatch] = parse(local);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPatch > lPatch;
}

/** Broadcast update info to all renderer windows. */
function broadcast(version: string, downloadUrl: string, releaseUrl: string) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send('update:available', { version, downloadUrl, releaseUrl });
    }
  });
}

/** Schedule an update check 15 s after app is ready. */
export function scheduleUpdateCheck(): void {
  // Skip in development — package.json version is 1.0.0 which would always
  // appear outdated compared to production releases.
  if (!app.isPackaged) return;

  setTimeout(async () => {
    try {
      const release = await fetchLatestRelease();
      if (!release) return;

      const remoteVersion = release.tag_name;
      const localVersion  = app.getVersion();

      console.log(`[Updater] Local: v${localVersion} / Remote: ${remoteVersion}`);

      if (!isNewer(remoteVersion, localVersion)) {
        console.log('[Updater] App is up to date.');
        return;
      }

      // Find the DMG asset URL, fall back to release page
      const dmgAsset = release.assets.find((a) => a.name.endsWith('.dmg'));
      const downloadUrl = dmgAsset?.browser_download_url
        ?? `https://github.com/${GITHUB_REPO}/releases/latest/download/Focus.dmg`;

      console.log(`[Updater] Update available: ${remoteVersion}`);
      broadcast(remoteVersion, downloadUrl, release.html_url);
    } catch (err) {
      console.warn('[Updater] Check failed (non-fatal):', err);
    }
  }, CHECK_DELAY_MS);
}

/** Open the download URL in the system browser. */
export function openDownloadUrl(url: string): void {
  shell.openExternal(url);
}
