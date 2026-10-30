import type { GymDatabase } from './database';

/**
 * A single ordered schema change. Migrations are applied inside a transaction
 * and recorded in the `_migrations` meta table; they must never be edited once
 * shipped — add a new entry instead.
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
}

/**
 * Applies every not-yet-applied migration in order, each in its own transaction.
 * Returns the resulting schema version. Idempotent: re-running on an up-to-date
 * database is a no-op.
 */
export function migrate(db: GymDatabase, migrations: Migration[]): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM _migrations ORDER BY version')
    .all() as { version: number }[];
  const applied = new Set(appliedRows.map((row) => row.version));
  let latest = applied.size > 0 ? Math.max(...applied) : 0;

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    if (migration.version <= latest) {
      throw new Error(
        `Migration ${migration.version} (${migration.name}) conflicts with applied version ${latest}`
      );
    }

    // Transactional DDL: a failed migration rolls back its schema changes
    // and is not recorded, so the next run retries it cleanly.
    const apply = db.transaction(() => {
      db.exec(migration.up);
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      );
    });
    apply();

    latest = migration.version;
  }

  return latest;
}
