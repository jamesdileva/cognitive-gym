import type { AiFailure } from './ai-types';

/**
 * Math module contract. The renderer only ever receives a problem *reference*
 * (templateId + seed + display text) — never the answer or solution steps.
 * The main process re-instantiates deterministically from the reference to
 * check, reveal, or hint (Socratic principle: answers stay main-side).
 */

export interface MathProblem {
  templateId: string;
  seed: number;
  topic: string;
  /** Human-facing problem statement, variables already substituted. */
  display: string;
}

export interface MathTopicSummary {
  templateId: string;
  topic: string;
  totalAttempts: number;
  successfulAttempts: number;
}

export interface MathCheckResponse {
  correct: boolean;
  /** UX copy; never contains the answer. */
  note: string;
}

export interface MathRevealResponse {
  steps: string[];
  answer: string;
}

export type MathHintResult = { ok: true; hint: string } | { ok: false; failure: AiFailure };
