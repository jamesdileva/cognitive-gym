import { describe, expect, it } from 'vitest';
import { nextQuestion } from '@shared/drill/generator';
import { mulberry32 } from '@main/math/specEngine';

/** Pulls a deterministic stream of questions and returns their parsed answers. */
function stream(score: number, count: number, seed: number): { prompt: string; answer: number }[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => nextQuestion(score, rand));
}

describe('nextQuestion (speed drill generator)', () => {
  it('is deterministic for the same score + rand stream', () => {
    expect(stream(2, 10, 7)).toEqual(stream(2, 10, 7));
  });

  it('tier 1 (score 0–3): small +/− with exact integer answers', () => {
    for (const q of stream(0, 40, 11)) {
      expect(q.answer).toBeGreaterThanOrEqual(2);
      expect(q.answer).toBeLessThanOrEqual(40);
      expect(q.prompt).toMatch(/^\d+ [+−] \d+ = \?$/);
    }
  });

  it('tier 2 (score 4–7): multiplication tables 2–10', () => {
    for (const q of stream(5, 40, 13)) {
      expect(q.prompt).toMatch(/^\d+ × \d+ = \?$/);
      const [a, b] = q.prompt.match(/\d+/g) ?? ['0', '0'];
      expect(Number(a)).toBeGreaterThanOrEqual(2);
      expect(Number(a)).toBeLessThanOrEqual(10);
      expect(q.answer).toBe(Number(a) * Number(b));
    }
  });

  it('tier 3 (score 8–11): two-digit +/−, subtraction stays positive', () => {
    for (const q of stream(9, 40, 17)) {
      const [a, b] = q.prompt.match(/\d+/g) ?? ['0', '0'];
      expect(Number(a)).toBeGreaterThanOrEqual(11);
      if (q.prompt.includes('−')) {
        expect(Number(a)).toBeGreaterThanOrEqual(Number(b)); // larger-first rendering
        expect(q.answer).toBe(Number(a) - Number(b));
      } else {
        expect(q.answer).toBe(Number(a) + Number(b));
      }
    }
  });

  it('tier 4 (score 12+): mixed, operands within designed bounds', () => {
    for (const q of stream(20, 60, 19)) {
      const [a, b] = q.prompt.match(/\d+/g) ?? ['0', '0'];
      expect(Number(a)).toBeLessThanOrEqual(99);
      if (q.prompt.includes('×')) {
        expect(Number(a)).toBeLessThanOrEqual(12);
        expect(q.answer).toBe(Number(a) * Number(b));
      }
    }
  });

  it('subtraction prompts are always solvable (answer = first − second)', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      for (const score of [0, 9, 25]) {
        for (const q of stream(score, 30, seed * 31 + score)) {
          if (q.prompt.includes('−')) {
            const [a, b] = q.prompt.match(/\d+/g) ?? ['0', '0'];
            expect(q.answer).toBe(Number(a) - Number(b));
          }
        }
      }
    }
  });
});
