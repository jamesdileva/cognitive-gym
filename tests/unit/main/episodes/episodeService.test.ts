import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createBookEpisodesRepo } from '@main/db/repositories/bookEpisodesRepo';
import { createContentPoolRepo } from '@main/db/repositories/contentPoolRepo';
import { createReadingStreaksRepo } from '@main/db/repositories/readingStreaksRepo';
import { createEpisodeService } from '@main/episodes/episodeService';
import type { GenerationResult } from '@shared/ai-types';
import type { IngestProgress } from '@shared/ingestion-types';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-ep-'));
  tempDirs.push(dir);
  return dir;
}

function makeBook(dir: string, name: string, paragraphCount = 24): string {
  const paragraph = (index: number): string =>
    `Paragraph ${index} tells of the harbor and its patient fog, the ships that waited at anchor, ` +
    `the lanterns that burned through weather, and the surveyors who measured a coastline that ` +
    `refused to stay exactly where the charts insisted it had always been.`;
  const path = join(dir, name);
  writeFileSync(path, Array.from({ length: paragraphCount }, (_, i) => paragraph(i)).join('\n\n'));
  return path;
}

/**
 * Two-agent script: the episodic agent (episodic-chunker system prompt) gets
 * title/recap JSON; the distiller (literary-compressor system prompt) gets
 * question JSON. Routed by sniffing the system prompt, exactly like prod.
 */
function makeTwoAgentEngine(options: { metaOk?: boolean; questionsOk?: boolean } = {}) {
  const metaOk = options.metaOk ?? true;
  const questionsOk = options.questionsOk ?? true;
  let call = 0;
  const engine = {
    generateWithEngine: vi.fn(async (request: { prompt: string; system?: string }): Promise<GenerationResult> => {
      call += 1;
      const isMetaAgent = request.system?.includes('expert literary editor') ?? false;
      const text = isMetaAgent
        ? metaOk
          ? JSON.stringify({ episode_title: `Episode ${call}`, recap: `Recap of call ${call}.` })
          : 'not json at all'
        : questionsOk
          ? JSON.stringify({
              content_chunk: request.prompt.slice(0, 40),
              evaluations: [
                { question_number: 1, question_text: 'Q1', solution_vector: 'S1' },
                { question_number: 2, question_text: 'Q2', solution_vector: 'S2' },
                { question_number: 3, question_text: 'Q3', solution_vector: 'S3' }
              ]
            })
          : 'still not json';
      return {
        text,
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      };
    })
  };
  return engine;
}

let db: GymDatabase;
let bookEpisodes: ReturnType<typeof createBookEpisodesRepo>;
let contentPool: ReturnType<typeof createContentPoolRepo>;
let streaks: ReturnType<typeof createReadingStreaksRepo>;

beforeEach(() => {
  db = openDatabase(':memory:');
  bookEpisodes = createBookEpisodesRepo(db);
  contentPool = createContentPoolRepo(db);
  streaks = createReadingStreaksRepo(db);
});

describe('episodeService — ingest pipeline (mocked two-agent engine)', () => {
  it('creates a serialized track with recaps and linked questions', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'serial.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });

    const progress: IngestProgress[] = [];
    const report = await service.run(path, { isCanonical: true, onProgress: (p) => progress.push(p) });

    expect(report.ingestedCount).toBe(report.chunkCount);
    expect(report.questionCount).toBe(report.ingestedCount * 3);
    expect(progress.some((p) => p.stage === 'episodes')).toBe(true);
    expect(progress.some((p) => p.stage === 'questions')).toBe(true);

    const tracks = service.listTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      bookTitle: 'serial',
      isCanonical: true,
      currentEpisode: 1,
      episodeCount: report.ingestedCount
    });

    // Feed starts at episode 1 with a recap; questions link via content_uuid.
    const feed = service.getDailyFeed('serial');
    expect(feed.episode).not.toBeNull();
    expect(feed.episode?.recap).toContain('Recap of call 1.');
    const questions = service.getEpisodeQuestions(feed.episode?.contentUuid ?? '');
    expect(questions).toHaveLength(3);

    // Distilled question rows live in content_pool under the namespaced source.
    expect(
      contentPool.listSourceSummaries('user_ingested').map((s) => s.sourceTitle)
    ).toEqual(['serial (episodes)']);
  });

  it('creates an anthology track with a stable shuffled feed', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'anthology.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });

    await service.run(path, { isCanonical: false });
    const feed = service.getDailyFeed('anthology');
    expect(feed.isCanonical).toBe(false);

    // Same shuffled order on repeat calls; advancing walks the same sequence.
    const first = feed.episode?.episodeNumber;
    service.finishEpisode('anthology');
    const second = service.getDailyFeed('anthology');
    expect(second.position).toBe(2);
    expect(second.episode?.episodeNumber).not.toBe(first);
    expect(service.getDailyFeed('anthology').episode?.episodeNumber).toBe(second.episode?.episodeNumber);
  });

  it('advances streaks through finishEpisode and reports completion', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'streak.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });
    await service.run(path, { isCanonical: true, maxEpisodes: 2 });

    expect(service.finishEpisode('streak').nextEpisodeNumber).toBe(2);
    expect(service.finishEpisode('streak').nextEpisodeNumber).toBeNull();
    expect(service.getDailyFeed('streak').episode).toBeNull();
    expect(service.listTracks()[0].currentEpisode).toBe(3); // 2 episodes read → position 3
  });

  it('revisits any episode read-only without touching the streak (completed-track fix)', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'revisit.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });
    await service.run(path, { isCanonical: true, maxEpisodes: 2 });
    service.finishEpisode('revisit');
    service.finishEpisode('revisit');
    expect(service.listTracks()[0].currentEpisode).toBe(3); // completed

    const daily = service.getDailyFeed('revisit');
    expect(daily.revisit).toBe(false);
    expect(daily.episode).toBeNull(); // gated shut, as before

    const revisitOne = service.getDailyFeed('revisit', 1);
    expect(revisitOne.revisit).toBe(true);
    expect(revisitOne.position).toBe(1);
    expect(revisitOne.episode?.episodeNumber).toBe(1);
    expect(revisitOne.episode?.text).toBeTruthy();

    const revisitTwo = service.getDailyFeed('revisit', 2);
    expect(revisitTwo.revisit).toBe(true);
    expect(revisitTwo.position).toBe(2);

    // Revisiting must never advance or reset the streak.
    expect(streaks.get('revisit')?.current_episode).toBe(3);
    expect(service.listTracks()[0].currentEpisode).toBe(3);
  });

  it('lists episode summaries for the revisit browser (no text)', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'summaries.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });
    await service.run(path, { isCanonical: true, maxEpisodes: 2 });

    const summaries = service.listEpisodeSummaries('summaries');
    expect(summaries).toHaveLength(2);
    expect(summaries[0].episodeNumber).toBe(1);
    expect(JSON.stringify(summaries)).not.toContain('Paragraph 0'); // content text stays out
  });

  it('honors maxEpisodes', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'limited.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });

    const report = await service.run(path, { isCanonical: true, maxEpisodes: 1 });
    expect(report.ingestedCount).toBe(1);
    expect(report.chunkCount).toBeGreaterThan(1);
  });

  it('reingesting replaces episodes and question sets without duplicates', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'replace.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });

    await service.run(path, { isCanonical: true, maxEpisodes: 2 });
    await service.run(path, { isCanonical: true, maxEpisodes: 2 });

    expect(service.listTracks()[0].episodeCount).toBe(2);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM content_pool').get() as { c: number }).c
    ).toBe(2); // one question set per episode, no leftovers
  });

  it('tolerates question-distillation failures: episode still written, no questions', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'partial.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine({ questionsOk: false }),
      bookEpisodes,
      contentPool,
      streaks
    });

    const report = await service.run(path, { isCanonical: true, maxEpisodes: 1 });
    expect(report.ingestedCount).toBe(1);
    expect(report.questionCount).toBe(0);
    expect(report.failures.some((f) => f.reason.startsWith('questions:'))).toBe(true);

    const feed = service.getDailyFeed('partial');
    expect(feed.episode?.contentUuid).toBeNull();
    expect(service.getEpisodeQuestions('none')).toEqual([]);
  });

  it('records meta-agent failures and writes nothing', async () => {
    const dir = makeTempDir();
    const path = makeBook(dir, 'allfail.txt');
    const service = createEpisodeService({
      engine: makeTwoAgentEngine({ metaOk: false }),
      bookEpisodes,
      contentPool,
      streaks
    });

    const report = await service.run(path, { isCanonical: true, maxEpisodes: 1 });
    expect(report.ingestedCount).toBe(0);
    expect(bookEpisodes.listBooks()).toEqual([]);
  });

  it('rejects missing files', async () => {
    const service = createEpisodeService({
      engine: makeTwoAgentEngine(),
      bookEpisodes,
      contentPool,
      streaks
    });
    await expect(service.run(join(tmpdir(), 'missing-123.txt'), { isCanonical: true })).rejects.toThrow(
      /Cannot read file/
    );
  });
});
