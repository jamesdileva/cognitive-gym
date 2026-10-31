import { describe, expect, it } from 'vitest';
import { openDatabase } from '@main/db/database';

const EXPECTED_TABLES = [
  'user_progress',
  'flashcards',
  'content_pool',
  'interactive_prompts',
  'book_episodes',
  'user_reading_streaks',
  'app_settings'
];

describe('openDatabase', () => {
  it('creates every schema table on a fresh database', () => {
    const db = openDatabase(':memory:');
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((row) => row.name);
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('enables foreign key enforcement (required by the prompts CASCADE)', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('brings a fresh database to the latest schema version', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('journal_mode', { simple: true })).toBe('memory'); // WAL is a no-op in memory
    const row = db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number };
    expect(row.v).toBe(3);
  });
});
