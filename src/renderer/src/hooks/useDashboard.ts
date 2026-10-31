import { useEffect, useState } from 'react';
import type { DashboardOverview } from '@shared/dashboard-types';

export type DashboardState = 'checking' | 'ready' | 'error';

/** Fetches the gamification overview for the Home dashboard. */
export function useDashboard(): {
  state: DashboardState;
  overview?: DashboardOverview;
  detail?: string;
} {
  const [state, setState] = useState<DashboardState>('checking');
  const [overview, setOverview] = useState<DashboardOverview | undefined>(undefined);
  const [detail, setDetail] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    window.api
      .dashOverview()
      .then((response) => {
        if (cancelled) return;
        setOverview(response);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('error');
        setDetail(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, overview, detail };
}
