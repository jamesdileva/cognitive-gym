import type { GymDatabase } from '../database';
import { logActivity } from '../activityLog';

export interface ReadingStreakRow {
  book_title: string;
  current_episode: number;
  last_read_date: string | null;
}

/**
 * Where each user stands in every episodic book (book-to-shortstories.md).
 * Thin storage for now — pacing/gating logic arrives with the reader in Sprint 6.
 */
export function createReadingStreaksRepo(db: GymDatabase) {
  const selectByBook = db.prepare('SELECT * FROM user_reading_streaks WHERE book_title = ?');

  return {
    /** Returns the streak row, creating it (episode 1, never read) on first touch. */
    ensure(bookTitle: string): ReadingStreakRow {
      db.prepare(
        'INSERT OR IGNORE INTO user_reading_streaks (book_title, current_episode) VALUES (?, 1)'
      ).run(bookTitle);
      return selectByBook.get(bookTitle) as ReadingStreakRow;
    },

    get(bookTitle: string): ReadingStreakRow | undefined {
      return selectByBook.get(bookTitle) as ReadingStreakRow | undefined;
    },

    /** Marks progress: moves to the next episode, stamps the read date, logs activity. */
    advance(bookTitle: string): ReadingStreakRow {
      this.ensure(bookTitle);
      db.prepare(
        `
        UPDATE user_reading_streaks
        SET current_episode = current_episode + 1, last_read_date = ?
        WHERE book_title = ?
        `
      ).run(new Date().toISOString(), bookTitle);
      logActivity(db, 'episodes', bookTitle, true);
      return selectByBook.get(bookTitle) as ReadingStreakRow;
    }
  };
}

export type ReadingStreaksRepo = ReturnType<typeof createReadingStreaksRepo>;
