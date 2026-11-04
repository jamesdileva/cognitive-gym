import { randomUUID } from 'node:crypto';

/**
 * Single-use, TTL-bound tokens that authorize file ingestion (Sprint 10 audit).
 *
 * The renderer never receives or transmits raw filesystem paths: the native
 * dialog is the only path source, the main process holds the mapping, and an
 * invocation without a valid unexpired token cannot read any file. This closes
 * the arbitrary-file-read hole where a compromised renderer could call
 * ingestRun/epIngest with an arbitrary `.txt/.pdf/.epub` path.
 */
export class FileTokenStore {
  private readonly tokens = new Map<string, { path: string; expiresAt: number }>();

  constructor(private readonly ttlMs: number = 30 * 60_000) {}

  /** Issues a single-use token bound to one path. */
  issue(path: string, now: number = Date.now()): string {
    const token = randomUUID();
    this.tokens.set(token, { path, expiresAt: now + this.ttlMs });
    return token;
  }

  /** Resolves and consumes a token; null when unknown, expired, or already used. */
  resolve(token: string, now: number = Date.now()): string | null {
    const entry = this.tokens.get(token);
    this.tokens.delete(token);
    if (!entry || entry.expiresAt <= now) return null;
    return entry.path;
  }
}
