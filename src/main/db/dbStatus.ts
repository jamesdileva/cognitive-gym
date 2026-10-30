import type { DbStatusResponse } from '@shared/ipc-types';
import type { GymDatabase } from './database';

// Static table list — never derived from user input, so interpolation is safe.
const TRACKED_TABLES = [
  'user_progress',
  'flashcards',
  'content_pool',
  'interactive_prompts',
  'book_episodes',
  'user_reading_streaks'
] as const;

/** Aggregate health snapshot surfaced to the renderer via the db:status channel. */
export function buildDbStatus(db: GymDatabase): DbStatusResponse {
  const versionRow = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM _migrations')
    .get() as { v: number };

  const existingTables = new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name)
  );

  const tableCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const table of TRACKED_TABLES) {
    if (!existingTables.has(table)) continue; // tolerate not-yet-migrated databases
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    tableCounts[table] = row.c;
    totalRows += row.c;
  }

  return { migrationVersion: versionRow.v, tableCounts, totalRows };
}
