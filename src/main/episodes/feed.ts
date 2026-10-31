import { fnv1a32, mulberry32 } from '../math/specEngine';

/**
 * Feed ordering (book-to-shortstories.md "Narrative Continuity vs Random Mixing"):
 *  - Serialized (canonical) tracks play in locked ascending episode order —
 *    no spoilers, no lost timeline.
 *  - Anthology (independent) tracks are shuffled with a seed derived from the
 *    book title, so every reader/session sees the same stable-but-mixed order.
 * Gating is positional: the streak's current_episode indexes into this feed.
 */
export function buildFeed(episodeNumbers: number[], isCanonical: boolean, seedKey: string): number[] {
  const ascending = [...episodeNumbers].sort((a, b) => a - b);
  if (isCanonical) return ascending;

  const shuffled = [...ascending];
  const prng = mulberry32(fnv1a32(`feed:${seedKey}`));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(prng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** The episode number the user should read next, or null when the track is done. */
export function nextEpisodeInFeed(feed: number[], currentEpisode: number): number | null {
  if (currentEpisode < 1 || currentEpisode > feed.length) return null;
  return feed[currentEpisode - 1];
}
