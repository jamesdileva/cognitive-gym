import { describe, expect, it } from 'vitest';
import {
  BOX_INTERVAL_DAYS,
  LEITNER_BOX_COUNT,
  intervalDaysFor,
  newCardState,
  review
} from '@main/srs/leitner';

const NOW = new Date('2026-10-30T12:00:00.000Z');

describe('Leitner transitions (correct/incorrect × all boxes)', () => {
  it('promotes one box per correct answer, capped at box 5', () => {
    for (let box = 1; box <= LEITNER_BOX_COUNT; box += 1) {
      const expected = Math.min(box + 1, LEITNER_BOX_COUNT);
      expect(review({ box }, true, NOW).box).toBe(expected);
    }
  });

  it('resets any box to 1 on an incorrect answer', () => {
    for (let box = 1; box <= LEITNER_BOX_COUNT; box += 1) {
      expect(review({ box }, false, NOW).box).toBe(1);
    }
  });

  it('schedules due dates exactly per the interval table', () => {
    // correct from box 1 → box 2 → 2 days
    const promoted = review({ box: 1 }, true, NOW);
    expect(promoted).toEqual({ box: 2, dueAt: '2026-11-01T12:00:00.000Z' });

    // correct from box 4 → box 5 → 16 days
    expect(review({ box: 4 }, true, NOW)).toEqual({
      box: 5,
      dueAt: '2026-11-15T12:00:00.000Z'
    });

    // incorrect from any box → box 1 → 1 day
    expect(review({ box: 3 }, false, NOW)).toEqual({
      box: 1,
      dueAt: '2026-10-31T12:00:00.000Z'
    });
  });

  it('uses an exponential interval table across all boxes', () => {
    expect(BOX_INTERVAL_DAYS).toEqual([1, 2, 4, 8, 16]);
    expect(intervalDaysFor(1)).toBe(1);
    expect(intervalDaysFor(LEITNER_BOX_COUNT)).toBe(16);
  });

  it('starts new cards in box 1, due immediately', () => {
    const state = newCardState(NOW);
    expect(state).toEqual({ box: 1, dueAt: NOW.toISOString() });
  });

  it('chained correct answers climb the full ladder', () => {
    let state = newCardState(NOW);
    const boxes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      state = review(state, true, NOW);
      boxes.push(state.box);
    }
    expect(boxes).toEqual([2, 3, 4, 5, 5, 5]);
  });
});
