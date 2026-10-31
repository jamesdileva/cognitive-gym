/**
 * Chunking engine (blueprint.md §2 step 2 + book-to-shortstories.md rules):
 *  - reading blocks of 300–600 words, readable under 5 minutes
 *  - paragraph-edge safe: chunks are built from whole paragraphs
 *  - never cut mid-sentence: oversized paragraphs split at sentence boundaries
 *  - the final remainder may fall below the minimum rather than cutting mid-text
 */

export const MIN_CHUNK_WORDS = 300;
export const MAX_CHUNK_WORDS = 600;

/** Splits text into sentences (approximate, typography-based, decimal-safe). */
export function splitSentences(text: string): string[] {
  // Mask decimal points so "3.5" is not treated as a sentence end. The
  // sentinel \uFDD0 is a Unicode noncharacter that cannot occur in real text.
  const masked = text.replace(/(\d)\.(\d)/g, '$1\uFDD0$2');
  const matches = masked.match(/[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g) ?? [masked];
  return matches
    .map((sentence) => sentence.replace(/\uFDD0/g, '.').trim())
    .filter((sentence) => sentence.length > 0);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Splits one oversized text (≥ MAX words) at sentence boundaries into pieces
 * whose word counts stay under MAX and as close to MIN as possible.
 */
export function splitAtSentenceBoundaries(text: string, maxWords: number): string[] {
  const pieces: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of splitSentences(text)) {
    const words = countWords(sentence);
    if (currentWords > 0 && currentWords + words > maxWords) {
      pieces.push(current.join(' '));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += words;
  }
  if (current.length > 0) pieces.push(current.join(' '));
  return pieces;
}

/**
 * Builds reading chunks from paragraphs. Greedy accumulation to MIN; a
 * paragraph that would push past MAX is deferred to the next chunk; oversized
 * paragraphs are split at sentence boundaries. The trailing remainder is
 * merged into the last chunk (bounded overshoot) when possible.
 */
export function chunkParagraphs(paragraphs: string[], minWords = MIN_CHUNK_WORDS, maxWords = MAX_CHUNK_WORDS): string[] {
  // Normalize input: split any paragraph already exceeding the max.
  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (countWords(paragraph) > maxWords) {
      units.push(...splitAtSentenceBoundaries(paragraph, maxWords));
    } else {
      units.push(paragraph);
    }
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  const flush = (): void => {
    if (current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [];
      currentWords = 0;
    }
  };

  for (const unit of units) {
    const words = countWords(unit);
    if (currentWords > 0 && currentWords + words > maxWords) {
      flush();
    }
    current.push(unit);
    currentWords += words;
    if (currentWords >= minWords) {
      flush();
    }
  }
  flush();

  // Merge a short trailing remainder into the previous chunk (≤ +50% overshoot).
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    const lastWords = countWords(last);
    if (lastWords < minWords) {
      const previous = chunks[chunks.length - 2];
      const previousWords = countWords(previous);
      if (previousWords + lastWords <= maxWords + Math.floor(maxWords / 2)) {
        chunks.splice(chunks.length - 2, 2, `${previous}\n\n${last}`);
      }
    }
  }

  return chunks;
}
