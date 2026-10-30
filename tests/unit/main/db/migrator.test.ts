import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GymDatabase } from '@main/db/database';
import { migrate, type Migration } from '@main/db/migrator';

const v1: Migration = { version: 1, name: 'one', up: 'CREATE TABLE a (id INTEGER);' };
const v2: Migration = { version: 2, name: 'two', up: 'CREATE TABLE b (id INTEGER);' };
const v3: Migration = { version: 3, name: 'three', up: 'CREATE TABLE c (id INTEGER);' };

let db: GymDatabase;
beforeEach(() => {
  db = new Database(':memory:');
});

describe('migrate', () => {
  it('applies all migrations to a fresh database and returns the latest version', () => {
    expect(migrate(db, [v1, v2])).toBe(2);
    expect(db.prepare('SELECT version, name FROM _migrations ORDER BY version').all()).toEqual([
      { version: 1, name: 'one' },
      { version: 2, name: 'two' }
    ]);
  });

  it('is idempotent on an up-to-date database', () => {
    migrate(db, [v1, v2]);
    expect(migrate(db, [v1, v2])).toBe(2);
    expect((db.prepare('SELECT COUNT(*) AS c FROM _migrations').get() as { c: number }).c).toBe(2);
  });

  it('applies only new migrations incrementally', () => {
    expect(migrate(db, [v1])).toBe(1);
    expect(migrate(db, [v1, v2])).toBe(2);
    // Table from the second round exists; nothing was re-run.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='b'").all()
    ).toHaveLength(1);
  });

  it('skips an already-applied version even when re-listed', () => {
    migrate(db, [v1]);
    const duplicateOfV1: Migration = { version: 1, name: 'one-again', up: 'SELECT 1;' };
    expect(() => migrate(db, [duplicateOfV1])).not.toThrow();
  });

  it('rejects an unapplied migration that would break version ordering', () => {
    migrate(db, [v1, v3]); // gap at v2 is tolerated during a single run...
    expect(() => migrate(db, [v1, v2, v3])).toThrow(/conflicts/); // ...but never backfills
  });

  it('rolls back a failed migration completely', () => {
    const bad: Migration = {
      version: 1,
      name: 'bad',
      up: 'CREATE TABLE a (id INTEGER); INSERT INTO no_such_table VALUES (1);'
    };
    expect(() => migrate(db, [bad])).toThrow();

    // The CREATE TABLE from the failed script must be rolled back with it.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a'").all()
    ).toHaveLength(0);
    expect((db.prepare('SELECT COUNT(*) AS c FROM _migrations').get() as { c: number }).c).toBe(0);
  });
});
