import { useEffect, useState } from 'react';

export type BridgeStatus = 'checking' | 'ok' | 'error';

export interface PongState {
  status: BridgeStatus;
  detail: string;
}

/**
 * Verifies the typed IPC bridge with a round-trip ping. Status is 'ok' only when
 * the main process echoes the exact payload we sent.
 */
export function usePong(payload: string): PongState {
  const [status, setStatus] = useState<BridgeStatus>('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let cancelled = false;

    window.api
      .ping({ payload })
      .then((response) => {
        if (cancelled) return;
        const verified = response.echo === payload;
        setStatus(verified ? 'ok' : 'error');
        setDetail(verified ? `round-trip verified @ ${response.receivedAtMs}` : 'echo mismatch');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setDetail(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  return { status, detail };
}
