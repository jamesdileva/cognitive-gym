import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { createReviewService } from '@main/srs/reviewService';

let db: GymDatabase;
let cards: ReturnType<typeof createFlashcardsRepo>;
let service: ReturnType<typeof createReviewService>;

beforeEach(() => {
  db = openDatabase(':memory:');
  cards = createFlashcardsRepo(db);
  service = createReviewService({ cards });
});

describe('reviewService', () => {
  it('summarizes decks with card and due counts', () => {
    cards.create({ deckName: 'Deck A', frontPrompt: '1', backAnswer: 'one' });
    cards.create({ deckName: 'Deck A', frontPrompt: '2', backAnswer: 'two' });
    cards.create({
      deckName: 'Deck B',
      frontPrompt: '3',
      backAnswer: 'three',
      nextReviewDue: '2999-01-01T00:00:00.000Z' // not due
    });

    expect(service.listDecks()).toEqual([
      { deckName: 'Deck A', cardCount: 2, dueCount: 2 },
      { deckName: 'Deck B', cardCount: 1, dueCount: 0 }
    ]);
  });

  it('draws due cards front-only (the answer never ships with the queue)', () => {
    cards.create({ deckName: 'Deck A', frontPrompt: 'A', backAnswer: 'Alpha' });

    const card = service.drawCard('Deck A');
    expect(card).toEqual({ id: expect.any(Number), deckName: 'Deck A', front: 'A' });
    expect(JSON.stringify(card)).not.toContain('Alpha');
  });

  it('returns null when the deck has nothing due', () => {
    cards.create({
      deckName: 'Deck A',
      frontPrompt: 'future',
      backAnswer: 'x',
      nextReviewDue: '2999-01-01T00:00:00.000Z'
    });
    expect(service.drawCard('Deck A')).toBeNull();
  });

  it('reveals the back without changing scheduling state', () => {
    const created = cards.create({ deckName: 'Deck A', frontPrompt: 'A', backAnswer: 'Alpha' });

    expect(service.revealCard(created.id)).toEqual({ back: 'Alpha' });
    const row = cards.getById(created.id);
    expect(row?.leitner_box_position).toBe(1);
  });

  it('grades correct: promotes box and schedules the next interval', () => {
    const created = cards.create({ deckName: 'Deck A', frontPrompt: 'A', backAnswer: 'Alpha' });

    const outcome = service.gradeCard(created.id, true);
    expect(outcome).toMatchObject({ back: 'Alpha', box: 2, nextDueDays: 2 });

    const row = cards.getById(created.id);
    expect(row?.leitner_box_position).toBe(2);
    const dueInDays = (new Date(row?.next_review_due ?? '').getTime() - Date.now()) / 86_400_000;
    expect(dueInDays).toBeGreaterThan(1.9);
    expect(dueInDays).toBeLessThan(2.1);

    // Graded card leaves today's queue.
    expect(service.drawCard('Deck A')).toBeNull();
  });

  it('grades incorrect: resets to box 1, due tomorrow', () => {
    const created = cards.create({ deckName: 'Deck A', frontPrompt: 'A', backAnswer: 'Alpha' });
    cards.updateReviewState(created.id, 4, new Date().toISOString()); // simulate advanced card

    const outcome = service.gradeCard(created.id, false);
    expect(outcome).toMatchObject({ box: 1, nextDueDays: 1 });

    // Due tomorrow → not in today's queue anymore.
    expect(service.drawCard('Deck A')).toBeNull();
  });

  it('caps promotion at box 5', () => {
    const created = cards.create({ deckName: 'Deck A', frontPrompt: 'A', backAnswer: 'Alpha' });
    cards.updateReviewState(created.id, 5, new Date().toISOString());

    expect(service.gradeCard(created.id, true).box).toBe(5);
  });

  it('throws on unknown card ids', () => {
    expect(() => service.revealCard(9999)).toThrow(/Unknown flashcard/);
    expect(() => service.gradeCard(9999, true)).toThrow(/Unknown flashcard/);
  });
});
