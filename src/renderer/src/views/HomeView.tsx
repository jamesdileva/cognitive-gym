import { useState } from 'react';
import type { JSX } from 'react';
import { useDbStatus } from '../hooks/useDbStatus';
import type { DbState } from '../hooks/useDbStatus';
import type { BridgeStatus } from '../hooks/usePong';
import { usePong } from '../hooks/usePong';

const statusStyles: Record<BridgeStatus | DbState, string> = {
  checking: 'text-amber-400',
  ok: 'text-emerald-400',
  ready: 'text-emerald-400',
  error: 'text-red-400'
};

function StatusBadge({ label, status, detail }: { label: string; status: string; detail?: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-sm">
      <span className="text-zinc-500">{label}:</span>{' '}
      <span className={statusStyles[status as BridgeStatus | DbState]}>{status}</span>
      {detail && <span className="ml-2 text-zinc-600">({detail})</span>}
    </div>
  );
}

export default function HomeView(): JSX.Element {
  // Stable per-mount payload so the effect does not re-fire on every render.
  const [payload] = useState(() => `ping-${Date.now()}`);
  const ping = usePong(payload);
  const db = useDbStatus();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-100">
      <h1 className="text-4xl font-bold tracking-tight">Cognitive Gym</h1>
      <p className="text-zinc-400">Local-first AI tutoring · sprint 1 shell</p>
      <div className="flex gap-3">
        <StatusBadge label="IPC bridge" status={ping.status} detail={ping.detail} />
        <StatusBadge
          label="Database"
          status={db.state}
          detail={
            db.state === 'ready'
              ? `schema v${db.migrationVersion}, ${db.totalRows} rows`
              : db.detail
          }
        />
      </div>
    </main>
  );
}
