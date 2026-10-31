import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createContentPoolRepo } from '@main/db/repositories/contentPoolRepo';
import { createSynthesisService } from '@main/synthesis/synthesisService';
import type { GenerationResult } from '@shared/ai-types';
import type { IngestProgress } from '@shared/ingestion-types';

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

const STORY_TEXT = JSON.stringify({
  title: '"The Tidal Oracle"',
  story_text:
    'Para one: the harbor waits.\n\nPara two: the keeper decodes tomorrow.\n\nPara three: the dilemma sharpens.\n\nPara four: the tide decides.',
  evaluations: [
    { question_text: 'Q1', solution_vector: 'S1' },
    { question_text: 'Q2', solution_vector: 'S2' },
    { question_text: 'Q3', solution_vector: 'S3' }
  ]
});

function makeStoryEngine(outputs: string[]) {
  const queue = [...outputs];
  return {
    generateWithEngine: vi.fn(async (): Promise<GenerationResult> => {
      const next = queue.shift();
      if (next === undefined) throw new Error('script exhausted');
      return {
        text: next,
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      };
    })
  };
}

const TEMPLATE_TEXT = JSON.stringify({
  template_id: 'gen_algebra_percentage',
  topic: 'Algebra — Percentages',
  formula_string: 'What is {p}% of {n}?',
  variables: {
    p: 'random_int_range(2, 5)',
    n: 'random_int_range(2, 9)',
    result: 'p * n'
  },
  ideal_solution_steps: ['Convert {p}% to a fraction.', 'Multiply by {n}.'],
  answer_format: '{result}'
});

function makeTemplateEngine() {
  // Unique ids per call so within-batch generations don't collide; the SAME
  // sequence repeats per engine instance, which is what cross-run dedupe tests.
  let call = 0;
  return {
    generateWithEngine: vi.fn(async (): Promise<GenerationResult> => {
      call += 1;
      return {
        text: TEMPLATE_TEXT.replace('gen_algebra_percentage', `gen_algebra_percentage_${call}`),
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      };
    })
  };
}

let db: GymDatabase;
let contentPool: ReturnType<typeof createContentPoolRepo>;

beforeEach(() => {
  db = openDatabase(':memory:');
  contentPool = createContentPoolRepo(db);
});

describe('synthesisService — story batch', () => {
  it('generates N stories into content_pool as synthetic with questions', async () => {
    const service = createSynthesisService({
      engine: makeStoryEngine([STORY_TEXT, STORY_TEXT, STORY_TEXT]),
      contentPool,
      mathTemplatesDir: '/unused'
    });

    const progress: IngestProgress[] = [];
    const report = await service.generateStories(3, (p) => progress.push(p));

    expect(report).toEqual({
      requested: 3,
      generated: 3,
      questionCount: 9,
      failures: []
    });
    expect(progress.filter((p) => p.stage === 'stories')).toHaveLength(3);

    const summaries = contentPool.listSummaries();
    expect(summaries).toHaveLength(3);
    expect(new Set(summaries.map((s) => s.uuid)).size).toBe(3); // unique uuid per story
    for (const summary of summaries) {
      expect(summary.source_type).toBe('synthetic');
      expect(summary.module).toBe('english');
    }

    const first = contentPool.getByUuid(summaries[0].uuid);
    expect(first?.content.passage_body.split('\n\n')).toHaveLength(4);
    expect(first?.prompts).toHaveLength(3);
    expect(first?.content.sub_topic).toBe('Synthetic Fiction');
  });

  it('records a failed synthesis without stopping the batch', async () => {
    const service = createSynthesisService({
      engine: makeStoryEngine([STORY_TEXT, 'prose, not JSON']),
      contentPool,
      mathTemplatesDir: '/unused'
    });

    const report = await service.generateStories(2);
    expect(report.generated).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(contentPool.listSummaries()).toHaveLength(1);
  });
});

describe('synthesisService — math template batch', () => {
  it('persists templates and dedupes across runs', async () => {
    const dir = makeTempDir();
    const service = createSynthesisService({
      engine: makeTemplateEngine(),
      contentPool,
      mathTemplatesDir: dir
    });

    const first = await service.generateMathTemplates(2);
    expect(first.generated).toBe(2);
    expect(first.failures).toHaveLength(0);
    expect(readdirSync(dir)).toHaveLength(2);

    // A second run = a fresh engine instance replaying the same id sequence.
    const second = await createSynthesisService({
      engine: makeTemplateEngine(),
      contentPool,
      mathTemplatesDir: dir
    }).generateMathTemplates(1);
    expect(second.generated).toBe(0); // the replayed id is already persisted → duplicate
    expect(second.failures[0].reason).toContain(
      "duplicate template_id 'gen_algebra_percentage_1'"
    );
    expect(readdirSync(dir)).toHaveLength(2); // nothing new written
  });

  it('surfaces math-template progress stages to the renderer', async () => {
    const service = createSynthesisService({
      engine: makeTemplateEngine(),
      contentPool,
      mathTemplatesDir: makeTempDir()
    });

    const progress: IngestProgress[] = [];
    await service.generateMathTemplates(1, (p) => progress.push(p));
    expect(progress[0].stage).toBe('math-templates');
    expect(progress[0]).toEqual({ stage: 'math-templates', current: 1, total: 1 });
  });

  it('reports dry-run failures as failures, writing nothing', async () => {
    const broken = {
      ...JSON.parse(TEMPLATE_TEXT),
      // Spec parses (placeholder check passes) but the expression references
      // an unknown variable — caught by the factory's dry-run instantiation.
      variables: { p: 'random_int_range(2, 5)', n: 'random_int_range(2, 9)', result: 'ghost * 2' },
      template_id: 'gen_dry_run_failure'
    };
    const service = createSynthesisService({
      engine: makeStoryEngine([JSON.stringify(broken), JSON.stringify(broken), JSON.stringify(broken)]),
      contentPool,
      mathTemplatesDir: makeTempDir()
    });

    const report = await service.generateMathTemplates(1);
    expect(report.generated).toBe(0);
    expect(report.failures[0].reason).toContain('variables do not resolve');
  });
});
