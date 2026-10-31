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
import type {
  DailyFeed,
  EpisodeQuestion,
  EpisodeSummary,
  EpisodeTrack,
  EpisodicIngestReport,
  EpisodicIngestRequest
} from './episodes-types';
import type {
  GradeResult,
  ReadingPassageSummary,
  ReadingSession
} from './reading-types';
import type {
  CodingProblemView,
  DiagnosticsKind,
  DiagnosticsListItem,
  DiagnosticsSubmitResult,
  LogicPuzzleView,
  LogicRow,
  SystemsCaseView
} from './diagnostics-types';
import type { SynthesisReport } from './synthesis-types';
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
  epIngest(request: EpisodicIngestRequest): Promise<EpisodicIngestReport>;
  epTracks(): Promise<{ tracks: EpisodeTrack[] }>;
  /** Without episodeNumber: today's gated episode. With one: a read-only revisit. */
  epFeed(request: { bookTitle: string; episodeNumber?: number }): Promise<{ feed: DailyFeed }>;
  epFinish(request: { bookTitle: string }): Promise<{ nextEpisodeNumber: number | null }>;
  epQuestions(request: { contentUuid: string }): Promise<{ questions: EpisodeQuestion[] }>;
  epList(request: { bookTitle: string }): Promise<{ episodes: EpisodeSummary[] }>;
  readPassages(): Promise<{ passages: ReadingPassageSummary[] }>;
  readStart(request: { uuid: string }): Promise<{ session: ReadingSession }>;
  readSubmit(request: {
    uuid: string;
    questionIndex: number;
    answer: string;
  }): Promise<GradeResult>;
  diagContent(request: { kind: DiagnosticsKind }): Promise<{ items: DiagnosticsListItem[] }>;
  diagOpen(request: {
    kind: DiagnosticsKind;
    id: string;
  }): Promise<{ item: CodingProblemView | LogicPuzzleView | SystemsCaseView }>;
  diagSubmit(request: {
    kind: DiagnosticsKind;
    id: string;
    answer: string | LogicRow[];
  }): Promise<DiagnosticsSubmitResult>;
  diagHint(request: {
    kind: DiagnosticsKind;
    id: string;
    answer: string | LogicRow[];
  }): Promise<{ ok: true; hint: string } | { ok: false; failure: { kind: string; message: string } }>;
  synthStories(request: { count: number }): Promise<SynthesisReport>;
  synthMath(request: { count: number }): Promise<SynthesisReport>;
}
