import type { AiFailure } from './ai-types';

/** Reading Room contract: passages, sessions, AI-graded free-text answers. */

export interface ReadingPassageSummary {
  uuid: string;
  sourceTitle: string;
  subTopic: string | null;
  /** english | history — determines which progress bucket attempts land in. */
  module: string;
  questionCount: number;
  wordCount: number;
  excerpt: string;
}

export interface ReadingSession {
  uuid: string;
  sourceTitle: string;
  subTopic: string | null;
  module: string;
  text: string;
  /** Prompts only — solution criteria stay main-side (they ARE the answer). */
  questions: { questionIndex: number; promptText: string }[];
}

export type GradeResult =
  | { ok: true; score: number; feedback: string }
  | { ok: false; failure: AiFailure };
