import type { IngestionFailure } from './ingestion-types';

/** Synthetic seed pipeline contract (blueprint.md §1, Sprint 9). */

export interface SynthesisReport {
  requested: number;
  generated: number;
  /** Stories: comprehension questions stored across generated stories. */
  questionCount: number;
  failures: IngestionFailure[];
}

export interface GeneratedStory {
  title: string;
  storyText: string;
  questions: { questionIndex: number; promptText: string; solutionCriteria: string }[];
}
