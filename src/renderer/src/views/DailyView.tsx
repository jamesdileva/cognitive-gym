import type { JSX } from 'react';
import type { DailyComponent } from '@shared/daily-types';
import { useDaily } from '../hooks/useDaily';

export type NavigableView = 'drill' | 'room' | 'srs';

const COMPONENT_TARGET: Record<string, NavigableView> = {
  'math-game': 'drill',
  reading: 'room',
  flashcards: 'srs'
};

const KIND_BADGE: Record<string, string> = {
  riddle: 'Riddle',
  lateral: 'Lateral thinking',
  philosophical: 'Philosophical judgment'
};

function ComponentRow({
  component,
  onNavigate
}: {
  component: DailyComponent;
  onNavigate: (view: NavigableView) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <span className={component.done ? 'text-emerald-400' : 'text-zinc-600'}>
            {component.done ? '✓' : '○'}
          </span>
          <span className={component.done ? 'font-medium text-zinc-500 line-through' : 'font-medium text-zinc-200'}>
            {component.label}
          </span>
        </div>
        <div className="ml-6 text-xs text-zinc-500">{component.hint}</div>
      </div>
      {!component.done && component.navigateTo && COMPONENT_TARGET[component.id] && (
        <button
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
          onClick={() => onNavigate(COMPONENT_TARGET[component.id])}
        >
          Go →
        </button>
      )}
    </div>
  );
}

export default function DailyView({
  onNavigate
}: {
  onNavigate: (view: NavigableView) => void;
}): JSX.Element {
  const daily = useDaily();

  if (!daily.overview) {
    return (
      <div className="mx-auto flex w-full max-w-2xl items-center justify-center p-12 text-sm text-zinc-500">
        Loading today's workout…
      </div>
    );
  }

  const { overview } = daily;
  const doneCount = overview.components.filter((c) => c.done).length;
  const teaserComponent = overview.components.find((c) => c.id === 'teaser');
  const teaserDone = teaserComponent?.done ?? false;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Daily Mix</h1>
        <p className="text-sm text-zinc-500">
          {overview.date} · {doneCount}/{overview.components.length} done
          {overview.complete && <span className="ml-2 text-emerald-400">— workout complete 🎉</span>}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        {overview.components.map((component) => (
          <ComponentRow key={component.id} component={component} onNavigate={onNavigate} />
        ))}
      </section>

      {overview.complete && (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          Today's workout is done. The streak clock is satisfied — see you tomorrow.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={teaserDone ? 'text-emerald-400' : 'text-zinc-600'}>
              {teaserDone ? '✓' : '○'}
            </span>
            <h2 className="font-medium text-zinc-200">
              {KIND_BADGE[overview.teaser.kind] ?? 'Teaser'}
            </h2>
          </div>
          {teaserDone && <span className="text-xs text-emerald-400">graded ✓</span>}
        </div>

        <p className="text-[15px] leading-relaxed text-zinc-300">{overview.teaser.prompt}</p>

        {!teaserDone && (
          <>
            <textarea
              className="min-h-24 rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-700"
              placeholder="Take a position, give the answer, show your reasoning — reasoning matters more than wording."
              value={daily.answer}
              onChange={(event) => daily.setAnswer(event.target.value)}
            />
            {daily.grade && (
              <div className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
                <p
                  className={`font-mono text-sm ${
                    daily.grade.score >= 70 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  graded: {daily.grade.score}/100
                </p>
                <p className="mt-1 text-sm text-zinc-300">{daily.grade.feedback}</p>
              </div>
            )}
            {daily.error && <p className="text-sm text-red-300">{daily.error}</p>}
            <button
              className="self-start rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={daily.grading || !daily.answer.trim()}
              onClick={() => void daily.submitTeaser()}
            >
              {daily.grading ? 'Grading with your local model…' : 'Submit for grading'}
            </button>
          </>
        )}
        {teaserDone && (
          <p className="text-xs text-zinc-600">
            Come back tomorrow for a different teaser.
          </p>
        )}
      </section>
    </div>
  );
}
