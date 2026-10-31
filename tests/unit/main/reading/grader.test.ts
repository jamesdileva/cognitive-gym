import { describe, expect, it, vi } from 'vitest';
import { OllamaError } from '@main/ollama/ollamaClient';
import { createGrader, validateGrade } from '@main/reading/grader';

function makeEngine(outputs: string[]) {
  const calls: { prompt: string; system?: string }[] = [];
  const queue = [...outputs];
  const engine = {
    generateWithEngine: vi.fn(async (request: { prompt: string; system?: string }) => {
      calls.push(request);
      const next = queue.shift();
      if (next === undefined) throw new Error('script exhausted');
      return {
        text: next,
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      };
    })
  };
  return { engine, calls };
}

const INPUT = {
  passage: 'The harbor kept its silence while the fog moved between the masts.',
  question: 'What does the fog symbolize?',
  solutionCriteria: 'Must connect fog to withheld information and patience.',
  answer: 'The fog hides things — the town is not ready to see them yet.'
};

describe('createGrader (mocked engine)', () => {
  it('grades on the first attempt and clamps nothing when in range', async () => {
    const { engine, calls } = makeEngine([
      JSON.stringify({ score: 85, feedback: 'Strong start — but one mechanism is unaddressed. What does the fog actually withhold?' })
    ]);

    const outcome = await createGrader({ engine }).grade(INPUT);
    expect(outcome).toMatchObject({ ok: true, score: 85, attempts: 1 });
    expect(calls[0].system).toContain('NEVER reveal, restate, or paraphrase the solution vector');
    expect(calls[0].system).toContain(INPUT.answer);
    expect(calls[0].system).toContain(INPUT.solutionCriteria);
  });

  it('clamps out-of-range scores into 0–100', async () => {
    const { engine } = makeEngine([JSON.stringify({ score: 130, feedback: 'ok' })]);
    expect(await createGrader({ engine }).grade(INPUT)).toMatchObject({ ok: true, score: 100 });

    const { engine: low } = makeEngine([JSON.stringify({ score: -7.6, feedback: 'nope' })]);
    expect(await createGrader({ engine: low }).grade(INPUT)).toMatchObject({ ok: true, score: 0 });
  });

  it('retries malformed JSON and fails after exhausting attempts', async () => {
    const good = JSON.stringify({ score: 40, feedback: 'Partially there. What was the ledger really tracking?' });
    const { engine, calls } = makeEngine(['prose, not json', good]);
    expect(await createGrader({ engine }).grade(INPUT)).toMatchObject({ ok: true, attempts: 2 });
    expect(calls[1].prompt).toContain('ONLY the JSON object');

    const { engine: bad } = makeEngine(['a', 'b', 'c']);
    expect(await createGrader({ engine: bad }).grade(INPUT)).toMatchObject({ ok: false, attempts: 3 });
  });

  it('does not retry when the engine is unreachable', async () => {
    const engine = {
      generateWithEngine: vi.fn(async () => {
        throw new OllamaError('unreachable', 'ECONNREFUSED');
      })
    };
    expect(await createGrader({ engine }).grade(INPUT)).toMatchObject({
      ok: false,
      attempts: 1,
      reason: expect.stringContaining('unreachable')
    });
  });
});

describe('validateGrade', () => {
  it('rejects non-objects, missing score, and empty feedback', () => {
    expect(validateGrade('prose').ok).toBe(false);
    expect(validateGrade({ feedback: 'f' }).ok).toBe(false);
    expect(validateGrade({ score: 50 }).ok).toBe(false);
    expect(validateGrade({ score: '50', feedback: 'f' }).ok).toBe(false);
  });
});
