import type { DbStatusResponse, PingRequest, PingResponse } from './ipc-types';

/**
 * The complete surface the preload script exposes to the renderer as `window.api`.
 * Preload implements this interface and the renderer consumes it, so a channel
 * added on one side without the other fails typecheck.
 */
export interface GymApi {
  ping(request: PingRequest): Promise<PingResponse>;
  dbStatus(): Promise<DbStatusResponse>;
}
