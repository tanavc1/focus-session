import { app, BrowserWindow, shell, powerMonitor, ipcMain } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc/handlers';
import { getActiveSession } from './database/db';
import { startTracking, stopTracking } from './tracking/activityTracker';
import { startSpotifyTracking, stopSpotifyTracking } from './tracking/spotifyTracker';
import { createTray, destroyTray, setTrayActivity } from './tray';
import { registerActivityCallback } from './tracking/activityTracker';
import { scheduleUpdateCheck, openDownloadUrl } from './updater';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (require('electron-squirrel-startup')) app.quit();
} catch {
  // Not installed — that's fine for local dev
}

// ── Process-level safety net ──────────────────────────────────────────────────
// Prevents silent crashes that would leave an active session unrecorded.
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled promise rejection:', reason);
});

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',  // macOS: use native traffic lights
    backgroundColor: '#0f172a',    // Matches dark background
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,             // Needed for preload to access contextBridge
    },
    show: false,
  });

  // Graceful show after load to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    // Only open DevTools in development
    if (process.env.NODE_ENV !== 'production') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open external links in the OS browser, not the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Register all IPC handlers before creating the window
  registerIpcHandlers();

  createWindow();

  // Set up menu bar tray
  if (mainWindow) {
    createTray(mainWindow);
    registerActivityCallback((activity) => setTrayActivity(activity));
  }

  // Start Spotify polling (works whenever Spotify desktop app is open)
  startSpotifyTracking();

  // Check for updates in the background (15s delay, non-blocking)
  scheduleUpdateCheck();

  // Handle download request from renderer — only allow HTTPS GitHub URLs
  ipcMain.handle('update:download', (_event, url: string) => {
    if (typeof url === 'string' && /^https:\/\/github\.com\//i.test(url)) {
      openDownloadUrl(url);
    } else {
      console.warn('[Updater] Rejected download URL (not a GitHub HTTPS link):', url);
    }
  });

  // Resume tracking if there was an active session (e.g., crash recovery)
  try {
    const activeSession = getActiveSession();
    if (activeSession) {
      console.log(`[Main] Resuming tracking for active session: ${activeSession.id}`);
      startTracking(activeSession.id);
    }
  } catch (e) {
    console.error('[Main] Failed to check for active sessions:', e);
  }

  // ── Lid close / system sleep → pause tracking ────────────────────────────
  powerMonitor.on('suspend', () => {
    console.log('[Power] System suspending — pausing active session tracking');
    const session = getActiveSession();
    if (session) {
      stopTracking();
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) w.webContents.send('session:suspended');
      });
    }
  });

  powerMonitor.on('resume', () => {
    console.log('[Power] System resumed — resuming active session tracking');
    const session = getActiveSession();
    if (session) {
      startTracking(session.id);
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) w.webContents.send('session:resumed');
      });
    }
  });

  app.on('activate', () => {
    // On macOS, recreate window when dock icon is clicked and no windows exist
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  destroyTray();
  stopTracking();
  stopSpotifyTracking();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  destroyTray();
  stopTracking();
  stopSpotifyTracking();
});
