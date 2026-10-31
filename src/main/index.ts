import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { join } from 'node:path';
import { buildDbStatus } from './db/dbStatus';
import { openDatabase } from './db/database';
import { createFlashcardsRepo } from './db/repositories/flashcardsRepo';
import { createUserProgressRepo } from './db/repositories/userProgressRepo';
import { seedDevDataIfEmpty } from './db/seedDevData';
import { registerIpcHandlers } from './ipcHandlers';
import { createAiEngineService } from './ollama/engine';
import { OllamaClient, toAiResult } from './ollama/ollamaClient';
import { createMathService } from './math/mathService';
import { loadMathTemplates } from './math/templateLoader';
import { createReviewService } from './srs/reviewService';

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
  const appRoot = app.getAppPath();
  if (isDev()) {
    seedDevDataIfEmpty(db, join(appRoot, 'content-library', 'flashcards'));
  }

  const ai = createAiEngineService(db, new OllamaClient());
  const mathTemplates = loadMathTemplates(join(app.getAppPath(), 'content-library', 'math-formulas'));
  const math = createMathService({
    templates: mathTemplates,
    progress: createUserProgressRepo(db),
    engine: ai
  });
  const srs = createReviewService({ cards: createFlashcardsRepo(db) });

  registerIpcHandlers(ipcMain, {
    dbStatus: () => buildDbStatus(db),
    aiStatus: () => ai.status(),
    aiSetEngine: async (model: string) => ai.setEngine(model),
    aiGenerate: (request) => toAiResult(ai.generateWithEngine(request)),
    mathTopics: () => ({ topics: math.listTopics() }),
    mathNewProblem: (request) => ({ problem: math.newProblem(request.templateId) }),
    mathCheckAnswer: (request) => math.checkAnswer(request.problem, request.answer),
    mathReveal: (request) => math.reveal(request.problem),
    mathHint: (request) => math.hint(request.problem, request.userMessage),
    srsDecks: () => ({ decks: srs.listDecks() }),
    srsDraw: (request) => ({ card: srs.drawCard(request.deckName) }),
    srsReveal: (request) => srs.revealCard(request.id),
    srsGrade: (request) => srs.gradeCard(request.id, request.correct)
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
