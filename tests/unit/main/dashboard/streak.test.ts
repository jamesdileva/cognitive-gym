import { describe, expect, it } from 'vitest';
import { computeStreak } from '@main/dashboard/streak';

const day = (offsetFromToday: number, now: Date): Date =>
  new Date(now.getTime() - offsetFromToday * 86_400_000);

const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe('computeStreak (pure, UTC-day based)', () => {
  const now = new Date('2026-10-31T15:00:00.000Z');

  it('counts consecutive days ending today', () => {
    const dates = [0, 1, 2, 3].map((offset) => iso(day(offset, now)));
    expect(computeStreak(dates, now)).toBe(4);
  });

  it('counts through yesterday when today has no activity yet', () => {
    const dates = [1, 2, 3, 4].map((offset) => iso(day(offset, now)));
    expect(computeStreak(dates, now)).toBe(4);
  });

  it('breaks on a gap', () => {
    const dates = [0, 1, 3, 4].map((offset) => iso(day(offset, now)));
    expect(computeStreak(dates, now)).toBe(2);
  });

  it('returns zero with no history', () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it('ignores stale activity beyond the chain', () => {
    const dates = [0, 1, 10, 11, 12].map((offset) => iso(day(offset, now)));
    expect(computeStreak(dates, now)).toBe(2);
  });

  it('handles month boundaries (October → November)', () => {
    const endOfOctober = new Date('2026-11-01T12:00:00.000Z');
    const dates = [
      '2026-10-30',
      '2026-10-31',
      '2026-11-01'
    ];
    expect(computeStreak(dates, endOfOctober)).toBe(3);
  });
});
