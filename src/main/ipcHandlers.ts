import type { IpcMain } from 'electron';
import { IPC_CHANNELS, type PingRequest, type PingResponse } from '@shared/ipc-types';

/**
 * Pure handler logic, kept free of runtime Electron imports (type-only) so the
 * test suite can exercise it without launching Electron.
 */

export function handlePing(request: PingRequest, nowMs: number = Date.now()): PingResponse {
  return { echo: request.payload, receivedAtMs: nowMs };
}

/** Registers every IPC handler on the real `ipcMain`. Called once at app start. */
export function registerIpcHandlers(ipcMain: Pick<IpcMain, 'handle'>): void {
  ipcMain.handle(IPC_CHANNELS.ping, (_event, request: PingRequest): PingResponse =>
    handlePing(request)
  );
}
