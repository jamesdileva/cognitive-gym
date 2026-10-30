import type { GymDatabase } from '../database';

export interface BookEpisodeRow {
  id: number;
  book_title: string;
  episode_number: number;
  episode_title: string | null;
  content_text: string;
  /** true = serialized track (locked order), false = anthology (shufflable). */
  isCanonical: boolean;
}

export interface InsertEpisodeInput {
  episodeNumber: number;
  episodeTitle?: string;
  contentText: string;
  isCanonical: boolean;
}

/**
 * The "30-Day Episode" store (book-to-shortstories.md). Episodes for one book
 * are written atomically; canonical ordering is enforced by the UNIQUE
 * (book_title, episode_number) constraint.
 */
export function createBookEpisodesRepo(db: GymDatabase) {
  return {
    /** Inserts all episodes of a book in one transaction. Returns the count written. */
    insertBook(bookTitle: string, episodes: InsertEpisodeInput[]): number {
      const write = db.transaction(() => {
        for (const episode of episodes) {
          db.prepare(
            `
            INSERT INTO book_episodes (book_title, episode_number, episode_title, content_text, is_canonical)
            VALUES (?, ?, ?, ?, ?)
            `
          ).run(
            bookTitle,
            episode.episodeNumber,
            episode.episodeTitle ?? null,
            episode.contentText,
            episode.isCanonical ? 1 : 0
          );
        }
      });
      write();
      return episodes.length;
    },

    listBooks(): { book_title: string; episode_count: number }[] {
      return db
        .prepare(
          `
          SELECT book_title, COUNT(*) AS episode_count
          FROM book_episodes GROUP BY book_title ORDER BY book_title
          `
        )
        .all() as { book_title: string; episode_count: number }[];
    },

    /** Episodes in canonical order — the reader engine decides pacing/shuffling. */
    listEpisodes(bookTitle: string): BookEpisodeRow[] {
      const rows = db
        .prepare(
          'SELECT * FROM book_episodes WHERE book_title = ? ORDER BY episode_number'
        )
        .all(bookTitle) as (Omit<BookEpisodeRow, 'isCanonical'> & { is_canonical: number })[];
      return rows.map((row) => ({
        id: row.id,
        book_title: row.book_title,
        episode_number: row.episode_number,
        episode_title: row.episode_title,
        content_text: row.content_text,
        isCanonical: row.is_canonical === 1
      }));
    },

    deleteBook(bookTitle: string): boolean {
      return db.prepare('DELETE FROM book_episodes WHERE book_title = ?').run(bookTitle).changes > 0;
    }
  };
}

export type BookEpisodesRepo = ReturnType<typeof createBookEpisodesRepo>;
