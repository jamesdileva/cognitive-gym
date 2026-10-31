import type { JSX } from 'react';
import { useIngestion } from '../hooks/useIngestion';

export default function LibraryView(): JSX.Element {
  const { sources, running, progress, report, error, selectAndRun, remove } = useIngestion();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-sm text-zinc-500">
            Ingest personal books into local reading exercises (PDF · EPUB · TXT)
          </p>
        </div>
        <button
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={running}
          onClick={() => void selectAndRun()}
        >
          {running ? 'Ingesting…' : '+ Ingest a book'}
        </button>
      </header>

      {running && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
          {progress === null || progress.total === 0 ? (
            <p>Extracting text from the book…</p>
          ) : (
            <p>
              Distilling reading chunks with your local model — {progress.current}/{progress.total}
            </p>
          )}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{
                width:
                  progress && progress.total > 0
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : '8%'
              }}
            />
          </div>
          <p className="mt-2 text-xs text-amber-300/70">
            Local model inference takes a while per chunk — this can run for several minutes.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {report && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p className="font-medium text-zinc-200">
            {report.title} — {report.ingestedCount}/{report.chunkCount} chunks ingested
          </p>
          <p className="mt-1 text-zinc-500">
            {report.questionCount} comprehension questions stored.
            {report.failures.length > 0 &&
              ` ${report.failures.length} chunk(s) failed: ${report.failures
                .map((failure) => `#${failure.chunkIndex + 1} (${failure.reason})`)
                .join('; ')}`}
          </p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Ingested sources
        </h2>
        {sources.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nothing ingested yet. Chunks become Reading Room exercises with AI-graded
            comprehension questions.
          </p>
        )}
        {sources.map((source) => (
          <div
            key={source.sourceTitle}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div>
              <div className="font-medium text-zinc-200">{source.sourceTitle}</div>
              <div className="text-xs text-zinc-500">
                {source.chunkCount} chunks · {source.questionCount} questions ·{' '}
                {new Date(source.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button
              className="rounded border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
              onClick={() => void remove(source.sourceTitle)}
            >
              Delete
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
