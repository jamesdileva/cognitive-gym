import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createContentPoolRepo } from '@main/db/repositories/contentPoolRepo';
import type {
  ModuleType,
  UserProgressRow
} from '@main/db/repositories/userProgressRepo';
import { createReadingService } from '@main/reading/readingService';
import type { GenerationResult } from '@shared/ai-types';

let db: GymDatabase;
let contentPool: ReturnType<typeof createContentPoolRepo>;
let progressSpy: ReturnType<typeof makeProgressSpy>;

function makeProgressSpy() {
  const attempts: { moduleType: ModuleType; contentItemId: string; successful: boolean }[] = [];
  return {
    attempts,
    recordAttempt: vi.fn(
      (input: { moduleType: ModuleType; contentItemId: string; successful: boolean }): UserProgressRow => {
        attempts.push(input);
        // Matches the repo's return shape so the fake mirrors the real surface.
        return {
          id: attempts.length,
          module_type: input.moduleType,
          content_item_id: input.contentItemId,
          difficulty_rank: 1,
          total_attempts: 1,
          successful_attempts: input.successful ? 1 : 0,
          last_attempted_timestamp: new Date().toISOString()
        };
      }
    )
  };
}

function makeEngine(score: number, feedback = 'Solid reasoning. What might you still be missing?') {
  return {
    generateWithEngine: vi.fn(
      async (): Promise<GenerationResult> => ({
        text: JSON.stringify({ score, feedback }),
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      })
    )
  };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  contentPool = createContentPoolRepo(db);
  progressSpy = makeProgressSpy();
});

describe('readingService — passages', () => {
  it('lists english/history passages with question counts and excerpts, no full bodies', async () => {
    contentPool.insertWithPrompts({
      module: 'english',
      sourceType: 'synthetic',
      sourceTitle: 'Fog Story',
      passageBody: 'A '.repeat(300) + 'story about fog.',
      prompts: [
        { questionIndex: 1, promptText: 'Q1', solutionCriteria: 'C1' },
        { questionIndex: 2, promptText: 'Q2' }
      ]
    });
    contentPool.insertWithPrompts({
      module: 'math',
      sourceType: 'synthetic',
      sourceTitle: 'Not A Passage',
      passageBody: 'f(x) = x',
      prompts: []
    });

    const service = createReadingService({
      engine: makeEngine(90),
      contentPool,
      progress: progressSpy
    });
    const passages = service.listPassages();

    expect(passages).toHaveLength(1); // math module excluded
    expect(passages[0]).toMatchObject({
      sourceTitle: 'Fog Story',
      module: 'english',
      questionCount: 2
    });
    expect(passages[0].wordCount).toBeGreaterThan(200);
    expect(passages[0].excerpt.length).toBeLessThan(160);
  });
});

describe('readingService — sessions', () => {
  it('hides solution criteria from the session payload', () => {
    const uuid = contentPool.insertWithPrompts({
      module: 'history',
      sourceType: 'synthetic',
      sourceTitle: 'Pharos',
      passageBody: 'The ledger recorded three budgets.',
      prompts: [{ questionIndex: 1, promptText: 'What did the largest budget buy?', solutionCriteria: 'mirrors/optics' }]
    });
    const service = createReadingService({
      engine: makeEngine(90),
      contentPool,
      progress: progressSpy
    });

    const session = service.startSession(uuid);
    expect(session.questions).toEqual([{ questionIndex: 1, promptText: 'What did the largest budget buy?' }]);
    expect(JSON.stringify(session)).not.toContain('mirrors/optics');
    expect(session.module).toBe('history');
  });

  it('throws on unknown passages and questions', async () => {
    const uuid = contentPool.insertWithPrompts({
      module: 'english',
      sourceType: 'synthetic',
      sourceTitle: 'S',
      passageBody: 'b',
      prompts: [{ questionIndex: 1, promptText: 'q', solutionCriteria: 'c' }]
    });
    const service = createReadingService({
      engine: makeEngine(90),
      contentPool,
      progress: progressSpy
    });

    expect(() => service.startSession('nope')).toThrow(/Unknown reading passage/);
    await expect(
      service.submitAnswer({ uuid, questionIndex: 9, answer: 'a' })
    ).rejects.toThrow(/Question 9 not found/);
  });
});

describe('readingService — grading + progress', () => {
  let uuid: string;
  let service: ReturnType<typeof createReadingService>;
  let engine: ReturnType<typeof makeEngine>;

  beforeEach(() => {
    uuid = contentPool.insertWithPrompts({
      module: 'history',
      sourceType: 'user_ingested',
      sourceTitle: 'Pharos',
      passageBody: 'The ledger recorded three budgets for the lighthouse.',
      prompts: [
        { questionIndex: 1, promptText: 'Q1', solutionCriteria: 'criteria one' },
        { questionIndex: 2, promptText: 'Q2' } // no criteria on purpose
      ]
    });
    engine = makeEngine(85);
    service = createReadingService({ engine, contentPool, progress: progressSpy });
  });

  it('grades an answer, records a successful attempt in the passage module', async () => {
    const outcome = await service.submitAnswer({ uuid, questionIndex: 1, answer: 'my reading' });

    expect(outcome).toEqual({ ok: true, score: 85, feedback: expect.any(String) });
    expect(engine.generateWithEngine).toHaveBeenCalledOnce();
    expect(progressSpy.attempts).toEqual([
      { moduleType: 'history', contentItemId: uuid, successful: true }
    ]);
  });

  it('records unsuccessful attempts below the pass threshold', async () => {
    const failing = createReadingService({
      engine: makeEngine(35),
      contentPool,
      progress: progressSpy
    });
    await failing.submitAnswer({ uuid, questionIndex: 1, answer: 'weak' });
    expect(progressSpy.attempts[0].successful).toBe(false);
  });

  it('keeps the solution vector out of renderer-visible feedback', async () => {
    const outcome = await service.submitAnswer({ uuid, questionIndex: 1, answer: 'my reading' });
    expect(outcome.ok && outcome.feedback).not.toContain('criteria one');
  });

  it('returns a typed failure without a model call when criteria are missing', async () => {
    const outcome = await service.submitAnswer({ uuid, questionIndex: 2, answer: 'my reading' });
    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'missing_criteria', message: 'This question has no stored grading criteria.' }
    });
    expect(engine.generateWithEngine).not.toHaveBeenCalled();
    expect(progressSpy.attempts).toEqual([]);
  });
});
