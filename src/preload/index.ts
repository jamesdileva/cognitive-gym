import { contextBridge, ipcRenderer } from 'electron';
import type { GymApi } from '@shared/api-contract';
import { IPC_CHANNELS, type PingRequest } from '@shared/ipc-types';

/**
 * Bridges the sandboxed renderer to typed main-process handlers.
 * The `GymApi` annotation makes a contract mismatch a compile error here.
 */
const api: GymApi = {
  ping: (request: PingRequest) => ipcRenderer.invoke(IPC_CHANNELS.ping, request),
  dbStatus: () => ipcRenderer.invoke(IPC_CHANNELS.dbStatus)
};

contextBridge.exposeInMainWorld('api', api);
