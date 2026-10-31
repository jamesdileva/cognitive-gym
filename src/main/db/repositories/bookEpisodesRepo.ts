import type { GymDatabase } from '../database';

export interface BookEpisodeRow {
  id: number;
  book_title: string;
  episode_number: number;
  episode_title: string | null;
  content_text: string;
  /** true = serialized track (locked order), false = anthology (shufflable). */
  isCanonical: boolean;
  /** 1-sentence "previously on" (canonical) or premise hook (anthology). */
  episodeRecap: string | null;
  /** Linked comprehension questions in content_pool (null when distill failed). */
  contentUuid: string | null;
}

export interface InsertEpisodeInput {
  episodeNumber: number;
  episodeTitle?: string;
  contentText: string;
  isCanonical: boolean;
  episodeRecap?: string;
  contentUuid?: string;
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
            INSERT INTO book_episodes (
              book_title, episode_number, episode_title, content_text, is_canonical,
              episode_recap, content_uuid
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `
          ).run(
            bookTitle,
            episode.episodeNumber,
            episode.episodeTitle ?? null,
            episode.contentText,
            episode.isCanonical ? 1 : 0,
            episode.episodeRecap ?? null,
            episode.contentUuid ?? null
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

    /** A book's track type is decided at ingest time and shared by all episodes. */
    bookTrack(bookTitle: string): boolean | null {
      const row = db
        .prepare('SELECT is_canonical FROM book_episodes WHERE book_title = ? LIMIT 1')
        .get(bookTitle) as { is_canonical: number } | undefined;
      return row === undefined ? null : row.is_canonical === 1;
    },

    /** Episodes in canonical order — the feed engine decides pacing/shuffling. */
    listEpisodes(bookTitle: string): BookEpisodeRow[] {
      const rows = db
        .prepare('SELECT * FROM book_episodes WHERE book_title = ? ORDER BY episode_number')
        .all(bookTitle) as (Omit<BookEpisodeRow, 'isCanonical' | 'episodeRecap' | 'contentUuid'> & {
        is_canonical: number;
        episode_recap: string | null;
        content_uuid: string | null;
      })[];
      return rows.map(mapRow);
    },

    getEpisode(bookTitle: string, episodeNumber: number): BookEpisodeRow | undefined {
      const row = db
        .prepare('SELECT * FROM book_episodes WHERE book_title = ? AND episode_number = ?')
        .get(bookTitle, episodeNumber) as
        | (Omit<BookEpisodeRow, 'isCanonical' | 'episodeRecap' | 'contentUuid'> & {
            is_canonical: number;
            episode_recap: string | null;
            content_uuid: string | null;
          })
        | undefined;
      return row === undefined ? undefined : mapRow(row);
    },

    deleteBook(bookTitle: string): boolean {
      return db.prepare('DELETE FROM book_episodes WHERE book_title = ?').run(bookTitle).changes > 0;
    }
  };
}

type RawEpisodeRow = Omit<BookEpisodeRow, 'isCanonical' | 'episodeRecap' | 'contentUuid'> & {
  is_canonical: number;
  episode_recap: string | null;
  content_uuid: string | null;
};

function mapRow(row: RawEpisodeRow): BookEpisodeRow {
  return {
    id: row.id,
    book_title: row.book_title,
    episode_number: row.episode_number,
    episode_title: row.episode_title,
    content_text: row.content_text,
    isCanonical: row.is_canonical === 1,
    episodeRecap: row.episode_recap,
    contentUuid: row.content_uuid
  };
}

export type BookEpisodesRepo = ReturnType<typeof createBookEpisodesRepo>;
