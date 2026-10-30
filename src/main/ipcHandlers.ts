import type { IpcMain } from 'electron';
import {
  IPC_CHANNELS,
  type DbStatusResponse,
  type PingRequest,
  type PingResponse
} from '@shared/ipc-types';

/**
 * Pure handler logic, kept free of runtime Electron imports (type-only) so the
 * test suite can exercise it without launching Electron.
 */

export function handlePing(request: PingRequest, nowMs: number = Date.now()): PingResponse {
  return { echo: request.payload, receivedAtMs: nowMs };
}

/** Services handlers delegate to; composed with real implementations in main/index.ts. */
export interface IpcServices {
  dbStatus(): DbStatusResponse;
}

/** Registers every IPC handler on the real `ipcMain`. Called once at app start. */
export function registerIpcHandlers(ipcMain: Pick<IpcMain, 'handle'>, services: IpcServices): void {
  ipcMain.handle(IPC_CHANNELS.ping, (_event, request: PingRequest): PingResponse =>
    handlePing(request)
  );
  ipcMain.handle(IPC_CHANNELS.dbStatus, (): DbStatusResponse => services.dbStatus());
}
