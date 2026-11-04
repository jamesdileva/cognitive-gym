import { describe, expect, it } from 'vitest';
import { FileTokenStore } from '@main/ingestion/fileTokens';

describe('FileTokenStore (single-use, TTL-bound ingest authorization)', () => {
  it('round-trips a token to its path', () => {
    const store = new FileTokenStore();
    const token = store.issue('C:\\books\\novel.pdf');
    expect(store.resolve(token)).toBe('C:\\books\\novel.pdf');
  });

  it('consumes tokens on resolve (single use)', () => {
    const store = new FileTokenStore();
    const token = store.issue('a.txt');
    expect(store.resolve(token)).toBe('a.txt');
    expect(store.resolve(token)).toBeNull(); // replay rejected
  });

  it('rejects expired tokens', () => {
    const store = new FileTokenStore(60_000);
    const token = store.issue('a.txt', 1_000);
    expect(store.resolve(token, 1_000 + 61_000)).toBeNull();
  });

  it('accepts tokens within their TTL', () => {
    const store = new FileTokenStore(60_000);
    const token = store.issue('a.txt', 1_000);
    expect(store.resolve(token, 1_000 + 59_000)).toBe('a.txt');
  });

  it('rejects unknown tokens with null (no throw)', () => {
    const store = new FileTokenStore();
    expect(store.resolve('never-issued')).toBeNull();
  });
});
