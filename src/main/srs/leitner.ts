/**
 * Leitner spaced-repetition scheduling (architecture.md §6, Sprint 4).
 * Pure and time-injected: no DB, no clock reads — fully deterministic tests.
 *
 * Classic Leitner rules on 5 boxes:
 *  - correct answer  → promote one box (box 5 is the cap)
 *  - incorrect answer → reset to box 1
 *  - a card in box N is due again after BOX_INTERVAL_DAYS[N - 1] days
 */

export const LEITNER_BOX_COUNT = 5;

/** Days until a card in box N comes due again (index = box - 1). */
export const BOX_INTERVAL_DAYS: readonly number[] = [1, 2, 4, 8, 16];

const DAY_MS = 86_400_000;

export interface LeitnerState {
  box: number;
  /** ISO-8601 UTC instant when the card should be reviewed again. */
  dueAt: string;
}

/** State for a freshly created card: box 1, due immediately. */
export function newCardState(now: Date = new Date()): LeitnerState {
  return { box: 1, dueAt: now.toISOString() };
}

/** Applies one review outcome and schedules the next review. */
export function review(state: { box: number }, correct: boolean, now: Date = new Date()): LeitnerState {
  const box = correct ? Math.min(state.box + 1, LEITNER_BOX_COUNT) : 1;
  const days = BOX_INTERVAL_DAYS[box - 1];
  return { box, dueAt: new Date(now.getTime() + days * DAY_MS).toISOString() };
}

/** Convenience for UI copy: the interval a card just scheduled, in days. */
export function intervalDaysFor(box: number): number {
  return BOX_INTERVAL_DAYS[box - 1];
}
