/**
 * Front-matter detection (user report: Knight Physics ingested its copyright
 * page as lesson content). Pure heuristic — a chunk dominated by publisher
 * boilerplate (copyright, ISBN, revenue statements) is skipped at ingestion
 * time so lessons start at real content.
 */

const BOILERPLATE_PATTERNS: RegExp[] = [
  /copyright/i,
  /©/,
  /all rights reserved/i,
  /ISBN(?:-1[03])?[:\s]/i,
  /published (?:by|in)/i,
  /printed in/i,
  /library of congress/i,
  /reproduction or transmission/i,
  /permissions? (?:department|contact|request)/i,
  /revenue/i,
  /www\.|https?:\/\//i,
  /\bedition\b/i
];

/** Counts distinct boilerplate markers and normalizes by word count. */
export function frontMatterScore(text: string): { hits: number; words: number } {
  const words = text.split(/\s+/).filter(Boolean).length;
  let hits = 0;
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(text)) hits += 1;
  }
  return { hits, words };
}

/**
 * True when the chunk is dominated by publisher boilerplate: at least three
 * distinct markers with a density of two+ per 100 words. Real content pages
 * mention at most one or two of these incidentally.
 */
export function isLikelyFrontMatter(text: string): boolean {
  const { hits, words } = frontMatterScore(text);
  if (words === 0) return false;
  const density = hits / Math.max(1, Math.ceil(words / 100));
  return hits >= 3 && density >= 2;
}
