import { describe, expect, it } from 'vitest';
import { buildDbStatus } from '@main/db/dbStatus';
import { openDatabase } from '@main/db/database';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { createUserProgressRepo } from '@main/db/repositories/userProgressRepo';

describe('buildDbStatus', () => {
  it('reports the schema version and per-table counts', () => {
    const db = openDatabase(':memory:');
    createFlashcardsRepo(db).create({ deckName: 'd', frontPrompt: 'f', backAnswer: 'b' });
    createUserProgressRepo(db).recordAttempt({ moduleType: 'math', contentItemId: 'x', successful: true });

    const status = buildDbStatus(db);
    expect(status.migrationVersion).toBe(4);
    expect(status.tableCounts['flashcards']).toBe(1);
    expect(status.tableCounts['user_progress']).toBe(1);
    expect(status.tableCounts['content_pool']).toBe(0);
    expect(status.totalRows).toBe(2);
  });

  it('reports version 0 for a database with no migrations applied', () => {
    const db = openDatabase(':memory:', { migrations: [] });
    expect(buildDbStatus(db)).toEqual({
      migrationVersion: 0,
      tableCounts: {},
      totalRows: 0
    });
  });
});
