import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createContentPoolRepo } from '@main/db/repositories/contentPoolRepo';
import { createIngestionService, INGESTED_SOURCE_TYPE } from '@main/ingestion/ingestionService';
import type { GenerationResult } from '@shared/ai-types';
import type { IngestProgress } from '@shared/ingestion-types';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-svc-'));
  tempDirs.push(dir);
  return dir;
}

/** Builds a synthetic book file whose paragraphs each carry ~41 words (~24 = 2 chunks). */
function makeBook(dir: string, name: string, paragraphCount = 24): string {
  const paragraph = (index: number): string =>
    `Paragraph ${index} tells of the harbor and its patient fog, the ships that waited at anchor, ` +
    `the lanterns that burned through weather, and the surveyors who measured a coastline that ` +
    `refused to stay exactly where the charts insisted it had always been.`;
  const path = join(dir, name);
  writeFileSync(path, Array.from({ length: paragraphCount }, (_, i) => paragraph(i)).join('\n\n'));
  return path;
}

const validDistillation = (chunk: string): string =>
  JSON.stringify({
    content_chunk: chunk.slice(0, 80),
    evaluations: [
      { question_number: 1, question_text: `Q1 about ${chunk.slice(0, 12)}`, solution_vector: 'criteria one' },
      { question_number: 2, question_text: 'Q2', solution_vector: 'criteria two' },
      { question_number: 3, question_text: 'Q3', solution_vector: 'criteria three' }
    ]
  });

function makeEngine(script: (chunk: string, call: number) => string) {
  let call = 0;
  const engine = {
    generateWithEngine: vi.fn(async (request: { prompt: string }): Promise<GenerationResult> => {
      call += 1;
      return {
        text: script(request.prompt, call),
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      };
    })
  };
  return engine;
}

let db: GymDatabase;
let contentPool: ReturnType<typeof createContentPoolRepo>;

beforeEach(() => {
  db = openDatabase(':memory:');
  contentPool = createContentPoolRepo(db);
});

describe('ingestionService — happy path', () => {
  it('extracts, chunks, distills, and writes content + prompts', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'harbor.txt');
    const engine = makeEngine((chunk) => validDistillation(chunk));
    const service = createIngestionService({ engine, contentPool });

    const progress: IngestProgress[] = [];
    const report = await service.run(path, { onProgress: (p) => progress.push(p) });

    expect(report.title).toBe('harbor');
    expect(report.kind).toBe('txt');
    expect(report.chunkCount).toBeGreaterThan(1);
    expect(report.ingestedCount).toBe(report.chunkCount);
    expect(report.questionCount).toBe(report.ingestedCount * 3);
    expect(report.failures).toEqual([]);

    // Progress covered extraction + every distillation step.
    expect(progress[0]).toEqual({ stage: 'extracting', current: 0, total: 0 });
    expect(progress.filter((p) => p.stage === 'distilling')).toHaveLength(report.chunkCount);

    const sources = service.listLibrary();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      sourceTitle: 'harbor',
      chunkCount: report.ingestedCount,
      questionCount: report.questionCount
    });

    // Stored prompts are linked and the passage is OUR chunk, not model text.
    const first = contentPool.listSummaries()[0];
    const stored = contentPool.getByUuid(first.uuid);
    expect(stored?.content.source_type).toBe(INGESTED_SOURCE_TYPE);
    expect(stored?.content.module).toBe('english');
    expect(stored?.content.passage_body).not.toContain('content_chunk');
    expect(stored?.prompts).toHaveLength(3);
  });

  it('honors maxChunks for partial runs', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'partial.txt');
    const engine = makeEngine((chunk) => validDistillation(chunk));
    const service = createIngestionService({ engine, contentPool });

    const report = await service.run(path, { maxChunks: 1 });
    expect(report.ingestedCount).toBe(1);
    expect(report.chunkCount).toBeGreaterThan(1);
    expect(service.listLibrary()[0].chunkCount).toBe(1);
  });
});

describe('ingestionService — reingest replaces the source', () => {
  it('does not duplicate chunks or questions on a second run', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'again.txt');
    const service = createIngestionService({
      engine: makeEngine((chunk) => validDistillation(chunk)),
      contentPool
    });

    const first = await service.run(path);
    const second = await service.run(path);
    expect(second.ingestedCount).toBe(first.ingestedCount);

    const sources = service.listLibrary();
    expect(sources).toHaveLength(1);
    expect(sources[0].chunkCount).toBe(first.ingestedCount);
    expect(sources[0].questionCount).toBe(first.questionCount);
  });
});

describe('ingestionService — failures', () => {
  it('records per-chunk failures and leaves the previous source intact', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'failing.txt', 24);
    const service = createIngestionService({
      engine: makeEngine(() => 'The model rambled in prose instead of JSON.'),
      contentPool
    });

    // Pre-existing data for the same title must survive a fully failed run.
    const preExisting = contentPool.insertWithPrompts({
      module: 'english',
      sourceType: INGESTED_SOURCE_TYPE,
      sourceTitle: 'failing',
      passageBody: 'previous good chunk',
      prompts: []
    });

    const report = await service.run(path, { maxChunks: 2 });
    expect(report.ingestedCount).toBe(0);
    expect(report.failures).toHaveLength(2);
    expect(service.listLibrary()).toHaveLength(1);
    expect(contentPool.getByUuid(preExisting)?.content.passage_body).toBe('previous good chunk');
  });

  it('rejects unsupported formats and missing files before any model call', async () => {
    const service = createIngestionService({
      engine: makeEngine(() => validDistillation('x')),
      contentPool
    });

    const dir = makeTempDir();
    writeFileSync(join(dir, 'photo.jpg'), 'not a book');
    await expect(service.run(join(dir, 'photo.jpg'))).rejects.toThrow(/Unsupported book format/);
    await expect(service.run(join(dir, 'missing.txt'))).rejects.toThrow(/Cannot read file/);
  });
});

describe('ingestionService — library management', () => {
  it('deletes a source and cascades its prompts', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'removable.txt');
    const service = createIngestionService({
      engine: makeEngine((chunk) => validDistillation(chunk)),
      contentPool
    });

    await service.run(path, { maxChunks: 1 });
    expect(service.listLibrary()).toHaveLength(1);

    expect(service.deleteSource('removable')).toBe(true);
    expect(service.listLibrary()).toHaveLength(0);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM interactive_prompts').get() as { c: number }).c
    ).toBe(0);
  });
});
