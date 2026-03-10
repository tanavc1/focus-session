/**
 * macOS Menu Bar (Tray)
 * ─────────────────────
 * Shows a live focus timer in the menu bar when a session is active.
 * Lets users start/stop sessions without opening the main window.
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { Session, CurrentActivity } from '../../shared/types';

let _tray:       Tray | null = null;
let _win:        BrowserWindow | null = null;
let _session:    Session | null = null;
let _inFlow      = false;
let _timerHandle: ReturnType<typeof setInterval> | null = null;

// ─── Icon creation ────────────────────────────────────────────────────────────

/** Build a 16×16 monochrome template image from raw BGRA pixels. */
function makeIcon(style: 'idle' | 'active'): ReturnType<typeof nativeImage.createFromBitmap> {
  const S = 16;
  const buf = Buffer.alloc(S * S * 4, 0);
  const cx = 7.5, cy = 7.5, r = 5;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d   = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const idx = (y * S + x) * 4;
      const on  = style === 'idle'
        ? d >= r - 1.8 && d <= r          // hollow ring
        : d <= r;                           // filled circle

      if (on) {
        buf[idx]   = 255; // B (template image: white works for both dark/light bar)
        buf[idx+1] = 255; // G
        buf[idx+2] = 255; // R
        buf[idx+3] = 255; // A
      }
    }
  }

  const img = nativeImage.createFromBitmap(buf, { width: S, height: S });
  img.setTemplateImage(true); // macOS: auto-inverts for dark/light menu bar
  return img;
}

// ─── Menu builder ─────────────────────────────────────────────────────────────

function buildMenu(): Electron.Menu {
  const items: Electron.MenuItemConstructorOptions[] = [];

  if (_session) {
    const elapsed  = fmtElapsed(_session.started_at);
    const flowPfx  = _inFlow ? '🔥 ' : '';
    items.push(
      { label: `${_session.title}`,           enabled: false },
      { label: `${flowPfx}${elapsed}`,        enabled: false },
      { type:  'separator' },
      {
        label: 'Stop Session',
        click: () => {
          _win?.webContents.send('tray:request-end-session', _session?.id);
        },
      },
    );
  } else {
    items.push(
      { label: 'No active session', enabled: false },
      {
        label: 'Quick Start',
        click: () => {
          _win?.show();
          _win?.focus();
          _win?.webContents.send('tray:request-quick-start');
        },
      },
    );
  }

  items.push(
    { type: 'separator' },
    {
      label: 'Open Focus',
      click: () => { _win?.show(); _win?.focus(); },
    },
    { type: 'separator' },
    { label: 'Quit Focus', click: () => app.quit() },
  );

  return Menu.buildFromTemplate(items);
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function startTimer(): void {
  if (_timerHandle) return;
  _timerHandle = setInterval(() => {
    if (!_tray || !_session) return;
    const flowPfx = _inFlow ? '🔥 ' : '';
    _tray.setTitle(`${flowPfx}${fmtElapsed(_session.started_at)}`);
    // Rebuild context menu so elapsed time stays fresh there too
    _tray.setContextMenu(buildMenu());
  }, 1000);
}

function stopTimer(): void {
  if (_timerHandle) { clearInterval(_timerHandle); _timerHandle = null; }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createTray(mainWindow: BrowserWindow): void {
  if (_tray) return;
  _win  = mainWindow;
  _tray = new Tray(makeIcon('idle'));
  _tray.setToolTip('Focus');
  _tray.setContextMenu(buildMenu());

  // Left-click (macOS) — show window
  _tray.on('click', () => {
    if (_win?.isVisible()) { _win.focus(); }
    else { _win?.show(); _win?.focus(); }
  });
}

export function destroyTray(): void {
  stopTimer();
  _tray?.destroy();
  _tray = _win = _session = null;
}

/** Call when a session starts or ends (null = ended). */
export function setTraySession(session: Session | null): void {
  _session = session;
  if (!_tray) return;

  if (session) {
    _tray.setImage(makeIcon('active'));
    startTimer();
  } else {
    _inFlow = false;
    _tray.setImage(makeIcon('idle'));
    _tray.setTitle('');
    stopTimer();
  }
  _tray.setContextMenu(buildMenu());
}

/** Call on every activity update to track flow state. */
export function setTrayActivity(activity: CurrentActivity | null): void {
  if (!_tray || !_session) return;
  const wasFlow = _inFlow;
  _inFlow = activity?.in_flow ?? false;
  if (_inFlow !== wasFlow) _tray.setContextMenu(buildMenu());
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtElapsed(startedAt: number): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }
