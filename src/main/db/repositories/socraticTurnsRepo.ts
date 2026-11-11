import type { GymDatabase } from '../database';

/**
 * Socratic dialogue memory (Sprint 18): turn-by-turn storage of every
 * tutor↔student exchange, keyed by an attempt key each surface composes
 * (math: `templateId#seed`; reading: `uuid:questionIndex`). Follow-up
 * questions are grounded in the stored exchange.
 */
export interface SocraticTurnRow {
  id: number;
  attempt_key: string;
  turn_index: number;
  role: 'tutor' | 'student';
  content: string;
  created_at: string;
}

export function createSocraticTurnsRepo(db: GymDatabase) {
  return {
    /** Appends the next turn for an attempt key (turn_index = count). */
    append(attemptKey: string, role: 'tutor' | 'student', content: string): void {
      const write = db.transaction(() => {
        const count = db
          .prepare('SELECT COUNT(*) AS c FROM socratic_turns WHERE attempt_key = ?')
          .get(attemptKey) as { c: number };
        db.prepare(
          'INSERT INTO socratic_turns (attempt_key, turn_index, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(attemptKey, count, role, content, new Date().toISOString());
      });
      write();
    },

    /** Turns in conversation order (oldest first). */
    list(attemptKey: string): SocraticTurnRow[] {
      return db
        .prepare('SELECT * FROM socratic_turns WHERE attempt_key = ? ORDER BY turn_index')
        .all(attemptKey) as SocraticTurnRow[];
    },

    clear(attemptKey: string): void {
      db.prepare('DELETE FROM socratic_turns WHERE attempt_key = ?').run(attemptKey);
    }
  };
}

export type SocraticTurnsRepo = ReturnType<typeof createSocraticTurnsRepo>;
