import type { AiFailure } from './ai-types';

/** Diagnostics rooms contract (architecture.md §6C/§6D + v0.2 quiz room). */

export type DiagnosticsKind = 'coding' | 'logic' | 'systems' | 'quiz';

export interface CodingProblemView {
  id: string;
  title: string;
  language: string;
  goal: string;
  code: string;
}

export interface LogicPuzzleView {
  id: string;
  title: string;
  /** Exactly three categories × three values (classic mini deduction grid). */
  categories: Record<string, string[]>;
  clues: string[];
  /** Rows of the first category's entities to fill via dropdowns. */
  rowCategory: string;
  fillCategories: string[];
}

/** One submitted assignment row: { Category: chosenValue, ... } keyed by fill category. */
export type LogicRow = Record<string, string>;

/** Systems log case view — the trace, no diagnosis criteria. */
export interface SystemsCaseView {
  id: string;
  title: string;
  goal: string;
  logText: string;
}

/** Multiple-choice quiz item (analogies, odd-one-out) — no answer shipped. */
export interface QuizItemView {
  id: string;
  kind: 'analogy' | 'odd-one-out';
  title: string;
  prompt: string;
  options: string[];
}

export interface DiagnosticsListItem {
  id: string;
  title: string;
  detail: string;
}

/** Deterministic result for logic grids and quizzes; graded for coding/systems. */
export type DiagnosticsSubmitResult =
  | { kind: 'logic'; correct: boolean; note: string }
  | { kind: 'quiz'; correct: boolean; note: string; explanation: string }
  | { kind: 'graded'; ok: true; score: number; feedback: string }
  | { ok: false; failure: AiFailure };
