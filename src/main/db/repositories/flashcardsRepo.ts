import type { GymDatabase } from '../database';

export interface FlashcardRow {
  id: number;
  deck_name: string;
  front_prompt: string;
  back_answer: string;
  leitner_box_position: number;
  next_review_due: string;
}

export interface CreateFlashcardInput {
  deckName: string;
  frontPrompt: string;
  backAnswer: string;
  /** ISO-8601 UTC; defaults to now (due immediately). Leitner scheduling lands in Sprint 4. */
  nextReviewDue?: string;
}

/**
 * Flashcard persistence. The Leitner box transition *algorithm* is a pure
 * module added in Sprint 4; this repo only stores resulting state.
 */
export function createFlashcardsRepo(db: GymDatabase) {
  return {
    create(input: CreateFlashcardInput): FlashcardRow {
      const result = db
        .prepare(
          `
          INSERT INTO flashcards (deck_name, front_prompt, back_answer, next_review_due)
          VALUES (?, ?, ?, ?)
          `
        )
        .run(
          input.deckName,
          input.frontPrompt,
          input.backAnswer,
          input.nextReviewDue ?? new Date().toISOString()
        );
      const id = Number(result.lastInsertRowid);
      return db.prepare('SELECT * FROM flashcards WHERE id = ?').get(id) as FlashcardRow;
    },

    getById(id: number): FlashcardRow | undefined {
      return db.prepare('SELECT * FROM flashcards WHERE id = ?').get(id) as FlashcardRow | undefined;
    },

    listByDeck(deckName: string): FlashcardRow[] {
      return db
        .prepare('SELECT * FROM flashcards WHERE deck_name = ? ORDER BY id')
        .all(deckName) as FlashcardRow[];
    },

    /** Cards whose review time has arrived (ISO strings compare lexicographically). */
    listDue(nowIso: string = new Date().toISOString()): FlashcardRow[] {
      return db
        .prepare('SELECT * FROM flashcards WHERE next_review_due <= ? ORDER BY next_review_due')
        .all(nowIso) as FlashcardRow[];
    },

    /** Oldest due card of one deck — the review queue's draw. */
    drawDueCard(deckName: string, nowIso: string = new Date().toISOString()): FlashcardRow | undefined {
      return db
        .prepare(
          `
          SELECT * FROM flashcards
          WHERE deck_name = ? AND next_review_due <= ?
          ORDER BY next_review_due, id
          LIMIT 1
          `
        )
        .get(deckName, nowIso) as FlashcardRow | undefined;
    },

    /** Persists a Leitner transition (box + scheduled due date). */
    updateReviewState(id: number, box: number, nextReviewDueIso: string): void {
      db.prepare('UPDATE flashcards SET leitner_box_position = ?, next_review_due = ? WHERE id = ?').run(
        box,
        nextReviewDueIso,
        id
      );
    },

    listDecks(): { deck_name: string; card_count: number }[] {
      return db
        .prepare(
          'SELECT deck_name, COUNT(*) AS card_count FROM flashcards GROUP BY deck_name ORDER BY deck_name'
        )
        .all() as { deck_name: string; card_count: number }[];
    },

    dueCount(deckName: string, nowIso: string = new Date().toISOString()): number {
      const row = db
        .prepare(
          'SELECT COUNT(*) AS c FROM flashcards WHERE deck_name = ? AND next_review_due <= ?'
        )
        .get(deckName, nowIso) as { c: number };
      return row.c;
    },

    deleteById(id: number): boolean {
      return db.prepare('DELETE FROM flashcards WHERE id = ?').run(id).changes > 0;
    }
  };
}

export type FlashcardsRepo = ReturnType<typeof createFlashcardsRepo>;
