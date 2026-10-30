import { useEffect, useState } from 'react';
import type { DbStatusResponse } from '@shared/ipc-types';

export type DbState = 'checking' | 'ready' | 'error';

export interface DbStatusState {
  state: DbState;
  migrationVersion?: number;
  totalRows?: number;
  detail?: string;
}

/** Fetches the database health snapshot exposed by the main process. */
export function useDbStatus(): DbStatusState {
  const [status, setStatus] = useState<DbStatusState>({ state: 'checking' });

  useEffect(() => {
    let cancelled = false;

    window.api
      .dbStatus()
      .then((response: DbStatusResponse) => {
        if (cancelled) return;
        setStatus({
          state: 'ready',
          migrationVersion: response.migrationVersion,
          totalRows: response.totalRows
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          state: 'error',
          detail: error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
