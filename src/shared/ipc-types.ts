/**
 * Typed IPC channel contract shared by main, preload, and renderer.
 *
 * AGENTS.md §3: all cross-process access goes through these typed channels —
 * renderer code never touches Node, SQLite, or Ollama directly.
 */

export const IPC_CHANNELS = {
  /** Round-trip health check for the Electron process bridge. */
  ping: 'system:ping'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Request payload for {@link IPC_CHANNELS.ping}. */
export interface PingRequest {
  /** Arbitrary string echoed back by the main process. */
  payload: string;
}

/** Response payload for {@link IPC_CHANNELS.ping}. */
export interface PingResponse {
  /** The exact payload that was sent. */
  echo: string;
  /** Main-process clock (ms) at handling time. */
  receivedAtMs: number;
}
