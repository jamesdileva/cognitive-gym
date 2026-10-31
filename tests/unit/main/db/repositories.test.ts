import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createBookEpisodesRepo } from '@main/db/repositories/bookEpisodesRepo';
import { createContentPoolRepo, type ContentModule } from '@main/db/repositories/contentPoolRepo';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { createReadingStreaksRepo } from '@main/db/repositories/readingStreaksRepo';
import {
  createUserProgressRepo,
  type ModuleType
} from '@main/db/repositories/userProgressRepo';

let db: GymDatabase;
beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('userProgressRepo', () => {
  it('upserts counters across repeated attempts on the same item', () => {
    const repo = createUserProgressRepo(db);
    const first = repo.recordAttempt({
      moduleType: 'math',
      contentItemId: 'calc1_power_rule_01',
      successful: true,
      difficultyRank: 2
    });
    expect(first.total_attempts).toBe(1);
    expect(first.successful_attempts).toBe(1);
    expect(first.difficulty_rank).toBe(2);

    repo.recordAttempt({ moduleType: 'math', contentItemId: 'calc1_power_rule_01', successful: false });

    const row = repo.getByItem('math', 'calc1_power_rule_01');
    expect(row?.total_attempts).toBe(2);
    expect(row?.successful_attempts).toBe(1);
  });

  it('lists progress scoped to a single module', () => {
    const repo = createUserProgressRepo(db);
    repo.recordAttempt({ moduleType: 'math', contentItemId: 'a', successful: true });
    repo.recordAttempt({ moduleType: 'english', contentItemId: 'b', successful: false });
    const mathRows = repo.listByModule('math');
    expect(mathRows).toHaveLength(1);
    expect(mathRows[0].content_item_id).toBe('a');
  });

  it('rejects module types outside the contract enum', () => {
    const repo = createUserProgressRepo(db);
    expect(() =>
      repo.recordAttempt({
        moduleType: 'gossip' as ModuleType,
        contentItemId: 'x',
        successful: true
      })
    ).toThrow(/CHECK/);
  });
});

describe('flashcardsRepo', () => {
  it('creates a card due immediately by default', () => {
    const repo = createFlashcardsRepo(db);
    const card = repo.create({ deckName: 'Military Alphabet', frontPrompt: 'A', backAnswer: 'Alpha' });
    expect(card.leitner_box_position).toBe(1);
    expect(repo.listDue().map((c) => c.id)).toContain(card.id);
  });

  it('filters by deck and by due date', () => {
    const repo = createFlashcardsRepo(db);
    repo.create({ deckName: 'A', frontPrompt: 'past', backAnswer: 'x', nextReviewDue: '2020-01-01T00:00:00.000Z' });
    repo.create({ deckName: 'B', frontPrompt: 'future', backAnswer: 'y', nextReviewDue: '2999-01-01T00:00:00.000Z' });

    expect(repo.listByDeck('A').map((c) => c.front_prompt)).toEqual(['past']);
    expect(repo.listDue('2026-10-30T00:00:00.000Z').map((c) => c.front_prompt)).toEqual(['past']);
  });

  it('deleteById reports whether a row was removed', () => {
    const repo = createFlashcardsRepo(db);
    const card = repo.create({ deckName: 'A', frontPrompt: 'f', backAnswer: 'b' });
    expect(repo.deleteById(card.id)).toBe(true);
    expect(repo.deleteById(card.id)).toBe(false);
  });

  it('getById resolves stored cards and misses unknown ids', () => {
    const repo = createFlashcardsRepo(db);
    const card = repo.create({ deckName: 'A', frontPrompt: 'f', backAnswer: 'b' });
    expect(repo.getById(card.id)?.front_prompt).toBe('f');
    expect(repo.getById(9999)).toBeUndefined();
  });

  it('updateReviewState persists Leitner box and due date', () => {
    const repo = createFlashcardsRepo(db);
    const card = repo.create({ deckName: 'A', frontPrompt: 'f', backAnswer: 'b' });
    repo.updateReviewState(card.id, 4, '2026-11-07T00:00:00.000Z');
    const row = repo.getById(card.id);
    expect(row?.leitner_box_position).toBe(4);
    expect(row?.next_review_due).toBe('2026-11-07T00:00:00.000Z');
  });

  it('drawDueCard draws the oldest due card of one deck only', () => {
    const repo = createFlashcardsRepo(db);
    repo.create({ deckName: 'A', frontPrompt: 'older', backAnswer: 'x', nextReviewDue: '2026-01-01T00:00:00.000Z' });
    repo.create({ deckName: 'A', frontPrompt: 'newer', backAnswer: 'y', nextReviewDue: '2026-02-01T00:00:00.000Z' });
    repo.create({ deckName: 'B', frontPrompt: 'other', backAnswer: 'z', nextReviewDue: '2025-01-01T00:00:00.000Z' });
    repo.create({
      deckName: 'A',
      frontPrompt: 'future',
      backAnswer: 'w',
      nextReviewDue: '2999-01-01T00:00:00.000Z'
    });

    const drawn = repo.drawDueCard('A', '2026-10-30T00:00:00.000Z');
    expect(drawn?.front_prompt).toBe('older');
    expect(repo.drawDueCard('Does Not Exist')).toBeUndefined();
  });

  it('listDecks aggregates card counts; dueCount filters by date', () => {
    const repo = createFlashcardsRepo(db);
    repo.create({ deckName: 'A', frontPrompt: '1', backAnswer: 'x' });
    repo.create({ deckName: 'A', frontPrompt: '2', backAnswer: 'y' });
    repo.create({
      deckName: 'B',
      frontPrompt: '3',
      backAnswer: 'z',
      nextReviewDue: '2999-01-01T00:00:00.000Z'
    });

    expect(repo.listDecks()).toEqual([
      { deck_name: 'A', card_count: 2 },
      { deck_name: 'B', card_count: 1 }
    ]);
    expect(repo.dueCount('A', '2998-01-01T00:00:00.000Z')).toBe(2);
    expect(repo.dueCount('B', '2998-01-01T00:00:00.000Z')).toBe(0);
  });
});

describe('contentPoolRepo', () => {
  const prompt = (questionIndex: number) => ({
    questionIndex,
    promptText: `question ${questionIndex}`,
    solutionCriteria: 'criteria'
  });

  it('writes content and prompts atomically and reads them back ordered', () => {
    const repo = createContentPoolRepo(db);
    const uuid = repo.insertWithPrompts({
      module: 'english',
      subTopic: 'Golden Age Sci-Fi',
      sourceType: 'synthetic',
      sourceTitle: 'demo',
      passageBody: 'A passage of text.',
      prompts: [prompt(2), prompt(1)]
    });

    const got = repo.getByUuid(uuid);
    expect(got?.content.passage_body).toBe('A passage of text.');
    expect(got?.content.sub_topic).toBe('Golden Age Sci-Fi');
    expect(got?.prompts.map((p) => p.question_index)).toEqual([1, 2]);
  });

  it('rejects unknown modules and duplicate question indexes', () => {
    const repo = createContentPoolRepo(db);
    expect(() =>
      repo.insertWithPrompts({ module: 'poetry' as ContentModule, sourceType: 'synthetic', passageBody: 'x', prompts: [] })
    ).toThrow(/CHECK/);
    expect(() =>
      repo.insertWithPrompts({ module: 'math', sourceType: 'synthetic', passageBody: 'x', prompts: [prompt(1), prompt(1)] })
    ).toThrow(/UNIQUE/);
  });

  it('cascades prompt deletion with the content row (FK ON DELETE CASCADE)', () => {
    const repo = createContentPoolRepo(db);
    const uuid = repo.insertWithPrompts({
      module: 'history',
      sourceType: 'user_ingested',
      passageBody: 'x',
      prompts: [prompt(1), prompt(2)]
    });

    expect(repo.deleteByUuid(uuid)).toBe(true);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM interactive_prompts').get() as { c: number }).c
    ).toBe(0);
    expect(repo.getByUuid(uuid)).toBeUndefined();
  });

  it('listSummaries returns library rows without passage bodies', () => {
    const repo = createContentPoolRepo(db);
    repo.insertWithPrompts({ module: 'logic', sourceType: 'synthetic', passageBody: 'big body', prompts: [] });
    const summaries = repo.listSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).not.toHaveProperty('passage_body');
    expect(summaries[0].module).toBe('logic');
  });
});

describe('bookEpisodesRepo', () => {
  const episode = (episodeNumber: number, isCanonical = false) => ({
    episodeNumber,
    episodeTitle: `Episode ${episodeNumber}`,
    contentText: `Text for episode ${episodeNumber}.`,
    isCanonical
  });

  it('inserts a book atomically and lists episodes in canonical order', () => {
    const repo = createBookEpisodesRepo(db);
    expect(repo.insertBook('Demo', [episode(3), episode(1), episode(2)])).toBe(3);

    const episodes = repo.listEpisodes('Demo');
    expect(episodes.map((e) => e.episode_number)).toEqual([1, 2, 3]);
    expect(episodes[0].isCanonical).toBe(false);
    expect(episodes[0].content_text).toBe('Text for episode 1.');
  });

  it('enforces unique episode numbers per book, unique across books', () => {
    const repo = createBookEpisodesRepo(db);
    repo.insertBook('Book A', [episode(1)]);
    expect(() => repo.insertBook('Book A', [episode(1)])).toThrow(/UNIQUE/);
    expect(() => repo.insertBook('Book B', [episode(1)])).not.toThrow();
  });

  it('summarizes books with episode counts and supports deletion', () => {
    const repo = createBookEpisodesRepo(db);
    repo.insertBook('Book A', [episode(1), episode(2)]);
    repo.insertBook('Book B', [episode(1)]);
    expect(repo.listBooks()).toEqual([
      { book_title: 'Book A', episode_count: 2 },
      { book_title: 'Book B', episode_count: 1 }
    ]);

    expect(repo.deleteBook('Book A')).toBe(true);
    expect(repo.listEpisodes('Book A')).toHaveLength(0);
  });

  it('persists recaps and content links (migration v3 columns)', () => {
    const repo = createBookEpisodesRepo(db);
    const pools = createContentPoolRepo(db);
    const uuid = pools.insertWithPrompts({
      module: 'english',
      sourceType: 'user_ingested',
      sourceTitle: 'linked',
      passageBody: 'episode text',
      prompts: []
    });

    repo.insertBook('Linked', [
      {
        episodeNumber: 1,
        episodeTitle: 'The Harbor',
        contentText: 'Text one.',
        isCanonical: true,
        episodeRecap: 'Previously: the fog arrived.',
        contentUuid: uuid
      },
      { episodeNumber: 2, contentText: 'Text two.', isCanonical: true }
    ]);

    const first = repo.getEpisode('Linked', 1);
    expect(first?.episodeRecap).toBe('Previously: the fog arrived.');
    expect(first?.contentUuid).toBe(uuid);

    const second = repo.getEpisode('Linked', 2);
    expect(second?.episodeRecap).toBeNull();
    expect(second?.contentUuid).toBeNull();
    expect(repo.getEpisode('Linked', 9)).toBeUndefined();

    expect(repo.bookTrack('Linked')).toBe(true);
    expect(repo.bookTrack('Unknown')).toBeNull();

    // ON DELETE SET NULL: the episode survives its question set.
    pools.deleteByUuid(uuid);
    expect(repo.getEpisode('Linked', 1)?.contentUuid).toBeNull();
  });
});

describe('readingStreaksRepo', () => {
  it('ensure creates a default row exactly once', () => {
    const repo = createReadingStreaksRepo(db);
    const row = repo.ensure('Demo');
    expect(row.current_episode).toBe(1);
    expect(row.last_read_date).toBeNull();

    const again = repo.ensure('Demo');
    expect(again.current_episode).toBe(1);
  });

  it('advance increments the episode and stamps the read date', () => {
    const repo = createReadingStreaksRepo(db);
    repo.ensure('Demo');
    const after = repo.advance('Demo');
    expect(after.current_episode).toBe(2);
    expect(after.last_read_date).not.toBeNull();
    expect(after.last_read_date).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO-8601 convention
  });
});
