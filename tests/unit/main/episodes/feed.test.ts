import { describe, expect, it } from 'vitest';
import { buildFeed, nextEpisodeInFeed } from '@main/episodes/feed';

describe('buildFeed — serialized (canonical) tracks', () => {
  it('locks ascending episode order regardless of insert order', () => {
    expect(buildFeed([5, 1, 3, 2, 4], true, 'wolves')).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic and independent of the seed key', () => {
    expect(buildFeed([2, 1], true, 'a')).toEqual(buildFeed([1, 2], true, 'b'));
  });
});

describe('buildFeed — anthology (independent) tracks', () => {
  it('shuffles deterministically per book (same seed key → same order)', () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(buildFeed(numbers, false, 'asimov')).toEqual(buildFeed(numbers, false, 'asimov'));
  });

  it('produces a permutation (same multiset, mixed order)', () => {
    const numbers = Array.from({ length: 12 }, (_, i) => i + 1);
    const feed = buildFeed(numbers, false, 'essays');
    expect([...feed].sort((a, b) => a - b)).toEqual(numbers);
    expect(feed).not.toEqual(numbers); // 12 elements: shuffle must move something
  });

  it('differs between books (title-mixed seed)', () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(buildFeed(numbers, false, 'book-a')).not.toEqual(buildFeed(numbers, false, 'book-b'));
  });

  it('handles a single-episode book', () => {
    expect(buildFeed([1], false, 'solo')).toEqual([1]);
  });
});

describe('nextEpisodeInFeed (streak gating)', () => {
  const feed = [3, 1, 4, 2]; // anthology-style order

  it('maps the 1-based streak position into feed order', () => {
    expect(nextEpisodeInFeed(feed, 1)).toBe(3);
    expect(nextEpisodeInFeed(feed, 2)).toBe(1);
    expect(nextEpisodeInFeed(feed, 4)).toBe(2);
  });

  it('returns null before start and after completion', () => {
    expect(nextEpisodeInFeed(feed, 0)).toBeNull();
    expect(nextEpisodeInFeed(feed, 5)).toBeNull();
  });

  it('gates canonical tracks without skipping', () => {
    const canonical = buildFeed([1, 2, 3], true, 'novel');
    expect(nextEpisodeInFeed(canonical, 1)).toBe(1);
    expect(nextEpisodeInFeed(canonical, 2)).toBe(2);
    expect(nextEpisodeInFeed(canonical, 3)).toBe(3);
    expect(nextEpisodeInFeed(canonical, 4)).toBeNull();
  });
});
