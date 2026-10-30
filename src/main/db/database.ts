import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations';
import { migrate } from './migrator';

export type GymDatabase = Database.Database;

export interface OpenDatabaseOptions {
  /** Override the bundled migrations (tests inject their own scenarios). */
  migrations?: typeof MIGRATIONS;
}

/**
 * Opens (or creates) the application database with the pragmas the schema
 * depends on, then brings it to the latest schema version.
 *
 * - `foreign_keys = ON` — required for the interactive_prompts CASCADE delete.
 * - `journal_mode = WAL` — concurrent-read friendly for the renderer/main split.
 */
export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): GymDatabase {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db, options.migrations ?? MIGRATIONS);
  return db;
}
