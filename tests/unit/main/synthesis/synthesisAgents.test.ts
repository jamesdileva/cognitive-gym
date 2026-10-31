import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaError } from '@main/ollama/ollamaClient';
import { validateStory } from '@main/synthesis/storyArchitect';
import {
  createMathFactory,
  validateGeneratedTemplate
} from '@main/synthesis/mathFactory';
import { mergeMathTemplates } from '@main/math/templateLoader';
import type { MathTemplate } from '@main/math/templateSchema';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-synth-'));
  tempDirs.push(dir);
  return dir;
}

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

const VALID_STORY = JSON.stringify({
  title: '"The Clock That Owed Time"',
  story_text:
    'First paragraph about the harbor.\n\nSecond paragraph raises the dilemma.\n\nThird paragraph complicates it.\n\nFourth paragraph resolves nothing, beautifully.',
  evaluations: [
    { question_text: 'Q1', solution_vector: 'S1' },
    { question_text: 'Q2', solution_vector: 'S2' },
    { question_text: 'Q3', solution_vector: 'S3' }
  ]
});

const VALID_TEMPLATE = {
  template_id: 'gen_calc1_constant_multiple',
  topic: 'Calculus 1 — Constant Multiple',
  formula_string: 'f(x) = {c}x^{p}',
  variables: {
    c: 'random_int_range(2, 9)',
    p: 'random_int_range(2, 6)',
    cp: 'c * p',
    pm: 'p - 1'
  },
  ideal_solution_steps: ['Pull out the constant {c}.', 'Apply the power rule.'],
  answer_format: "f'(x) = {cp}x^{pm}"
};

describe('validateStory (untrusted model output)', () => {
  it('accepts a compliant payload and strips title quotes', () => {
    const outcome = validateStory(JSON.parse(VALID_STORY));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.story.title).toBe('The Clock That Owed Time');
      expect(outcome.story.questions).toHaveLength(3);
      expect(outcome.story.storyText.split('\n\n')).toHaveLength(4);
    }
  });

  it('rejects wrong paragraph counts and wrong evaluation counts', () => {
    const three = JSON.parse(VALID_STORY) as Record<string, unknown>;
    three['story_text'] = 'a\n\nb\n\nc';
    expect(validateStory(three).ok).toBe(false);

    const two = JSON.parse(VALID_STORY) as Record<string, unknown>;
    two['evaluations'] = (two['evaluations'] as unknown[]).slice(0, 2);
    expect(validateStory(two).ok).toBe(false);
  });
});

describe('createMathFactory', () => {
  it('persists a validated generated template with dry-run-resolvable variables', async () => {
    const dir = makeTempDir();
    const { engine, calls } = makeEngine([JSON.stringify(VALID_TEMPLATE)]);
    const factory = createMathFactory({ engine, outputDir: dir });

    const outcome = await factory.generate();
    expect(outcome).toMatchObject({ ok: true, attempts: 1 });
    expect(calls[0].system).toContain('clean, exact integer answers');
    expect(calls[0].system).toContain('gen_');

    // Persistence is the caller's job — generate() only validates and returns.
    factory.persist(outcome.ok ? outcome.template : VALID_TEMPLATE);
    const file = join(dir, 'gen_calc1_constant_multiple.json');
    expect(existsSync(file)).toBe(true);
    const persisted = JSON.parse(readFileSync(file, 'utf-8')) as MathTemplate;
    expect(persisted.formula_string).toBe('f(x) = {c}x^{p}');
  });

  it('retries invalid output and fails on a schema-invalid template', async () => {
    const dir = makeTempDir();
    const { engine } = makeEngine(['not json', JSON.stringify(VALID_TEMPLATE)]);
    expect(await createMathFactory({ engine, outputDir: dir }).generate()).toMatchObject({
      ok: true,
      attempts: 2
    });

    const bad = {
      ...VALID_TEMPLATE,
      variables: { a: 'random_int_range(9, 2)' } // inverted range
    };
    const { engine: badEngine } = makeEngine([JSON.stringify(bad), JSON.stringify(bad), JSON.stringify(bad)]);
    expect(await createMathFactory({ engine: badEngine, outputDir: dir }).generate()).toMatchObject({
      ok: false,
      reason: expect.stringContaining('invalid spec')
    });
  });

  it('rejects non-gen ids and dry-run failures', () => {
    expect(validateGeneratedTemplate({ ...VALID_TEMPLATE, template_id: 'calc1_something' }).ok).toBe(false);
    expect(
      validateGeneratedTemplate({ ...VALID_TEMPLATE, template_id: 'gen_broken', variables: { a: 'ghost * 2' } }).ok
    ).toBe(false);
  });

  it('short-circuits when the engine is unreachable', async () => {
    const engine = {
      generateWithEngine: vi.fn(async () => {
        throw new OllamaError('unreachable', 'ECONNREFUSED');
      })
    };
    expect(await createMathFactory({ engine, outputDir: makeTempDir() }).generate()).toMatchObject({
      ok: false,
      attempts: 1
    });
  });

  it('lists persisted ids for cross-run dedupe', () => {
    const dir = makeTempDir();
    const { engine } = makeEngine([JSON.stringify(VALID_TEMPLATE)]);
    const factory = createMathFactory({ engine, outputDir: dir });
    return factory.generate().then((outcome) => {
      factory.persist(outcome.ok ? outcome.template : VALID_TEMPLATE);
      expect(factory.existingTemplateIds().has('gen_calc1_constant_multiple')).toBe(true);
      expect(readdirSync(dir)).toContain('gen_calc1_constant_multiple.json');
    });
  });
});

describe('mergeMathTemplates (seed precedence)', () => {
  const seed: MathTemplate[] = [
    {
      template_id: 'calc1_power_rule_01',
      topic: 'Seed Power Rule',
      formula_string: 'f(x) = {a}x^{b}',
      variables: { a: 'random_int_range(2, 3)', b: 'random_int_range(3, 4)' },
      ideal_solution_steps: ['s'],
      answer_format: "f'(x) = x"
    }
  ];

  it('appends generated templates and drops id collisions with seeds', () => {
    const generated: MathTemplate[] = [
      { ...seed[0], template_id: 'calc1_power_rule_01', topic: 'Generated Impostor' },
      { ...VALID_TEMPLATE, variables: { c: 'random_int_range(2, 3)' } } as unknown as MathTemplate
    ];
    const merged = mergeMathTemplates(seed, generated);
    expect(merged).toHaveLength(2);
    expect(merged.find((t) => t.template_id === 'calc1_power_rule_01')?.topic).toBe('Seed Power Rule');
    expect(merged.find((t) => t.template_id === 'gen_calc1_constant_multiple')).toBeDefined();
  });
});
