import { useState } from 'react';
import type { JSX } from 'react';
import type { ActivityDay, DashboardOverview, ModuleStat } from '@shared/dashboard-types';
import { useDbStatus } from '../hooks/useDbStatus';
import { usePong } from '../hooks/usePong';
import { useDashboard } from '../hooks/useDashboard';

function statusClass(status: string): string {
  if (status === 'ok' || status === 'ready') return 'text-emerald-400';
  if (status === 'checking') return 'text-amber-400';
  return 'text-red-400';
}

/** 30-day activity chart: one bar per UTC day, colored by success ratio. */
function ActivityChart({ activity }: { activity: ActivityDay[] }): JSX.Element {
  const maxAttempts = Math.max(1, ...activity.map((day) => day.attempts));
  const barWidth = 16;
  const gap = 5;
  const height = 140;

  return (
    <svg
      viewBox={`0 0 ${activity.length * (barWidth + gap) + gap} ${height + 24}`}
      className="w-full"
      role="img"
      aria-label="Attempts per day over the last 30 days"
    >
      {activity.map((day, index) => {
        const barHeight =
          day.attempts === 0
            ? 3
            : Math.max(6, Math.round((day.attempts / maxAttempts) * (height - 20)));
        const ratio = day.attempts === 0 ? 0 : day.successful / day.attempts;
        const color =
          day.attempts === 0
            ? '#3f3f46'
            : ratio >= 0.7
              ? '#34d399'
              : ratio >= 0.4
                ? '#fbbf24'
                : '#f87171';
        const x = gap + index * (barWidth + gap);
        return (
          <g key={day.date}>
            <title>{`${day.date}: ${day.attempts} attempts, ${day.successful} successful`}</title>
            <rect x={x} y={height - barHeight} width={barWidth} height={barHeight} rx={3} fill={color} />
            {(index === 0 || index === activity.length - 1 || index === Math.floor(activity.length / 2)) && (
              <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" fontSize="10" fill="#71717a">
                {day.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ModuleBars({ modules }: { modules: ModuleStat[] }): JSX.Element {
  if (modules.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No attempts yet — finish a Math problem, grade a Reading answer, or solve a Diagnostics case.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {modules.map((module) => {
        const ratio = module.attempts === 0 ? 0 : module.successful / module.attempts;
        const pct = Math.round(ratio * 100);
        const color = ratio >= 0.7 ? 'bg-emerald-500' : ratio >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div key={module.module}>
            <div className="flex justify-between text-xs text-zinc-400">
              <span className="capitalize">{module.module}</span>
              <span className="font-mono">
                {module.successful}/{module.attempts} correct · {module.items} items
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-zinc-800">
              <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  value,
  label,
  accent
}: {
  value: string | number;
  label: string;
  accent?: string;
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <span className={`text-3xl font-bold ${accent ?? 'text-zinc-100'}`}>{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

export default function HomeView(): JSX.Element {
  // Stable per-mount payload so the effect does not re-fire on every render.
  const [payload] = useState(() => `ping-${Date.now()}`);
  const ping = usePong(payload);
  const db = useDbStatus();
  const dashboard = useDashboard();

  const overview: DashboardOverview | undefined = dashboard.overview;
  const totalAttempts = overview?.modules.reduce((sum, m) => sum + m.attempts, 0) ?? 0;
  const totalSuccessful = overview?.modules.reduce((sum, m) => sum + m.successful, 0) ?? 0;
  const successPct = totalAttempts === 0 ? 0 : Math.round((totalSuccessful / totalAttempts) * 100);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Cognitive Gym</h1>
        <p className="text-zinc-400">Local-first AI tutoring</p>
      </header>

      {dashboard.state === 'ready' && overview && (
        <>
          <div className="flex gap-3">
            <StatCard
              value={overview.dailyStreak}
              label={overview.dailyStreak === 1 ? 'day streak' : 'day streaks'}
              accent={overview.dailyStreak >= 3 ? 'text-amber-400' : 'text-zinc-100'}
            />
            <StatCard value={overview.dueCards} label="cards due" />
            <StatCard value={totalAttempts} label="total attempts" />
            <StatCard value={`${successPct}%`} label="success rate" />
          </div>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Last 30 days
            </h2>
            <ActivityChart activity={overview.activity} />
            <p className="mt-2 text-xs text-zinc-600">
              Bar height = attempts that day · green ≥70% correct, amber ≥40%, red below.
            </p>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Module mastery
            </h2>
            <ModuleBars modules={overview.modules} />
          </section>
        </>
      )}
      {dashboard.state === 'error' && (
        <p className="text-sm text-red-400">Dashboard unavailable: {dashboard.detail}</p>
      )}

      <div className="mt-4 flex justify-center gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-sm">
          <span className="text-zinc-500">IPC bridge:</span>{' '}
          <span className={statusClass(ping.status)}>{ping.status}</span>
          {ping.detail && <span className="ml-2 text-zinc-600">({ping.detail})</span>}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-sm">
          <span className="text-zinc-500">Database:</span>{' '}
          <span className={statusClass(db.state)}>{db.state}</span>
          {db.state === 'ready' && (
            <span className="ml-2 text-zinc-600">
              (schema v{db.migrationVersion}, {db.totalRows} rows)
            </span>
          )}
          {db.detail && <span className="ml-2 text-zinc-600">({db.detail})</span>}
        </div>
      </div>
    </div>
  );
}
