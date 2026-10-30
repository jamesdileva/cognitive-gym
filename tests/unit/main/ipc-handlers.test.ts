import { describe, expect, it, vi } from 'vitest';
import { handlePing, registerIpcHandlers } from '@main/ipcHandlers';
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
  it('registers exactly one handler per contract channel, wired to the pure logic', () => {
    const handlers = new Map<string, unknown>();
    const registrar = {
      handle: vi.fn((channel: string, handler: unknown) => {
        handlers.set(channel, handler);
      })
    };

    registerIpcHandlers(registrar);

    expect(registrar.handle).toHaveBeenCalledOnce();
    expect(handlers.has(IPC_CHANNELS.ping)).toBe(true);

    const pingHandler = handlers.get(IPC_CHANNELS.ping) as (
      event: unknown,
      request: { payload: string }
    ) => unknown;

    expect(pingHandler({}, { payload: 'bridge-test' })).toEqual({
      echo: 'bridge-test',
      receivedAtMs: expect.any(Number)
    });
  });
});
