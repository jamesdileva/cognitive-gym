import type { IpcMain } from 'electron';
import type { AiGenerateRequest, AiResult, AiStatusResponse } from '@shared/ai-types';
import type {
  MathCheckResponse,
  MathHintResult,
  MathProblem,
  MathRevealResponse,
  MathTopicSummary
} from '@shared/math-types';
import type { DeckSummary, SrsCard, SrsGradeResult } from '@shared/srs-types';
import type {
  IngestionReport,
  IngestedSourceSummary
} from '@shared/ingestion-types';
import type {
  DailyFeed,
  EpisodeQuestion,
  EpisodeTrack,
  EpisodicIngestReport,
  EpisodicIngestRequest
} from '@shared/episodes-types';
import type {
  GradeResult,
  ReadingPassageSummary,
  ReadingSession
} from '@shared/reading-types';
import {
  IPC_CHANNELS,
  type DbStatusResponse,
  type PingRequest,
  type PingResponse
} from '@shared/ipc-types';

/**
 * Pure handler logic, kept free of runtime Electron imports (type-only) so the
 * test suite can exercise it without launching Electron.
 */

export function handlePing(request: PingRequest, nowMs: number = Date.now()): PingResponse {
  return { echo: request.payload, receivedAtMs: nowMs };
}

/** Services handlers delegate to; composed with real implementations in main/index.ts. */
export interface IpcServices {
  dbStatus(): DbStatusResponse;
  aiStatus(): Promise<AiStatusResponse>;
  aiSetEngine(model: string): Promise<{ engine: string }>;
  aiGenerate(request: AiGenerateRequest): Promise<AiResult>;
  mathTopics(): { topics: MathTopicSummary[] };
  mathNewProblem(request: { templateId: string }): { problem: MathProblem };
  mathCheckAnswer(request: { problem: MathProblem; answer: string }): MathCheckResponse;
  mathReveal(request: { problem: MathProblem }): MathRevealResponse;
  mathHint(request: { problem: MathProblem; userMessage: string }): Promise<MathHintResult>;
  srsDecks(): { decks: DeckSummary[] };
  srsDraw(request: { deckName: string }): { card: SrsCard | null };
  srsReveal(request: { id: number }): { back: string };
  srsGrade(request: { id: number; correct: boolean }): SrsGradeResult;
  ingestSelectFile(): Promise<{ path: string | null }>;
  ingestRun(request: { path: string; maxChunks?: number }): Promise<IngestionReport>;
  ingestLibrary(): { sources: IngestedSourceSummary[] };
  ingestDelete(request: { sourceTitle: string }): { deleted: boolean };
  epIngest(request: EpisodicIngestRequest): Promise<EpisodicIngestReport>;
  epTracks(): { tracks: EpisodeTrack[] };
  epFeed(request: { bookTitle: string }): { feed: DailyFeed };
  epFinish(request: { bookTitle: string }): { nextEpisodeNumber: number | null };
  epQuestions(request: { contentUuid: string }): { questions: EpisodeQuestion[] };
  readPassages(): { passages: ReadingPassageSummary[] };
  readStart(request: { uuid: string }): { session: ReadingSession };
  readSubmit(request: { uuid: string; questionIndex: number; answer: string }): Promise<GradeResult>;
}

/** Registers every IPC handler on the real `ipcMain`. Called once at app start. */
export function registerIpcHandlers(ipcMain: Pick<IpcMain, 'handle'>, services: IpcServices): void {
  ipcMain.handle(IPC_CHANNELS.ping, (_event, request: PingRequest): PingResponse =>
    handlePing(request)
  );
  ipcMain.handle(IPC_CHANNELS.dbStatus, (): DbStatusResponse => services.dbStatus());
  ipcMain.handle(IPC_CHANNELS.aiStatus, (): Promise<AiStatusResponse> => services.aiStatus());
  ipcMain.handle(IPC_CHANNELS.aiSetEngine, (_event, model: string) => services.aiSetEngine(model));
  ipcMain.handle(IPC_CHANNELS.aiGenerate, (_event, request: AiGenerateRequest) =>
    services.aiGenerate(request)
  );
  ipcMain.handle(IPC_CHANNELS.mathTopics, () => services.mathTopics());
  ipcMain.handle(IPC_CHANNELS.mathNewProblem, (_event, request: { templateId: string }) =>
    services.mathNewProblem(request)
  );
  ipcMain.handle(IPC_CHANNELS.mathCheckAnswer, (_event, request: { problem: MathProblem; answer: string }) =>
    services.mathCheckAnswer(request)
  );
  ipcMain.handle(IPC_CHANNELS.mathReveal, (_event, request: { problem: MathProblem }) =>
    services.mathReveal(request)
  );
  ipcMain.handle(IPC_CHANNELS.mathHint, (_event, request: { problem: MathProblem; userMessage: string }) =>
    services.mathHint(request)
  );
  ipcMain.handle(IPC_CHANNELS.srsDecks, () => services.srsDecks());
  ipcMain.handle(IPC_CHANNELS.srsDraw, (_event, request: { deckName: string }) =>
    services.srsDraw(request)
  );
  ipcMain.handle(IPC_CHANNELS.srsReveal, (_event, request: { id: number }) =>
    services.srsReveal(request)
  );
  ipcMain.handle(IPC_CHANNELS.srsGrade, (_event, request: { id: number; correct: boolean }) =>
    services.srsGrade(request)
  );
  ipcMain.handle(IPC_CHANNELS.ingestSelectFile, () => services.ingestSelectFile());
  ipcMain.handle(IPC_CHANNELS.ingestRun, (_event, request: { path: string; maxChunks?: number }) =>
    services.ingestRun(request)
  );
  ipcMain.handle(IPC_CHANNELS.ingestLibrary, () => services.ingestLibrary());
  ipcMain.handle(IPC_CHANNELS.ingestDelete, (_event, request: { sourceTitle: string }) =>
    services.ingestDelete(request)
  );
  ipcMain.handle(IPC_CHANNELS.epIngest, (_event, request: EpisodicIngestRequest) =>
    services.epIngest(request)
  );
  ipcMain.handle(IPC_CHANNELS.epTracks, () => services.epTracks());
  ipcMain.handle(IPC_CHANNELS.epFeed, (_event, request: { bookTitle: string }) =>
    services.epFeed(request)
  );
  ipcMain.handle(IPC_CHANNELS.epFinish, (_event, request: { bookTitle: string }) =>
    services.epFinish(request)
  );
  ipcMain.handle(IPC_CHANNELS.epQuestions, (_event, request: { contentUuid: string }) =>
    services.epQuestions(request)
  );
  ipcMain.handle(IPC_CHANNELS.readPassages, () => services.readPassages());
  ipcMain.handle(IPC_CHANNELS.readStart, (_event, request: { uuid: string }) =>
    services.readStart(request)
  );
  ipcMain.handle(
    IPC_CHANNELS.readSubmit,
    (_event, request: { uuid: string; questionIndex: number; answer: string }) =>
      services.readSubmit(request)
  );
}
