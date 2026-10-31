import { contextBridge, ipcRenderer } from 'electron';
import type { GymApi } from '@shared/api-contract';
import type { AiGenerateRequest } from '@shared/ai-types';
import type { IngestProgress } from '@shared/ingestion-types';
import type { EpisodicIngestRequest } from '@shared/episodes-types';
import type { MathProblem } from '@shared/math-types';
import { IPC_CHANNELS, type PingRequest } from '@shared/ipc-types';

/**
 * Bridges the sandboxed renderer to typed main-process handlers.
 * The `GymApi` annotation makes a contract mismatch a compile error here.
 */
const api: GymApi = {
  ping: (request: PingRequest) => ipcRenderer.invoke(IPC_CHANNELS.ping, request),
  dbStatus: () => ipcRenderer.invoke(IPC_CHANNELS.dbStatus),
  aiStatus: () => ipcRenderer.invoke(IPC_CHANNELS.aiStatus),
  aiSetEngine: (model: string) => ipcRenderer.invoke(IPC_CHANNELS.aiSetEngine, model),
  aiGenerate: (request: AiGenerateRequest) => ipcRenderer.invoke(IPC_CHANNELS.aiGenerate, request),
  mathTopics: () => ipcRenderer.invoke(IPC_CHANNELS.mathTopics),
  mathNewProblem: (request: { templateId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.mathNewProblem, request),
  mathCheckAnswer: (request: { problem: MathProblem; answer: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.mathCheckAnswer, request),
  mathReveal: (request: { problem: MathProblem }) =>
    ipcRenderer.invoke(IPC_CHANNELS.mathReveal, request),
  mathHint: (request: { problem: MathProblem; userMessage: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.mathHint, request),
  srsDecks: () => ipcRenderer.invoke(IPC_CHANNELS.srsDecks),
  srsDraw: (request: { deckName: string }) => ipcRenderer.invoke(IPC_CHANNELS.srsDraw, request),
  srsReveal: (request: { id: number }) => ipcRenderer.invoke(IPC_CHANNELS.srsReveal, request),
  srsGrade: (request: { id: number; correct: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.srsGrade, request),
  ingestSelectFile: () => ipcRenderer.invoke(IPC_CHANNELS.ingestSelectFile),
  ingestRun: (request: { path: string; maxChunks?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.ingestRun, request),
  ingestLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.ingestLibrary),
  ingestDelete: (request: { sourceTitle: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.ingestDelete, request),
  onIngestProgress: (callback: (progress: IngestProgress) => void) => {
    const listener = (_event: unknown, progress: IngestProgress): void => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.ingestProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ingestProgress, listener);
    };
  },
  epIngest: (request: EpisodicIngestRequest) => ipcRenderer.invoke(IPC_CHANNELS.epIngest, request),
  epTracks: () => ipcRenderer.invoke(IPC_CHANNELS.epTracks),
  epFeed: (request: { bookTitle: string }) => ipcRenderer.invoke(IPC_CHANNELS.epFeed, request),
  epFinish: (request: { bookTitle: string }) => ipcRenderer.invoke(IPC_CHANNELS.epFinish, request),
  epQuestions: (request: { contentUuid: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.epQuestions, request)
};

contextBridge.exposeInMainWorld('api', api);
