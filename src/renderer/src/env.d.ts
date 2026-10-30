import type { GymApi } from '@shared/api-contract';

declare global {
  interface Window {
    /** Typed bridge exposed by the preload script (see src/shared/api-contract.ts). */
    api: GymApi;
  }
}

export {};
