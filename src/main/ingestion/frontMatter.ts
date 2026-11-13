/**
 * Front-matter detection (user report: Knight Physics ingested its copyright
 * page as lesson content). Pure heuristic — a chunk dominated by publisher
 * boilerplate (copyright, ISBN, revenue statements) is skipped at ingestion
 * time so lessons start at real content.
 *
 * Scoring is fraction-of-sentences (not per-100-words density): real chunks
 * are 300–600+ words, so a density gate mathematically cannot fire on them —
 * twelve distinct patterns can never reach "2 hits per 100 words" in a
 * 1400-word title/copyright block. Empirically (probe against stored chunks):
 * boilerplate blocks score 0.27–0.59 marker-sentence fraction with 7–10
 * distinct markers; narrative content scores ≤0.07 with ≤1 distinct marker.
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

/** One sentence = text between sentence punctuation or line breaks. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).filter(Boolean).length >= 3);
}

export interface FrontMatterScore {
  /** Sentences long enough to judge (3+ words). */
  sentences: number;
  /** Sentences containing at least one boilerplate marker. */
  markerSentences: number;
  /** Distinct marker patterns present anywhere in the chunk. */
  distinct: number;
}

export function frontMatterScore(text: string): FrontMatterScore {
  const sentences = splitSentences(text);
  let markerSentences = 0;
  const distinct = new Set<string>();
  for (const sentence of sentences) {
    let hit = false;
    for (const pattern of BOILERPLATE_PATTERNS) {
      if (pattern.test(sentence)) {
        hit = true;
        distinct.add(pattern.source);
      }
    }
    if (hit) markerSentences += 1;
  }
  return { sentences: sentences.length, markerSentences, distinct: distinct.size };
}

/**
 * True when the chunk reads like a publisher block: several distinct
 * boilerplate markers and a quarter of its sentences carrying them. Real
 * content mentions at most one or two markers incidentally (probe: ≤0.07
 * fraction); author notes and prefaces are prose and correctly stay.
 */
export function isLikelyFrontMatter(text: string): boolean {
  const score = frontMatterScore(text);
  if (score.sentences < 4) return false;
  return score.distinct >= 3 && score.markerSentences / score.sentences >= 0.25;
}
