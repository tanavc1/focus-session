/**
 * Spotify Tracker — macOS AppleScript bridge.
 * No OAuth, no API key, no setup. Works if Spotify desktop app is running.
 * Polls every 15 seconds and broadcasts `spotify:update` to all renderer windows.
 *
 * Album art strategy:
 *   1. AppleScript fetches track name / artist / album / Spotify URI (reliable)
 *   2. Track URI → Spotify public oEmbed endpoint (no auth) → thumbnail_url
 *   3. thumbnail_url image is fetched in the main process → base64 data URL
 *      This avoids all CSP / CORS issues in the renderer.
 *   4. Both oEmbed response and image bytes are cached per track URI.
 */

import { BrowserWindow } from 'electron';
import { exec }          from 'child_process';
import { promisify }     from 'util';
import { get as httpsGet } from 'https';
import type { SpotifyTrack } from '../../shared/types';

const execAsync = promisify(exec);

let _intervalHandle: ReturnType<typeof setInterval> | null = null;
let _lastTrack: SpotifyTrack | null = null;

// ─── Artwork cache ────────────────────────────────────────────────────────────

/** Cache base64 data URLs keyed by Spotify track URI — persists for the app lifetime. */
const _artworkCache = new Map<string, string | null>();

// ─── AppleScript ─────────────────────────────────────────────────────────────

/** Returns "name|||artist|||album|||spotifyURI" when playing, or "" when paused/stopped. */
const SCRIPT = `
try
  tell application "Spotify"
    if player state is playing then
      set t to current track
      set tId to ""
      try
        set tId to spotify url of t
      end try
      return (name of t) & "|||" & (artist of t) & "|||" & (album of t) & "|||" & tId
    else
      return ""
    end if
  end tell
on error
  return ""
end try
`;

// ─── oEmbed + image fetch ─────────────────────────────────────────────────────

/** Extract a bare track ID from a Spotify URI or URL. */
function extractTrackId(uri: string): string | null {
  // "spotify:track:4uLU6hMCjMI75M1A2tKUQC"  or
  // "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
  const m = uri.match(/track[:/]([A-Za-z0-9]{10,})/);
  return m?.[1] ?? null;
}

/** Fetch JSON from a URL using Node https.get. Returns null on any failure. */
function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { req?.destroy(); resolve(null); }, 4000);
    let req: ReturnType<typeof httpsGet> | undefined;
    try {
      req = httpsGet(
        url,
        { headers: { 'User-Agent': 'FocusSession/1.0', Accept: 'application/json' }, timeout: 3500 },
        (res) => {
          if (!res.statusCode || res.statusCode >= 300) { res.destroy(); clearTimeout(timer); resolve(null); return; }
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => { buf += chunk; });
          res.on('end',  () => { clearTimeout(timer); try { resolve(JSON.parse(buf) as Record<string, unknown>); } catch { resolve(null); } });
          res.on('error', () => { clearTimeout(timer); resolve(null); });
        },
      );
      req.on('error',   () => { clearTimeout(timer); resolve(null); });
      req.on('timeout', () => { req?.destroy(); clearTimeout(timer); resolve(null); });
    } catch { clearTimeout(timer); resolve(null); }
  });
}

/** Fetch an image URL and return it as a base64 data URL (jpeg/png). */
function fetchImageAsDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { req?.destroy(); resolve(null); }, 5000);
    let req: ReturnType<typeof httpsGet> | undefined;
    try {
      req = httpsGet(
        url,
        { headers: { 'User-Agent': 'FocusSession/1.0' }, timeout: 4500 },
        (res) => {
          if (!res.statusCode || res.statusCode >= 300) { res.destroy(); clearTimeout(timer); resolve(null); return; }
          const ct = (res.headers['content-type'] ?? 'image/jpeg').split(';')[0].trim();
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
          res.on('end',  () => {
            clearTimeout(timer);
            const b64 = Buffer.concat(chunks).toString('base64');
            resolve(`data:${ct};base64,${b64}`);
          });
          res.on('error', () => { clearTimeout(timer); resolve(null); });
        },
      );
      req.on('error',   () => { clearTimeout(timer); resolve(null); });
      req.on('timeout', () => { req?.destroy(); clearTimeout(timer); resolve(null); });
    } catch { clearTimeout(timer); resolve(null); }
  });
}

/**
 * Given a Spotify track URI, return a base64 data URL for the album art.
 * Uses Spotify's public oEmbed endpoint (no auth required).
 * Results are cached in _artworkCache.
 */
async function resolveArtwork(trackUri: string): Promise<string | null> {
  if (_artworkCache.has(trackUri)) return _artworkCache.get(trackUri) ?? null;

  try {
    const trackId = extractTrackId(trackUri);
    if (!trackId) { _artworkCache.set(trackUri, null); return null; }

    const oembedUrl = `https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F${trackId}`;
    const json = await fetchJson(oembedUrl);
    const thumbnailUrl = typeof json?.thumbnail_url === 'string' ? json.thumbnail_url : null;
    if (!thumbnailUrl) { _artworkCache.set(trackUri, null); return null; }

    const dataUrl = await fetchImageAsDataUrl(thumbnailUrl);
    _artworkCache.set(trackUri, dataUrl);
    return dataUrl;
  } catch {
    _artworkCache.set(trackUri, null);
    return null;
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

async function fetchCurrentTrack(): Promise<SpotifyTrack | null> {
  try {
    const escaped = SCRIPT.replace(/'/g, "'\"'\"'");
    const { stdout } = await execAsync(`osascript -e '${escaped}'`, { timeout: 2500 });
    const raw = stdout.trim();
    if (!raw) return null;
    const parts = raw.split('|||');
    if (parts.length < 2) return null;

    const name   = parts[0]?.trim() ?? '';
    const artist = parts[1]?.trim() ?? '';
    const album  = parts[2]?.trim() ?? '';
    const uri    = parts[3]?.trim() ?? '';

    // Resolve artwork asynchronously; if URI known, try cache or fetch
    let artwork_url: string | undefined;
    if (uri) {
      const cached = _artworkCache.get(uri);
      if (cached !== undefined) {
        artwork_url = cached ?? undefined;
      } else {
        // Fire-and-forget — next poll will have it from cache
        resolveArtwork(uri).catch(() => { /* non-fatal */ });
      }
    }

    return { name, artist, album, artwork_url };
  } catch {
    return null;
  }
}

// ─── Broadcast + poll ─────────────────────────────────────────────────────────

function broadcast(track: SpotifyTrack | null): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('spotify:update', track);
  });
}

async function poll(): Promise<void> {
  const track = await fetchCurrentTrack();

  const changed =
    (track === null) !== (_lastTrack === null) ||
    track?.name   !== _lastTrack?.name         ||
    track?.artist !== _lastTrack?.artist       ||
    // Broadcast again if artwork just resolved (was undefined, now has data URL)
    (track?.artwork_url !== undefined && track.artwork_url !== _lastTrack?.artwork_url);

  if (changed) {
    _lastTrack = track;
    broadcast(track);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startSpotifyTracking(): void {
  if (_intervalHandle) return;
  poll();
  _intervalHandle = setInterval(poll, 15_000);
  console.log('[Spotify] Tracking started (AppleScript + oEmbed artwork, 15 s interval)');
}

export function stopSpotifyTracking(): void {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
  _lastTrack = null;
  console.log('[Spotify] Tracking stopped');
}

export function getCurrentTrack(): SpotifyTrack | null {
  return _lastTrack;
}
