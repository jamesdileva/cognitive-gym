import type { BookKind, IngestionFailure } from './ingestion-types';

/** Episodic reader contract (book-to-shortstories.md "30-Day Brain Gym"). */

export interface EpisodeTrack {
  bookTitle: string;
  episodeCount: number;
  isCanonical: boolean;
  /** Streak position: the feed index (1-based) of the next episode to read. */
  currentEpisode: number;
  lastReadDate: string | null;
}

export interface EpisodeView {
  episodeNumber: number;
  episodeTitle: string;
  /** "Previously on" for canonical tracks; premise hook for anthologies. */
  recap: string;
  text: string;
  contentUuid: string | null;
}

export interface DailyFeed {
  bookTitle: string;
  isCanonical: boolean;
  /** 1-based position in the track's feed order. */
  position: number;
  total: number;
  /** Null when the track is finished. */
  episode: EpisodeView | null;
}

export interface EpisodeQuestion {
  questionIndex: number;
  promptText: string;
  solutionCriteria: string;
}

export interface EpisodicIngestRequest {
  path: string;
  isCanonical: boolean;
  maxEpisodes?: number;
}

export interface EpisodicIngestReport {
  title: string;
  kind: BookKind;
  chunkCount: number;
  /** Episodes written (meta agent succeeded). */
  ingestedCount: number;
  /** Questions stored via the distiller across those episodes. */
  questionCount: number;
  failures: IngestionFailure[];
}
