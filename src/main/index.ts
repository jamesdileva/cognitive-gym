import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { join } from 'node:path';
import { buildDbStatus } from './db/dbStatus';
import { openDatabase } from './db/database';
import { seedDevDataIfEmpty } from './db/seedDevData';
import { registerIpcHandlers } from './ipcHandlers';

const isDev = (): boolean => Boolean(process.env['ELECTRON_RENDERER_URL']);

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());

  // Open external links in the user's browser, never a new Electron window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (isDev()) {
    // Dev server (HMR) provided by electron-vite.
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] as string);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  // Keep the stock menu in dev (devtools access); drop it in packaged builds.
  if (!isDev()) {
    Menu.setApplicationMenu(null);
  }

  const db = openDatabase(join(app.getPath('userData'), 'cognitive-gym.db'));
  if (isDev()) {
    seedDevDataIfEmpty(db);
  }

  registerIpcHandlers(ipcMain, {
    dbStatus: () => buildDbStatus(db)
  });

  createWindow();

  app.on('activate', () => {
    // macOS convention: re-create the window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
