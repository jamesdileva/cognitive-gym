import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc-types';

describe('IPC channel registry', () => {
  const channels = Object.values(IPC_CHANNELS);

  it('exposes at least one channel', () => {
    expect(channels.length).toBeGreaterThan(0);
  });

  it('uses namespaced, unique channel names', () => {
    expect(new Set(channels).size).toBe(channels.length);
    for (const channel of channels) {
      expect(channel).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });
});
