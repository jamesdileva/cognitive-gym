import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@main/math/specEngine';
import {
  MAX_CHUNK_WORDS,
  MIN_CHUNK_WORDS,
  chunkParagraphs,
  countWords,
  splitAtSentenceBoundaries,
  splitSentences
} from '@main/ingestion/chunker';

/** Deterministic pseudo-book: seeded sentences of 8–20 words per paragraph. */
function makeCorpus(paragraphs: number, seed: number): string[] {
  const prng = mulberry32(seed);
  const words = ['the', 'harbor', 'kept', 'its', 'silence', 'while', 'fog', 'moved', 'between', 'masts', 'like', 'a', 'slow', 'animal', 'learning', 'patience', 'again', 'tonight', 'and', 'always'];
  const output: string[] = [];
  for (let p = 0; p < paragraphs; p += 1) {
    const sentenceCount = 3 + Math.floor(prng() * 4);
    const sentences: string[] = [];
    for (let s = 0; s < sentenceCount; s += 1) {
      const length = 8 + Math.floor(prng() * 12);
      const sentence: string[] = [];
      for (let w = 0; w < length; w += 1) {
        sentence.push(words[Math.floor(prng() * words.length)]);
      }
      sentences.push(`${sentence.join(' ')}.`);
    }
    output.push(sentences.join(' '));
  }
  return output;
}

describe('splitSentences', () => {
  it('splits on terminal punctuation and keeps the punctuation attached', () => {
    expect(splitSentences('One. Two! Three? Four…')).toEqual(['One.', 'Two!', 'Three?', 'Four…']);
  });

  it('keeps decimals intact', () => {
    expect(splitSentences('The ratio was 3.5 to 1. That mattered.')).toHaveLength(2);
  });
});

describe('splitAtSentenceBoundaries (giant paragraph splitter)', () => {
  it('never exceeds max words and never cuts mid-sentence', () => {
    const giant = makeCorpus(14, 42).join(' '); // ~600–1000 words in one paragraph
    const pieces = splitAtSentenceBoundaries(giant, MAX_CHUNK_WORDS);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(countWords(piece)).toBeLessThanOrEqual(MAX_CHUNK_WORDS);
      expect(piece.trim().endsWith('.')).toBe(true);
    }
  });
});

describe('chunkParagraphs (reading blocks)', () => {
  it('produces 300–600 word chunks from whole paragraphs', () => {
    const corpus = makeCorpus(24, 7); // ~40-90 words per paragraph
    const chunks = chunkParagraphs(corpus);

    expect(chunks.length).toBeGreaterThan(1);
    const wordCounts = chunks.map(countWords);
    for (const [index, count] of wordCounts.entries()) {
      const isLast = index === wordCounts.length - 1;
      if (!isLast) {
        expect(count).toBeGreaterThanOrEqual(MIN_CHUNK_WORDS);
        expect(count).toBeLessThanOrEqual(MAX_CHUNK_WORDS);
      }
    }
  });

  it('preserves all text on paragraph edges: chunks reassemble into the corpus', () => {
    const corpus = makeCorpus(20, 99);
    const chunks = chunkParagraphs(corpus);
    const reassembled = chunks.flatMap((chunk) => chunk.split('\n\n'));
    expect(reassembled).toEqual(corpus);
  });

  it('every chunk ends at a sentence boundary (never mid-sentence)', () => {
    const corpus = makeCorpus(30, 123);
    for (const chunk of chunkParagraphs(corpus)) {
      expect(chunk.trim()).toMatch(/[.!?…]$/);
    }
  });

  it('splits oversized paragraphs at sentence boundaries', () => {
    const giant = makeCorpus(14, 42).join(' ');
    const chunks = chunkParagraphs([giant]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(countWords(chunk)).toBeLessThanOrEqual(MAX_CHUNK_WORDS);
      expect(chunk.trim().endsWith('.')).toBe(true);
    }
  });

  it('merges a short trailing remainder into the previous chunk when possible', () => {
    const big = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} ${'word '.repeat(70)}end.`.trim());
    const tiny = 'One short closing line.';
    const chunks = chunkParagraphs([...big, tiny]);

    const last = chunks[chunks.length - 1];
    expect(last).toContain('closing line');
    expect(countWords(last)).toBeLessThanOrEqual(MAX_CHUNK_WORDS + MAX_CHUNK_WORDS / 2);
  });

  it('is deterministic for the same input', () => {
    const corpus = makeCorpus(18, 555);
    expect(chunkParagraphs(corpus)).toEqual(chunkParagraphs(corpus));
  });

  it('returns a single short chunk when the document is tiny', () => {
    expect(chunkParagraphs(['A short document.'])).toEqual(['A short document.']);
  });
});
