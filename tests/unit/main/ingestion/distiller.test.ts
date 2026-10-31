import { describe, expect, it, vi } from 'vitest';
import { OllamaError } from '@main/ollama/ollamaClient';
import { createDistiller, validateDistillation } from '@main/ingestion/distiller';
import type { GenerationResult } from '@shared/ai-types';

function generation(text: string): GenerationResult {
  return {
    text,
    model: 'test-model',
    metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
  };
}

const VALID_JSON = JSON.stringify({
  content_chunk: 'The harbor kept its silence.',
  meta: { estimated_reading_time_seconds: 120, lexical_density_score: 0.8 },
  evaluations: [
    {
      question_number: 1,
      question_text: 'What does the fog symbolize?',
      solution_vector: 'Must connect fog to withheld information and patience.'
    },
    {
      question_number: 2,
      question_text: 'How does the harbor characterize the town?',
      solution_vector: 'Must cite stillness vs. motion as deliberate contrast.'
    },
    {
      question_number: 3,
      question_text: 'Why does the narrator anthropomorphize the fog?',
      solution_vector: 'Must identify the emotional stakes of the imagery.'
    }
  ]
});

function makeEngine(outputs: string[]) {
  const calls: { prompt: string; system?: string }[] = [];
  const queue = [...outputs];
  const engine = {
    generateWithEngine: vi.fn(async (request: { prompt: string; system?: string }) => {
      calls.push(request);
      const next = queue.shift();
      if (next === undefined) throw new Error('test exhausted its scripted outputs');
      return generation(next);
    })
  };
  return { engine, calls };
}

describe('validateDistillation (schema on untrusted model output)', () => {
  it('accepts a compliant payload and caps at 3 questions', () => {
    const outcome = validateDistillation(JSON.parse(VALID_JSON));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.questions).toHaveLength(3);
  });

  it('rejects non-objects, missing fields, and empty evaluations', () => {
    expect(validateDistillation('prose').ok).toBe(false);
    expect(validateDistillation({ evaluations: [] }).ok).toBe(false);
    expect(validateDistillation({ content_chunk: 'x', evaluations: 'no' }).ok).toBe(false);
    expect(
      validateDistillation({ content_chunk: 'x', evaluations: [{ question_text: 'q' }] }).ok
    ).toBe(false);
  });

  it('falls back to array position when question_number is absent', () => {
    const outcome = validateDistillation({
      content_chunk: 'c',
      evaluations: [{ question_text: 'q1', solution_vector: 's1' }]
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.questions[0].questionIndex).toBe(1);
  });
});

describe('createDistiller (mocked engine)', () => {
  const chunk = 'The harbor kept its silence. Fog moved between the masts. '.repeat(10);

  it('distills on the first attempt with valid JSON', async () => {
    const { engine, calls } = makeEngine([VALID_JSON]);
    const outcome = await createDistiller({ engine }).distill(chunk);

    expect(outcome).toMatchObject({ ok: true, attempts: 1 });
    if (outcome.ok) expect(outcome.questions).toHaveLength(3);
    expect(calls[0].system).toContain('valid, escape-compliant JSON');
    expect(calls[0].prompt).toBe(chunk);
  });

  it('parses markdown-fenced JSON', async () => {
    const { engine } = makeEngine([`\`\`\`json\n${VALID_JSON}\n\`\`\``]);
    const outcome = await createDistiller({ engine }).distill(chunk);
    expect(outcome).toMatchObject({ ok: true, attempts: 1 });
  });

  it('retries with corrective feedback on malformed JSON, then succeeds', async () => {
    const { engine, calls } = makeEngine([
      'I could not produce JSON today, sorry!',
      VALID_JSON
    ]);

    const outcome = await createDistiller({ engine }).distill(chunk);
    expect(outcome).toMatchObject({ ok: true, attempts: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain('previous response was not valid JSON');
  });

  it('fails with the last reason after exhausting attempts', async () => {
    const { engine } = makeEngine(['nope', 'still nope', 'nope again']);
    const outcome = await createDistiller({ engine }).distill(chunk, 3);
    expect(outcome).toMatchObject({ ok: false, attempts: 3 });
  });

  it('does not retry when the engine is unreachable', async () => {
    const engine = {
      generateWithEngine: vi.fn(async () => {
        throw new OllamaError('unreachable', 'Cannot reach Ollama (ECONNREFUSED)');
      })
    };
    const outcome = await createDistiller({ engine }).distill(chunk);
    expect(outcome).toMatchObject({ ok: false, attempts: 1, reason: expect.stringContaining('unreachable') });
    expect(engine.generateWithEngine).toHaveBeenCalledOnce();
  });

  it('retries schema violations (missing content_chunk) and recovers', async () => {
    const { engine, calls } = makeEngine([
      JSON.stringify({ evaluations: [{ question_text: 'q', solution_vector: 's' }] }), // missing content_chunk
      VALID_JSON
    ]);
    const outcome = await createDistiller({ engine }).distill(chunk);
    expect(outcome).toMatchObject({ ok: true, attempts: 2 });
    expect(calls[1].prompt).toContain('previous response was not valid JSON');
  });
});
