/**
 * Typed IPC channel contract shared by main, preload, and renderer.
 *
 * AGENTS.md §3: all cross-process access goes through these typed channels —
 * renderer code never touches Node, SQLite, or Ollama directly.
 */

export const IPC_CHANNELS = {
  /** Round-trip health check for the Electron process bridge. */
  ping: 'system:ping',
  /** Database health snapshot (schema version + row counts). */
  dbStatus: 'db:status',
  /** Ollama engine + installed models + availability. */
  aiStatus: 'ai:status',
  /** Persist the engine model selection. */
  aiSetEngine: 'ai:set-engine',
  /** Run one non-streaming generation against a named model. */
  aiGenerate: 'ai:generate',
  /** Math module: topic list joined with user progress. */
  mathTopics: 'math:topics',
  /** Math module: generate a fresh problem instance (answer stays main-side). */
  mathNewProblem: 'math:new-problem',
  /** Math module: check a user answer (records an attempt). */
  mathCheckAnswer: 'math:check',
  /** Math module: user-initiated worked solution. */
  mathReveal: 'math:reveal',
  /** Math module: Socratic hint via the registry prompt. */
  mathHint: 'math:hint',
  /** Flashcards: deck summaries with due counts. */
  srsDecks: 'srs:decks',
  /** Flashcards: draw the next due card (front only). */
  srsDraw: 'srs:draw',
  /** Flashcards: flip the card without grading. */
  srsReveal: 'srs:reveal',
  /** Flashcards: apply the Leitner transition for a self-graded review. */
  srsGrade: 'srs:grade',
  /** Ingestion: open the native file picker (pdf/epub/txt). */
  ingestSelectFile: 'ingest:select-file',
  /** Ingestion: run the full pipeline on a file (long-running). */
  ingestRun: 'ingest:run',
  /** Ingestion: list ingested sources with chunk/question counts. */
  ingestLibrary: 'ingest:library',
  /** Ingestion: delete an ingested source and its prompts (FK cascade). */
  ingestDelete: 'ingest:delete',
  /** Ingestion: main→renderer progress events during a run. */
  ingestProgress: 'ingest:progress',
  /** Episodes: ingest a book file as an episode track (long-running). */
  epIngest: 'ep:ingest',
  /** Episodes: list tracks with streak progress. */
  epTracks: 'ep:tracks',
  /** Episodes: today's feed entry for a track. */
  epFeed: 'ep:feed',
  /** Episodes: mark today's episode read (advances the streak). */
  epFinish: 'ep:finish',
  /** Episodes: comprehension questions linked to an episode. */
  epQuestions: 'ep:questions',
  /** Episodes: revisit browser list (titles only). */
  epList: 'ep:list',
  /** Reading Room: passage list with question counts. */
  readPassages: 'read:passages',
  /** Reading Room: open a passage session (criteria stay main-side). */
  readStart: 'read:start',
  /** Reading Room: submit a free-text answer for semantic grading. */
  readSubmit: 'read:submit',
  /** Diagnostics rooms: list items for a kind (coding/logic/systems). */
  diagContent: 'diag:content',
  /** Diagnostics rooms: open one item (solutions stay main-side). */
  diagOpen: 'diag:open',
  /** Diagnostics rooms: submit an answer/board for checking or grading. */
  diagSubmit: 'diag:submit',
  /** Diagnostics rooms: hint ladder (coding) / contradiction alert (logic). */
  diagHint: 'diag:hint'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Request payload for {@link IPC_CHANNELS.ping}. */
export interface PingRequest {
  /** Arbitrary string echoed back by the main process. */
  payload: string;
}

/** Response payload for {@link IPC_CHANNELS.ping}. */
export interface PingResponse {
  /** The exact payload that was sent. */
  echo: string;
  /** Main-process clock (ms) at handling time. */
  receivedAtMs: number;
}

/** Response payload for {@link IPC_CHANNELS.dbStatus}. */
export interface DbStatusResponse {
  /** Highest applied schema version (0 = no migrations applied). */
  migrationVersion: number;
  /** Row count per tracked table. */
  tableCounts: Record<string, number>;
  /** Sum of all tracked row counts. */
  totalRows: number;
}
