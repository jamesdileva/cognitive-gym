import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildDbStatus } from './db/dbStatus';
import { openDatabase } from './db/database';
import { createBookEpisodesRepo } from './db/repositories/bookEpisodesRepo';
import { createContentPoolRepo } from './db/repositories/contentPoolRepo';
import { createFlashcardsRepo } from './db/repositories/flashcardsRepo';
import { createReadingStreaksRepo } from './db/repositories/readingStreaksRepo';
import { createUserProgressRepo } from './db/repositories/userProgressRepo';
import { seedDevDataIfEmpty } from './db/seedDevData';
import { createIngestionService } from './ingestion/ingestionService';
import { createEpisodeService } from './episodes/episodeService';
import { createReadingService } from './reading/readingService';
import { loadDiagnosticsContent } from './diagnostics/diagnosticsLoader';
import { createDiagnosticsService } from './diagnostics/diagnosticsService';
import type { LogicRow } from '@shared/diagnostics-types';
import { IPC_CHANNELS } from '@shared/ipc-types';
import type { IngestProgress } from '@shared/ingestion-types';
import { registerIpcHandlers } from './ipcHandlers';
import { createAiEngineService } from './ollama/engine';
import { OllamaClient, toAiResult } from './ollama/ollamaClient';
import { createMathService } from './math/mathService';
import { loadMathTemplates, mergeMathTemplates } from './math/templateLoader';
import { createReviewService } from './srs/reviewService';
import { createSynthesisService } from './synthesis/synthesisService';
import { createDashboardService } from './dashboard/dashboardService';

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
  const seedMath = loadMathTemplates(join(appRoot, 'content-library', 'math-formulas'));
  const generatedMathDir = join(app.getPath('userData'), 'math-templates');
  const generatedMath = existsSync(generatedMathDir)
    ? loadMathTemplates(generatedMathDir)
    : [];
  const math = createMathService({
    templates: mergeMathTemplates(seedMath, generatedMath),
    progress: createUserProgressRepo(db),
    engine: ai
  });
  const synthesis = createSynthesisService({
    engine: ai,
    contentPool: createContentPoolRepo(db),
    mathTemplatesDir: generatedMathDir
  });
  const cards = createFlashcardsRepo(db);
  const dashboard = createDashboardService({ db, cards });
  const srs = createReviewService({ cards });
  const ingestion = createIngestionService({
    engine: ai,
    contentPool: createContentPoolRepo(db)
  });
  const episodes = createEpisodeService({
    engine: ai,
    bookEpisodes: createBookEpisodesRepo(db),
    contentPool: createContentPoolRepo(db),
    streaks: createReadingStreaksRepo(db)
  });
  const reading = createReadingService({
    engine: ai,
    contentPool: createContentPoolRepo(db),
    progress: createUserProgressRepo(db)
  });
  const diagnostics = createDiagnosticsService({
    engine: ai,
    progress: createUserProgressRepo(db),
    content: loadDiagnosticsContent(join(appRoot, 'content-library'))
  });

  /** Native file picker for the ingestion pipeline. */
  const selectBookFile = async (): Promise<{ path: string | null }> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a book to ingest',
      properties: ['openFile'],
      filters: [{ name: 'Books (PDF, EPUB, TXT)', extensions: ['pdf', 'epub', 'txt'] }]
    });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  };

  /** Fan-out for every long-running pipeline's progress events. */
  const emitIngestProgress = (progress: IngestProgress): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.ingestProgress, progress);
    }
  };

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
    srsGrade: (request) => srs.gradeCard(request.id, request.correct),
    ingestSelectFile: selectBookFile,
    ingestRun: (request) => ingestion.run(request.path, {
      maxChunks: request.maxChunks,
      onProgress: emitIngestProgress
    }),
    ingestLibrary: () => ({ sources: ingestion.listLibrary() }),
    ingestDelete: (request) => ({ deleted: ingestion.deleteSource(request.sourceTitle) }),
    epIngest: (request) =>
      episodes.run(request.path, {
        isCanonical: request.isCanonical,
        maxEpisodes: request.maxEpisodes,
        onProgress: emitIngestProgress
      }),
    epTracks: () => ({ tracks: episodes.listTracks() }),
    epFeed: (request) => ({ feed: episodes.getDailyFeed(request.bookTitle, request.episodeNumber) }),
    epFinish: (request) => episodes.finishEpisode(request.bookTitle),
    epQuestions: (request) => ({ questions: episodes.getEpisodeQuestions(request.contentUuid) }),
    epList: (request) => ({ episodes: episodes.listEpisodeSummaries(request.bookTitle) }),
    readPassages: () => ({ passages: reading.listPassages() }),
    readStart: (request) => ({ session: reading.startSession(request.uuid) }),
    readSubmit: (request) => reading.submitAnswer(request),
    diagContent: (request) => diagnostics.list(request.kind),
    diagOpen: (request) => diagnostics.open(request.kind, request.id),
    diagSubmit: (request) =>
      diagnostics.submit({ kind: request.kind, id: request.id, answer: request.answer }),
    diagHint: (request) => {
      if (request.kind === 'coding') {
        return diagnostics.codingHint(request.id, request.answer as string);
      }
      if (request.kind === 'logic') {
        return diagnostics.logicHint(request.id, request.answer as LogicRow[]);
      }
      return Promise.resolve({
        ok: false,
        failure: { kind: 'invalid_response', message: 'No hint ladder for this room.' }
      });
    },
    synthStories: (request) =>
      synthesis.generateStories(request.count, emitIngestProgress),
    synthMath: (request) => synthesis.generateMathTemplates(request.count, emitIngestProgress),
    dashOverview: () => dashboard.overview()
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
