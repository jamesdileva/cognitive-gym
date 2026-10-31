import { useState } from 'react';
import type { SynthesisReport } from '@shared/synthesis-types';
import type { JSX } from 'react';
import { useSynthesis } from '../hooks/useSynthesis';

function ReportCard({
  report,
  unit
}: {
  report: SynthesisReport;
  unit: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
      <p className="font-medium text-zinc-200">
        {report.generated}/{report.requested} {unit} generated
      </p>
      {unit === 'stories' && (
        <p className="mt-1 text-zinc-500">{report.questionCount} comprehension questions distilled.</p>
      )}
      {unit === 'stories' && (
        <p className="mt-1 text-xs text-zinc-600">
          Find them in the Reading Room (Synthetic Fiction). Math templates appear in Math Gym
          automatically on next launch — review them there before heavy use.
        </p>
      )}
      {report.failures.length > 0 && (
        <p className="mt-1 text-xs text-red-300">
          {report.failures.length} failed:{' '}
          {report.failures.map((f) => `#${f.chunkIndex + 1} (${f.reason.slice(0, 60)})`).join('; ')}
        </p>
      )}
    </div>
  );
}

function FactoryPanel({
  kind,
  label,
  blurb
}: {
  kind: 'stories' | 'math-templates';
  label: string;
  blurb: string;
}): JSX.Element {
  const synthesis = useSynthesis();
  const [count, setCount] = useState('3');
  const parsedCount = Math.max(1, Number.parseInt(count, 10) || 1);
  const running = synthesis.running !== null;
  const isRunning = synthesis.running === kind;
  const report = synthesis.reports[kind];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div>
        <h2 className="font-medium text-zinc-200">{label}</h2>
        <p className="text-sm text-zinc-500">{blurb}</p>
      </div>

      {running && isRunning && synthesis.progress && (
        <div className="rounded border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
          <p>
            {synthesis.stageLabel[kind]} — {synthesis.progress.current}/{synthesis.progress.total}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{
                width:
                  synthesis.progress.total > 0
                    ? `${Math.round((synthesis.progress.current / synthesis.progress.total) * 100)}%`
                    : '8%'
              }}
            />
          </div>
        </div>
      )}

      {report && <ReportCard report={report} unit={kind === 'stories' ? 'stories' : 'templates'} />}
      {synthesis.error && <p className="text-sm text-red-300">{synthesis.error}</p>}

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          count
          <input
            className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200"
            value={count}
            disabled={running}
            onChange={(event) => setCount(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button
          className="ml-auto rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={running || parsedCount < 1}
          onClick={() => void synthesis.run(kind, parsedCount)}
        >
          {isRunning ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

export default function GeneratorView(): JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Generator</h1>
        <p className="text-sm text-zinc-500">
          Zero-source synthesis (blueprint.md §1) — local-model content, schema-validated, retries
          bounded
        </p>
      </header>

      <FactoryPanel
        kind="stories"
        label="Short Story Architect"
        blurb="Hard sci-fi, exactly 4 paragraphs, one core dilemma — plus 3 analytical questions with hidden solution vectors."
      />
      <FactoryPanel
        kind="math-templates"
        label="Math Template Architect"
        blurb="New parameterized problem templates (K-12 → Calc 2). Structurally validated with a dry-run instantiation — mathematical correctness is yours to review."
      />
    </div>
  );
}
