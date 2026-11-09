import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { createDailyService } from '@main/daily/dailyService';
import { loadTeasers } from '@main/daily/teaserLoader';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { GenerationResult } from '@shared/ai-types';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const TEASER_DIR = join(REPO_ROOT, 'content-library', 'teasers');

const FIXED_NOW = new Date('2026-11-04T12:00:00.000Z');

function makeEngine(score: number) {
  return {
    generateWithEngine: vi.fn(
      async (): Promise<GenerationResult> => ({
        text: JSON.stringify({ score, feedback: 'Reasoning acknowledged. What is the flip side?' }),
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      })
    )
  };
}

let db: GymDatabase;
let cards: ReturnType<typeof createFlashcardsRepo>;

beforeEach(() => {
  db = openDatabase(':memory:');
  cards = createFlashcardsRepo(db);
});

function makeService(score = 80) {
  return createDailyService({
    db,
    cards,
    engine: makeEngine(score),
    teasers: loadTeasers(TEASER_DIR)
  });
}

// Frozen-clock helper: activity rows must be inserted directly with dates
// derived from FIXED_NOW (repos stamp the real clock — never mix the two;
// CI caught exactly that in Sprint 10).
const stamp = FIXED_NOW.toISOString();

describe('dailyService.today', () => {
  it('starts with all components undone on a fresh database', () => {
    const overview = makeService().today(FIXED_NOW);
    expect(overview.date).toBe('2026-11-04');
    expect(overview.complete).toBe(false);
    expect(overview.components.every((c) => !c.done)).toBe(true);
    expect(overview.teaser.done).toBe(false);
    expect(overview.teaser.kind).toMatch(/riddle|lateral|philosophical/);
  });

  it('picks the teaser deterministically per date', () => {
    const a = makeService().today(new Date('2026-11-04T12:00:00.000Z'));
    const aAgain = makeService().today(new Date('2026-11-04T18:00:00.000Z'));
    expect(a.teaser.id).toBe(aAgain.teaser.id); // same UTC date → same teaser

    const b = makeService().today(new Date('2026-11-05T12:00:00.000Z'));
    expect([a.teaser.id, b.teaser.id].length).toBe(2);
  });

  it('marks the math-game component done after a speed run today', () => {
    db.prepare('INSERT INTO speed_runs (score, min_budget_s, created_at) VALUES (?, ?, ?)').run(
      6,
      7,
      stamp
    );

    const overview = makeService().today(FIXED_NOW);
    expect(overview.components.find((c) => c.id === 'math-game')?.done).toBe(true);
    expect(overview.components.find((c) => c.id === 'reading')?.done).toBe(false);
  });

  it('marks reading done after a graded english answer, but a teaser attempt alone does not count', () => {
    // A teaser grade alone must NOT satisfy the reading component.
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('teaser', 'teaser_riddle_01', 1, ?)"
    ).run(stamp);
    expect(makeService().today(FIXED_NOW).components.find((c) => c.id === 'reading')?.done).toBe(
      false
    );

    // A real reading-room grade (attempt logged as english with a real item id).
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('english', 'passage-1', 1, ?)"
    ).run(stamp);
    expect(makeService().today(FIXED_NOW).components.find((c) => c.id === 'reading')?.done).toBe(
      true
    );
  });

  it('marks flashcards done after a review today', () => {
    const card = cards.create({ deckName: 'd', frontPrompt: 'f', backAnswer: 'b' });
    cards.updateReviewState(card.id, 2, new Date(FIXED_NOW.getTime() + 3_600_000).toISOString(), true);
    // updateReviewState stamps last_reviewed_at with the real clock; align it
    // with the frozen date for the assertion.
    db.prepare('UPDATE flashcards SET last_reviewed_at = ? WHERE id = ?').run(stamp, card.id);
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('srs', 'card:d', 1, ?)"
    ).run(stamp);

    const overview = makeService().today(FIXED_NOW);
    expect(overview.components.find((c) => c.id === 'flashcards')?.done).toBe(true);
  });

  it('reports complete only when every component is done', () => {
    const teaserId = makeService().today(FIXED_NOW).teaser.id;

    db.prepare('INSERT INTO speed_runs (score, min_budget_s, created_at) VALUES (?, ?, ?)').run(
      3,
      8,
      stamp
    );
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('english', 'passage-1', 1, ?)"
    ).run(stamp);
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('srs', 'card:d', 1, ?)"
    ).run(stamp);
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('teaser', ?, 1, ?)"
    ).run(teaserId, stamp);

    const overview = makeService().today(FIXED_NOW);
    expect(overview.complete).toBe(true);
    expect(overview.components.every((c) => c.done)).toBe(true);
  });
});

describe('dailyService.gradeTeaser', () => {
  it('grades the answer, logs teaser activity, and flips the component done', async () => {
    const service = makeService(85);

    // Real clock end-to-end (grade + today check must share one timeline).
    const outcome = await service.gradeTeaser('It is an echo — sound reflected back.');
    expect(outcome.score).toBe(85);
    expect(outcome.overview.components.find((c) => c.id === 'teaser')?.done).toBe(true);

    const logged = db
      .prepare("SELECT COUNT(*) AS c FROM attempt_log WHERE module_type = 'teaser'")
      .get() as { c: number };
    expect(logged.c).toBe(1);
  });

  it('surfaces engine failures as thrown errors with the reason', async () => {
    const engine = {
      generateWithEngine: vi.fn(async () => {
        throw Object.assign(new Error('Ollama down'), { kind: 'unreachable' });
      })
    };
    const service = createDailyService({ db, cards, engine, teasers: loadTeasers(TEASER_DIR) });

    await expect(service.gradeTeaser('answer', FIXED_NOW)).rejects.toThrow(/Ollama down/);
  });
});
