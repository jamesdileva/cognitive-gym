/** Ingestion pipeline contract (blueprint.md §2): file → extract → chunk → distill → SQLite. */

export type BookKind = 'pdf' | 'epub' | 'txt';

export interface IngestProgress {
  stage: 'extracting' | 'distilling' | 'episodes' | 'questions' | 'stories' | 'math-templates';
  current: number;
  total: number;
}

export interface IngestionFailure {
  chunkIndex: number;
  reason: string;
}

export interface IngestionReport {
  title: string;
  kind: BookKind;
  /** Reading chunks produced by the chunker (before any maxChunks limit). */
  chunkCount: number;
  /** Chunks successfully distilled and written to the content pool. */
  ingestedCount: number;
  /** Comprehension questions stored across all ingested chunks. */
  questionCount: number;
  failures: IngestionFailure[];
}

export interface IngestedSourceSummary {
  sourceTitle: string;
  chunkCount: number;
  questionCount: number;
  createdAt: string;
}
