import { describe, expect, it, vi } from 'vitest';
import { OllamaError } from '@main/ollama/ollamaClient';
import { createMathService, normalizeMathAnswer } from '@main/math/mathService';
import type { MathTemplate } from '@main/math/templateSchema';
import type { GenerationResult } from '@shared/ai-types';

const POWER_RULE: MathTemplate = {
  template_id: 'calc1_test_01',
  topic: 'Calculus 1 — Power Rule',
  formula_string: 'Differentiate: f(x) = {coeff}x^{power}',
  variables: {
    coeff: 'random_int_range(2, 12)',
    power: 'random_int_range(3, 8)',
    new_coeff: 'coeff * power',
    new_power: 'power - 1'
  },
  ideal_solution_steps: [
    'Bring the exponent {power} down onto coefficient {coeff}.',
    'New coefficient: {coeff} × {power} = {new_coeff}.'
  ],
  answer_format: "f'(x) = {new_coeff}x^{new_power}"
};

const LINEAR: MathTemplate = {
  template_id: 'algebra_test_01',
  topic: 'Algebra — Linear Equations',
  formula_string: 'Solve for x: {a}x + {b} = {c}',
  variables: {
    a: 'random_int_range(2, 6)',
    b: 'random_int_range(1, 9)',
    x: 'random_int_range(2, 12)',
    c: 'a * x + b'
  },
  ideal_solution_steps: ['Subtract {b} from both sides.'],
  answer_format: 'x = {x}'
};

function makeService(overrides: { recorded?: { id: string; successful: boolean }[]; engine?: unknown } = {}) {
  const progressState = new Map<string, { total: number; successful: number }>();
  const progress = {
    recordAttempt: vi.fn((input: { contentItemId: string; successful: boolean }) => {
      overrides.recorded?.push({ id: input.contentItemId, successful: input.successful });
      const entry = progressState.get(input.contentItemId) ?? { total: 0, successful: 0 };
      entry.total += 1;
      if (input.successful) entry.successful += 1;
      progressState.set(input.contentItemId, entry);
    }),
    // Matches the repo surface: (moduleType, contentItemId).
    getByItem: vi.fn((_moduleType: string, contentItemId: string) => {
      const entry = progressState.get(contentItemId);
      return entry
        ? {
            total_attempts: entry.total,
            successful_attempts: entry.successful
          }
        : undefined;
    })
  };
  // Matches the engine surface the service consumes: generateWithEngine.
  const engine =
    overrides.engine ??
    ({
      generateWithEngine: async (): Promise<GenerationResult> => ({
        text: 'What does the exponent rule say about multiplying the coefficient?',
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSecond: 1 }
      })
    } as unknown);

  const service = createMathService({
    templates: [POWER_RULE, LINEAR],
    // Narrowed to the shape the service actually uses.
    progress: progress as never,
    engine: engine as never
  });
  return { service, progress, engine };
}

describe('mathService — procedural generation', () => {
  it('is deterministic: same template + seed renders the identical problem', () => {
    const { service } = makeService();
    const first = service.render('calc1_test_01', 12345);
    const second = service.render('calc1_test_01', 12345);
    expect(first).toEqual(second);
    expect(first.answer).toMatch(/^f'\(x\) = \d+x\^(\d|[1-9]\d*)$/);
  });

  it('renders different instances across seeds', () => {
    const { service } = makeService();
    const displays = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      displays.add(service.render('calc1_test_01', seed).problem.display);
    }
    expect(displays.size).toBeGreaterThan(10);
  });

  it('newProblem returns a reference that carries no answer, steps, or variables', () => {
    const { service } = makeService();
    const problem = service.newProblem('calc1_test_01');
    expect(Object.keys(problem).sort()).toEqual(['display', 'seed', 'templateId', 'topic']);
    const serialized = JSON.stringify(problem);
    expect(serialized).not.toContain("f'");
  });

  it('rejects unknown template ids', () => {
    const { service } = makeService();
    expect(() => service.newProblem('nope')).toThrow(/Unknown math template/);
  });
});

describe('mathService — check/reveal', () => {
  it('accepts equivalent answer formats (label, spacing, case)', () => {
    const { service } = makeService();
    const rendered = service.render('algebra_test_01', 77);
    const x = rendered.answer.replace(/^x = /, '');

    for (const variant of [rendered.answer, `x=${x}`, `X = ${x}`, x, `  ${x}  `]) {
      expect(service.checkAnswer(rendered.problem, variant).correct).toBe(true);
    }
  });

  it('rejects wrong answers and records every attempt in progress', () => {
    const recorded: { id: string; successful: boolean }[] = [];
    const { service } = makeService({ recorded });
    const rendered = service.render('algebra_test_01', 77);

    const wrong = service.checkAnswer(rendered.problem, 'x = 999');
    expect(wrong.correct).toBe(false);
    expect(wrong.note).not.toContain('999');
    expect(recorded).toEqual([{ id: 'algebra_test_01', successful: false }]);

    const right = service.checkAnswer(rendered.problem, rendered.answer);
    expect(right.correct).toBe(true);
    expect(recorded[1]).toEqual({ id: 'algebra_test_01', successful: true });
  });

  it('reveal returns steps and answer, only on request', () => {
    const { service } = makeService();
    const rendered = service.render('calc1_test_01', 5);
    const revealed = service.reveal(rendered.problem);
    expect(revealed.steps).toEqual(rendered.solutionSteps);
    expect(revealed.answer).toBe(rendered.answer);
  });

  it('listTopics joins templates with progress counters', () => {
    const { service } = makeService();
    const rendered = service.render('algebra_test_01', 3);
    service.checkAnswer(rendered.problem, rendered.answer);

    const topics = service.listTopics();
    const linear = topics.find((t) => t.templateId === 'algebra_test_01');
    expect(linear).toMatchObject({ totalAttempts: 1, successfulAttempts: 1 });
    expect(topics.find((t) => t.templateId === 'calc1_test_01')).toMatchObject({
      totalAttempts: 0,
      successfulAttempts: 0
    });
  });
});

describe('mathService — Socratic hint flow (mocked engine)', () => {
  it('renders the registry socratic-math prompt with the live problem', async () => {
    const captured: { prompt: string; system?: string }[] = [];
    const { service } = makeService({
      engine: {
        generateWithEngine: async (request: { prompt: string; system?: string }) => {
          captured.push(request);
          return {
            text: 'What happens to the exponent when you bring it down?',
            model: 'test-model',
            metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
          };
        }
      }
    });

    const rendered = service.render('calc1_test_01', 11);
    const outcome = await service.hint(rendered.problem, 'Why does the exponent drop by one?');

    expect(outcome).toEqual({ ok: true, hint: 'What happens to the exponent when you bring it down?' });
    expect(captured).toHaveLength(1);
    expect(captured[0].prompt).toBe('Why does the exponent drop by one?');
    expect(captured[0].system).toContain('NEVER reveal the final mathematical answer');
    expect(captured[0].system).toContain(rendered.problem.display);
    expect(captured[0].system).toContain(rendered.solutionSteps[0]);
    // The steps feed the tutor, but the final answer string is not handed over verbatim.
    expect(captured[0].system).not.toContain(`Answer: ${rendered.answer}`);
  });

  it('returns a typed failure envelope when the engine is unreachable', async () => {
    const { service } = makeService({
      engine: {
        generateWithEngine: async () => {
          throw new OllamaError('unreachable', 'Cannot reach Ollama at localhost:11434 (ECONNREFUSED)');
        }
      }
    });
    const rendered = service.render('calc1_test_01', 11);
    const outcome = await service.hint(rendered.problem, 'hint please');
    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'unreachable', message: expect.stringContaining('ECONNREFUSED') }
    });
  });
});

describe('normalizeMathAnswer', () => {
  it('normalizes case, whitespace, glyph variants, and label prefixes', () => {
    expect(normalizeMathAnswer("F'(X) = 60X^4")).toBe(normalizeMathAnswer("f'(x) = 60x^4"));
    expect(normalizeMathAnswer('x = 6')).toBe(normalizeMathAnswer('6'));
    expect(normalizeMathAnswer('x\u00A0=\u22124')).toBe(normalizeMathAnswer('-4'));
    expect(normalizeMathAnswer('x^{9}')).toBe(normalizeMathAnswer('x^9'));
    expect(normalizeMathAnswer('6x')).not.toBe(normalizeMathAnswer('7x'));
  });
});
