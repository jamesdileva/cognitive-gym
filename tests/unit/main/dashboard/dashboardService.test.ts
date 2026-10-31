import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createDashboardService } from '@main/dashboard/dashboardService';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { createUserProgressRepo } from '@main/db/repositories/userProgressRepo';
import { createReadingStreaksRepo } from '@main/db/repositories/readingStreaksRepo';

let db: GymDatabase;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('dashboardService.overview', () => {
  it('returns a zeroed 30-day series and empty modules for a fresh database', () => {
    const service = createDashboardService({ db, cards: createFlashcardsRepo(db) });
    const overview = service.overview(new Date('2026-10-31T12:00:00.000Z'));

    expect(overview.dailyStreak).toBe(0);
    expect(overview.dueCards).toBe(0);
    expect(overview.modules).toEqual([]);
    expect(overview.activity).toHaveLength(30);
    expect(overview.activity.every((day) => day.attempts === 0)).toBe(true);
  });

  it('aggregates module mastery from user_progress', () => {
    const progress = createUserProgressRepo(db);
    progress.recordAttempt({ moduleType: 'math', contentItemId: 'a', successful: true });
    progress.recordAttempt({ moduleType: 'math', contentItemId: 'a', successful: false });
    progress.recordAttempt({ moduleType: 'math', contentItemId: 'b', successful: true });
    progress.recordAttempt({ moduleType: 'english', contentItemId: 'c', successful: false });

    const service = createDashboardService({ db, cards: createFlashcardsRepo(db) });
    const overview = service.overview();

    expect(overview.modules).toEqual([
      { module: 'english', items: 1, attempts: 1, successful: 0 },
      { module: 'math', items: 2, attempts: 3, successful: 2 }
    ]);
    expect(overview.activity[29].attempts).toBe(4); // today
    expect(overview.activity[29].successful).toBe(2);
  });

  it('builds the streak from attempts, flashcard reviews, and episode reads', () => {
    const today = new Date('2026-10-31T12:00:00.000Z');
    const iso = (offsetDays: number): string =>
      new Date(today.getTime() - offsetDays * 86_400_000).toISOString();

    // Attempt today (through the real repo → also exercises the log wiring).
    createUserProgressRepo(db).recordAttempt({
      moduleType: 'math',
      contentItemId: 'a',
      successful: true
    });

    // Flashcard review yesterday + episode read two days ago: written with
    // deterministic timestamps (the repos stamp real "now" internally).
    const cards = createFlashcardsRepo(db);
    const card = cards.create({ deckName: 'd', frontPrompt: 'f', backAnswer: 'b' });
    cards.updateReviewState(card.id, 2, iso(-1), true);
    db.prepare('UPDATE flashcards SET last_reviewed_at = ? WHERE id = ?').run(iso(1), card.id);
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('srs', 'card:d', 0, ?)"
    ).run(iso(1));

    // Episode read two days ago: direct deterministic row (the repo stamps
    // last_read_date with real "now", which would collapse the chain).
    db.prepare(
      "INSERT INTO attempt_log (module_type, content_item_id, successful, created_at) VALUES ('episodes', 'Demo', 1, ?)"
    ).run(iso(2));
    db.prepare(
      "INSERT INTO user_reading_streaks (book_title, current_episode, last_read_date) VALUES ('Demo', 2, ?)"
    ).run(iso(2));

    const service = createDashboardService({ db, cards });
    const overview = service.overview(today);
    expect(overview.dailyStreak).toBe(3);
  });

  it('counts due cards across decks', () => {
    const cards = createFlashcardsRepo(db);
    cards.create({ deckName: 'A', frontPrompt: '1', backAnswer: 'x' });
    cards.create({ deckName: 'A', frontPrompt: '2', backAnswer: 'y' });
    cards.create({
      deckName: 'B',
      frontPrompt: '3',
      backAnswer: 'z',
      nextReviewDue: '2999-01-01T00:00:00.000Z'
    });

    const service = createDashboardService({ db, cards });
    expect(service.overview().dueCards).toBe(2);
  });

  it('stamps flashcard reviews (last_reviewed_at) and logs SRS activity', () => {
    const cards = createFlashcardsRepo(db);
    const card = cards.create({ deckName: 'd', frontPrompt: 'f', backAnswer: 'b' });
    cards.updateReviewState(card.id, 2, '2026-11-02T00:00:00.000Z', true);

    const row = cards.getById(card.id);
    expect(row?.last_reviewed_at).not.toBeNull();

    const logged = db
      .prepare("SELECT COUNT(*) AS c FROM attempt_log WHERE module_type = 'srs' AND successful = 1")
      .get() as { c: number };
    expect(logged.c).toBe(1);
  });

  it('logs episode reads as activity', () => {
    const episodes = createReadingStreaksRepo(db);
    episodes.ensure('Demo');
    episodes.advance('Demo');

    const logged = db
      .prepare("SELECT COUNT(*) AS c FROM attempt_log WHERE module_type = 'episodes'")
      .get() as { c: number };
    expect(logged.c).toBe(1);
  });
});
