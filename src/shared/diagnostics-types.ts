import type { AiFailure } from './ai-types';

/** Diagnostics rooms contract (architecture.md §6C/§6D): coding, logic, systems. */

export type DiagnosticsKind = 'coding' | 'logic' | 'systems';

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

export interface SystemsCaseView {
  id: string;
  title: string;
  goal: string;
  logText: string;
}

export interface DiagnosticsListItem {
  id: string;
  title: string;
  detail: string;
}

/** Deterministic result for logic grids; graded result for coding/systems. */
export type DiagnosticsSubmitResult =
  | { kind: 'logic'; correct: boolean; note: string }
  | { kind: 'graded'; ok: true; score: number; feedback: string }
  | { ok: false; failure: AiFailure };
