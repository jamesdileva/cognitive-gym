import type { JSX } from 'react';
import { useSpeedDrill } from '../hooks/useSpeedDrill';
import { FLOOR_MS, START_BUDGET_MS } from '../hooks/useSpeedDrill';

function TimerBar({ remainingMs, budgetMs }: { remainingMs: number; budgetMs: number }): JSX.Element {
  const ratio = remainingMs / budgetMs;
  const color = ratio > 0.5 ? 'bg-emerald-500' : ratio > 0.25 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
      <div
        className={`h-full ${color} transition-[width] duration-75 ease-linear`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

export default function SpeedDrillView(): JSX.Element {
  const drill = useSpeedDrill();
  const { run, stats } = drill;

  if (drill.phase === 'running' && run) {
    const seconds = (run.remainingMs / 1000).toFixed(1);
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <header className="flex items-center justify-between text-sm text-zinc-400">
          <span className="font-mono">score {run.score}</span>
          <span className="font-mono text-2xl text-zinc-100">{seconds}s</span>
        </header>

        <TimerBar remainingMs={run.remainingMs} budgetMs={run.budgetMs} />

        <section className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-8">
          <p className="text-center font-mono text-4xl text-zinc-100">{run.question.prompt}</p>
          <input
            ref={drill.inputRef}
            className="mt-8 w-48 rounded border border-zinc-700 bg-zinc-950 px-4 py-3 text-center font-mono text-2xl text-zinc-100 outline-none focus:border-emerald-700"
            inputMode="numeric"
            autoFocus
            value={run.answer}
            onChange={(event) => drill.setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void drill.submitAnswer();
            }}
          />
        </section>

        <p className="text-center text-xs text-zinc-600">
          correct → −1s (floor {FLOOR_MS / 1000}s) · wrong or timeout → run over
        </p>
      </div>
    );
  }

  if (drill.phase === 'over') {
    const isNewBest = drill.lastRun?.newBest ?? false;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <section className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-10">
          <p className="text-5xl font-bold text-zinc-100">{drill.lastRun?.score ?? 0}</p>
          <p className="text-sm text-zinc-500">correct answers</p>
          {isNewBest && <p className="text-sm font-medium text-amber-400">🏆 New personal best!</p>}
          <p className="text-xs text-zinc-600">
            best: {stats?.bestScore ?? 0} · runs: {stats?.totalRuns ?? 0}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              className="rounded bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              onClick={drill.startRun}
            >
              Run again
            </button>
            <button
              className="rounded border border-zinc-700 px-5 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              onClick={() => void drill.refreshStats()}
            >
              Refresh stats
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Speed Drill</h1>
        <p className="text-sm text-zinc-500">
          Mental math under pressure — {START_BUDGET_MS / 1000}s per question, −1s per correct,
          floor {FLOOR_MS / 1000}s. One miss ends the run.
        </p>
      </header>

      <section className="flex flex-col items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        <div className="flex gap-3 text-center">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-6 py-3">
            <p className="text-3xl font-bold text-amber-400">{stats?.bestScore ?? 0}</p>
            <p className="text-xs text-zinc-500">best score</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-6 py-3">
            <p className="text-3xl font-bold text-zinc-100">{stats?.totalRuns ?? 0}</p>
            <p className="text-xs text-zinc-500">runs</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-6 py-3">
            <p className="text-3xl font-bold text-zinc-100">{stats?.bestMinBudgetS ?? '—'}</p>
            <p className="text-xs text-zinc-500">fastest budget (s)</p>
          </div>
        </div>
        <button
          className="rounded bg-emerald-600 px-8 py-3 text-lg font-medium text-white hover:bg-emerald-500"
          onClick={drill.startRun}
        >
          Start run
        </button>
        <p className="text-xs text-zinc-600">
          Difficulty ramps every few answers: +/− → × tables → mixed two-digit.
        </p>
      </section>
    </div>
  );
}
