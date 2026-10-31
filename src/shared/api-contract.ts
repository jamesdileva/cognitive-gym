import type { AiGenerateRequest, AiResult, AiStatusResponse } from './ai-types';
import type {
  MathCheckResponse,
  MathHintResult,
  MathProblem,
  MathRevealResponse,
  MathTopicSummary
} from './math-types';
import type { DeckSummary, SrsCard, SrsGradeResult } from './srs-types';
import type {
  IngestProgress,
  IngestionReport,
  IngestedSourceSummary
} from './ingestion-types';
import type { DbStatusResponse, PingRequest, PingResponse } from './ipc-types';

/**
 * The complete surface the preload script exposes to the renderer as `window.api`.
 * Preload implements this interface and the renderer consumes it, so a channel
 * added on one side without the other fails typecheck.
 */
export interface GymApi {
  ping(request: PingRequest): Promise<PingResponse>;
  dbStatus(): Promise<DbStatusResponse>;
  aiStatus(): Promise<AiStatusResponse>;
  aiSetEngine(model: string): Promise<{ engine: string }>;
  aiGenerate(request: AiGenerateRequest): Promise<AiResult>;
  mathTopics(): Promise<{ topics: MathTopicSummary[] }>;
  mathNewProblem(request: { templateId: string }): Promise<{ problem: MathProblem }>;
  mathCheckAnswer(request: { problem: MathProblem; answer: string }): Promise<MathCheckResponse>;
  mathReveal(request: { problem: MathProblem }): Promise<MathRevealResponse>;
  mathHint(request: { problem: MathProblem; userMessage: string }): Promise<MathHintResult>;
  srsDecks(): Promise<{ decks: DeckSummary[] }>;
  srsDraw(request: { deckName: string }): Promise<{ card: SrsCard | null }>;
  srsReveal(request: { id: number }): Promise<{ back: string }>;
  srsGrade(request: { id: number; correct: boolean }): Promise<SrsGradeResult>;
  ingestSelectFile(): Promise<{ path: string | null }>;
  ingestRun(request: { path: string; maxChunks?: number }): Promise<IngestionReport>;
  ingestLibrary(): Promise<{ sources: IngestedSourceSummary[] }>;
  ingestDelete(request: { sourceTitle: string }): Promise<{ deleted: boolean }>;
  /** Subscribes to main→renderer progress events; returns an unsubscribe fn. */
  onIngestProgress(callback: (progress: IngestProgress) => void): () => void;
}
