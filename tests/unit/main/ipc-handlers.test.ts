import { describe, expect, it, vi } from 'vitest';
import { buildDbStatus } from '@main/db/dbStatus';
import { openDatabase } from '@main/db/database';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { handlePing, registerIpcHandlers, type IpcServices } from '@main/ipcHandlers';
import { IPC_CHANNELS } from '@shared/ipc-types';

describe('handlePing', () => {
  it('echoes the payload and stamps the injected clock', () => {
    expect(handlePing({ payload: 'hello-gym' }, 1234)).toEqual({
      echo: 'hello-gym',
      receivedAtMs: 1234
    });
  });

  it('defaults the timestamp to the current time', () => {
    const before = Date.now();
    const response = handlePing({ payload: 'x' });
    expect(response.receivedAtMs).toBeGreaterThanOrEqual(before);
  });
});

describe('registerIpcHandlers', () => {
  const noopServices: IpcServices = {
    dbStatus: () => ({ migrationVersion: 1, tableCounts: {}, totalRows: 0 })
  };

  it('registers exactly one handler per contract channel', () => {
    const registrar = { handle: vi.fn() };
    registerIpcHandlers(registrar, noopServices);

    const channels = registrar.handle.mock.calls.map((call) => call[0]);
    expect(channels).toEqual([IPC_CHANNELS.ping, IPC_CHANNELS.dbStatus]);
  });

  it('wires the ping handler to the pure logic', () => {
    const handlers = new Map<string, unknown>();
    registerIpcHandlers({ handle: (channel, handler) => void handlers.set(channel, handler) }, noopServices);

    const pingHandler = handlers.get(IPC_CHANNELS.ping) as (
      event: unknown,
      request: { payload: string }
    ) => unknown;
    expect(pingHandler({}, { payload: 'bridge-test' })).toEqual({
      echo: 'bridge-test',
      receivedAtMs: expect.any(Number)
    });
  });

  it('round-trips a real database through the dbStatus handler (repo → IPC)', () => {
    const db = openDatabase(':memory:');
    createFlashcardsRepo(db).create({ deckName: 'd', frontPrompt: 'f', backAnswer: 'b' });

    const handlers = new Map<string, unknown>();
    registerIpcHandlers({ handle: (channel, handler) => void handlers.set(channel, handler) }, {
      dbStatus: () => buildDbStatus(db)
    });

    const dbStatusHandler = handlers.get(IPC_CHANNELS.dbStatus) as () => unknown;
    expect(dbStatusHandler()).toEqual({
      migrationVersion: 1,
      tableCounts: { flashcards: 1, user_progress: 0, content_pool: 0, interactive_prompts: 0, book_episodes: 0, user_reading_streaks: 0 },
      totalRows: 1
    });
  });
});
