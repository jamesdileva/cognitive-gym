import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { EpisodicIngestRequest } from '@shared/episodes-types';
import type { EpisodeSummary } from '@shared/episodes-types';
import { useReader } from '../hooks/useReader';

function ProgressBanner({ progress }: { progress: { stage: string; current: number; total: number } }): JSX.Element {
  const label =
    progress.stage === 'extracting'
      ? 'Extracting text…'
      : progress.stage === 'episodes'
        ? 'Shaping episodes with your local model'
        : 'Distilling comprehension questions';
  return (
    <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
      <p>
        {label} — {progress.current}/{progress.total || '…'}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className="h-full bg-amber-500 transition-all"
          style={{
            width:
              progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : '8%'
          }}
        />
      </div>
    </div>
  );
}

/** Revisit browser: every episode of a track, openable read-only. */
function EpisodeBrowser({
  bookTitle,
  onOpen
}: {
  bookTitle: string;
  onOpen: (episodeNumber: number) => void;
}): JSX.Element {
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.api.epList({ bookTitle }).then(({ episodes: list }) => {
      if (!cancelled) setEpisodes(list);
    });
    return () => {
      cancelled = true;
    };
  }, [bookTitle]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        All episodes
      </h2>
      {episodes.map((episode) => (
        <button
          key={episode.episodeNumber}
          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition hover:border-emerald-700"
          onClick={() => onOpen(episode.episodeNumber)}
        >
          <div className="font-medium text-zinc-200">{episode.episodeTitle}</div>
          <div className="text-xs text-zinc-500">episode {episode.episodeNumber}</div>
        </button>
      ))}
    </section>
  );
}

export default function ReaderView(): JSX.Element {
  const reader = useReader();
  const [isCanonical, setIsCanonical] = useState('true');
  const [limit, setLimit] = useState('');

  const pickAndIngest = async (): Promise<void> => {
    const { path } = await window.api.ingestSelectFile();
    const request: Omit<EpisodicIngestRequest, 'path'> & { path: string | null } = {
      path,
      isCanonical: isCanonical === 'true',
      maxEpisodes: limit.trim() === '' ? undefined : Math.max(1, Number.parseInt(limit, 10) || 1)
    };
    await reader.ingest(request);
  };

  if (reader.browse.length > 0 && reader.feed === null && reader.browseBook) {
    const bookTitle = reader.browseBook;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Episodes</h1>
          <button
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            onClick={reader.closeTrack}
          >
            ← Tracks
          </button>
        </header>
        <EpisodeBrowser bookTitle={bookTitle} onOpen={(n) => void reader.openTrack(bookTitle, n)} />
      </div>
    );
  }

  if (reader.feed) {
    const { feed } = reader;
    const finished = feed.episode === null && !feed.revisit;

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{feed.bookTitle}</h1>
            <p className="text-xs text-zinc-600">
              {feed.revisit ? 'Revisit (streak not affected)' : feed.isCanonical ? 'Serialized track' : 'Anthology track'}{' '}
              · episode {feed.position} of {feed.total}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
              onClick={() => void reader.openBrowse(feed.bookTitle)}
            >
              Episodes
            </button>
            <button
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
              onClick={reader.closeTrack}
            >
              ← Tracks
            </button>
          </div>
        </header>

        {finished ? (
          <>
            <section className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-10">
              <p className="text-lg font-medium text-emerald-400">Track complete 🎉</p>
              <p className="text-sm text-zinc-500">
                You can revisit any episode below — your streak stays where it finished.
              </p>
            </section>
            <EpisodeBrowser
              bookTitle={feed.bookTitle}
              onOpen={(n) => void reader.openTrack(feed.bookTitle, n)}
            />
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="flex flex-col gap-4 lg:col-span-2">
              {feed.episode?.recap && (
                <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm italic text-zinc-400">
                  {feed.isCanonical ? 'Previously: ' : 'Hook: '}
                  {feed.episode.recap}
                </p>
              )}
              <article className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
                <h2 className="mb-3 text-lg font-semibold text-zinc-200">
                  {feed.episode?.episodeTitle}
                </h2>
                <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-zinc-300">
                  {feed.episode?.text.split('\n\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </article>
              {!feed.revisit && (
                <button
                  className="self-start rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                  onClick={() => void reader.markRead()}
                >
                  Mark as read → next episode
                </button>
              )}
            </section>

            <aside className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Think about
              </h3>
              {reader.questions.length === 0 && (
                <p className="mt-2 text-sm text-zinc-500">
                  No questions were distilled for this episode.
                </p>
              )}
              <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm text-zinc-300">
                {reader.questions.map((question) => (
                  <li key={question.questionIndex}>{question.promptText}</li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-zinc-600">
                Answer these in the Reading Room — this passage and its questions are listed there.
              </p>
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Daily Read</h1>
        <p className="text-sm text-zinc-500">
          Books as episodic tracks — serialized novels play in order; anthologies shuffle
        </p>
      </header>

      {reader.running && reader.progress && <ProgressBanner progress={reader.progress} />}
      {reader.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {reader.error}
        </p>
      )}
      {reader.report && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p className="font-medium text-zinc-200">
            {reader.report.title} — {reader.report.ingestedCount}/{reader.report.chunkCount}{' '}
            episodes created
          </p>
          <p className="mt-1 text-zinc-500">
            {reader.report.questionCount} questions distilled.
            {reader.report.failures.length > 0 &&
              ` ${reader.report.failures.length} failed: ${reader.report.failures
                .map((f) => `#${f.chunkIndex + 1}`)
                .join(', ')}`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <select
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200"
          value={isCanonical}
          disabled={reader.running}
          onChange={(event) => setIsCanonical(event.target.value)}
        >
          <option value="true">Serialized (in order)</option>
          <option value="false">Anthology (shuffled)</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          episodes
          <input
            className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200"
            placeholder="all"
            value={limit}
            disabled={reader.running}
            onChange={(event) => setLimit(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button
          className="ml-auto rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={reader.running}
          onClick={() => void pickAndIngest()}
        >
          {reader.running ? 'Ingesting…' : '+ Create a track'}
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Your tracks</h2>
        {reader.tracks.length === 0 && (
          <p className="text-sm text-zinc-500">
            No tracks yet. Ingest a book above — a novel becomes a ~30-day serial.
          </p>
        )}
        {reader.tracks.map((track) => (
          <button
            key={track.bookTitle}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition hover:border-emerald-700"
            onClick={() => void reader.openTrack(track.bookTitle)}
          >
            <div>
              <div className="font-medium text-zinc-200">{track.bookTitle}</div>
              <div className="text-xs text-zinc-500">
                {track.isCanonical ? 'Serialized' : 'Anthology'} · {track.episodeCount} episodes ·
                last read{' '}
                {track.lastReadDate ? new Date(track.lastReadDate).toLocaleDateString() : 'never'}
              </div>
            </div>
            <div className="text-sm text-emerald-400">
              {track.currentEpisode > track.episodeCount
                ? 'complete'
                : `ep ${track.currentEpisode}/${track.episodeCount}`}
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
