import { useState } from 'react';
import type { JSX } from 'react';
import type { DiagnosticsKind, DiagnosticsSubmitResult } from '@shared/diagnostics-types';
import type { LogicPuzzleView } from '@shared/diagnostics-types';
import { useDiagnostics } from '../hooks/useDiagnostics';
import type { OpenItem } from '../hooks/useDiagnostics';

const ROOMS: { kind: DiagnosticsKind; label: string; blurb: string }[] = [
  {
    kind: 'coding',
    label: 'Coding',
    blurb: 'Read-only broken code — identify the defect; hints guide, never rewrite'
  },
  {
    kind: 'logic',
    label: 'Logic Grid',
    blurb: 'Deduction puzzles — fill the board; the tutor flags contradictions'
  },
  {
    kind: 'systems',
    label: 'Systems',
    blurb: 'Log traces — diagnose the failure and propose the fix'
  }
];

function isLogicPuzzle(item: OpenItem): item is LogicPuzzleView {
  return 'rowCategory' in item;
}

function ResultBanner({ result }: { result: DiagnosticsSubmitResult }): JSX.Element | null {
  if ('failure' in result) {
    return (
      <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
        Grading failed ({result.failure.kind}): {result.failure.message}
      </p>
    );
  }
  if (result.kind === 'logic') {
    return (
      <p className={result.correct ? 'text-sm text-emerald-400' : 'text-sm text-amber-400'}>
        {result.note}
      </p>
    );
  }
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className={`font-mono text-sm ${result.score >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
        graded: {result.score}/100 {result.score >= 70 ? '· passed' : '· not yet'}
      </p>
      <p className="mt-1 text-sm text-zinc-300">{result.feedback}</p>
    </div>
  );
}

function HintPanel({ hint }: { hint: { loading: boolean; hint?: string; error?: string } }): JSX.Element | null {
  if (hint.loading) return <p className="text-sm text-amber-400">Tutor is analyzing…</p>;
  if (hint.error) return <p className="text-sm text-red-300">{hint.error}</p>;
  if (!hint.hint) return null;
  return (
    <div className="rounded border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
      {hint.hint}
    </div>
  );
}

function ItemSession({ kind }: { kind: DiagnosticsKind }): JSX.Element {
  const diag = useDiagnostics(kind);
  const { item } = diag;
  if (!item) return <div />;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-200">{item.title}</h2>
        <button
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          onClick={diag.closeItem}
        >
          ← List
        </button>
      </header>

      {isLogicPuzzle(item) ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
            {item.clues.map((clue, index) => (
              <li key={index}>{clue}</li>
            ))}
          </ol>
          <div className="mt-4 flex flex-col gap-3">
            {item.categories[item.rowCategory].map((rowValue, rowIndex) => (
              <div key={rowValue} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-24 font-medium text-zinc-200">{rowValue}</span>
                {item.fillCategories.map((category) => (
                  <label key={category} className="flex items-center gap-1 text-xs text-zinc-500">
                    {category}:
                    <select
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                      value={diag.board[rowIndex]?.[category] ?? ''}
                      onChange={(event) => diag.setRowValue(rowIndex, category, event.target.value)}
                    >
                      <option value="">—</option>
                      {item.categories[category].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm text-zinc-400">{item.goal}</p>
          <pre className="mt-3 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
            {'code' in item ? item.code : item.logText}
          </pre>
          {'language' in item && (
            <p className="mt-2 text-right font-mono text-xs text-zinc-600">{item.language}</p>
          )}
        </section>
      )}

      {!isLogicPuzzle(item) && (
        <textarea
          className="min-h-24 rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-700"
          placeholder={
            kind === 'coding'
              ? 'What is the defect, where is it, and why does it break the goal?'
              : 'Diagnose the failure and propose your fix.'
          }
          value={diag.answer}
          onChange={(event) => diag.setAnswer(event.target.value)}
        />
      )}

      {diag.result && <ResultBanner result={diag.result} />}
      <HintPanel hint={diag.hint} />

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={diag.busy || !diag.canSubmit}
          onClick={() => void diag.submit()}
        >
          {diag.busy ? 'Working…' : kind === 'logic' ? 'Check board' : 'Submit for grading'}
        </button>
        <button
          className="rounded border border-zinc-700 px-4 py-2 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          disabled={diag.hint.loading}
          onClick={() => void diag.requestHint()}
        >
          {kind === 'coding' ? 'Request tutor analysis' : 'Ask for a contradiction alert'}
        </button>
      </div>
      <p className="text-xs text-zinc-600">
        Hints guide you toward the defect or contradiction — they never hand you the solution.
      </p>
    </div>
  );
}

export default function DiagnosticsView(): JSX.Element {
  const [kind, setKind] = useState<DiagnosticsKind>('coding');
  const diag = useDiagnostics(kind);

  const room = ROOMS.find((entry) => entry.kind === kind) as { kind: DiagnosticsKind; label: string; blurb: string };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Diagnostics</h1>
        <p className="text-sm text-zinc-500">
          Spot defects, deduce boards, and read failure traces — guided, never given
        </p>
      </header>

      <div className="flex gap-1">
        {ROOMS.map((entry) => (
          <button
            key={entry.kind}
            className={
              kind === entry.kind
                ? 'rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }
            onClick={() => setKind(entry.kind)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {diag.item ? (
        <ItemSession key={`${kind}-${diag.item.id}`} kind={kind} />
      ) : (
        <>
          <p className="text-sm text-zinc-500">{room.blurb}</p>
          <div className="flex flex-col gap-2">
            {diag.items.length === 0 && (
              <p className="text-sm text-zinc-500">No content in this room yet.</p>
            )}
            {diag.items.map((listItem) => (
              <button
                key={listItem.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-emerald-700"
                onClick={() => void diag.openItem(listItem.id)}
              >
                <div className="font-medium text-zinc-200">{listItem.title}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{listItem.detail}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
