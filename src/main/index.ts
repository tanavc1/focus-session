import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc/handlers';
import { getActiveSession } from './database/db';
import { startTracking, stopTracking } from './tracking/activityTracker';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (require('electron-squirrel-startup')) app.quit();
} catch {
  // Not installed — that's fine for local dev
}

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
    mainWindow.webContents.openDevTools();
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

  app.on('activate', () => {
    // On macOS, recreate window when dock icon is clicked and no windows exist
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopTracking();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopTracking();
});
