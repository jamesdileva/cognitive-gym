import type { JSX } from 'react';
import { useReviewSession } from '../hooks/useReviewSession';

export default function FlashcardsView(): JSX.Element {
  const session = useReviewSession();

  if (!session.deckName) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <header>
          <h1 className="text-2xl font-bold">Flashcards</h1>
          <p className="text-sm text-zinc-500">
            Leitner spaced repetition · flip, self-grade, and the schedule does the rest
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {session.decks.map((deck) => (
            <button
              key={deck.deckName}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-emerald-700 hover:bg-zinc-900/80"
              onClick={() => void session.startDeck(deck.deckName)}
            >
              <div className="font-medium text-zinc-200">{deck.deckName}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {deck.cardCount} cards ·{' '}
                <span className={deck.dueCount > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                  {deck.dueCount} due now
                </span>
              </div>
            </button>
          ))}
          {session.decks.length === 0 && (
            <p className="text-sm text-zinc-500">No decks found in the content library.</p>
          )}
        </div>
      </div>
    );
  }

  const { card, back } = session;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{session.deckName}</h1>
          <p className="text-xs text-zinc-600">reviewed this session: {session.reviewedCount}</p>
        </div>
        <button
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          onClick={session.stopSession}
        >
          ← Decks
        </button>
      </header>

      {session.lastGrade && (
        <p className="font-mono text-xs text-zinc-500">
          last card → box {session.lastGrade.box}, due in {session.lastGrade.nextDueDays}d
        </p>
      )}

      {card ? (
        <section className="flex min-h-64 flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-center font-mono text-2xl text-zinc-100">{card.front}</p>

          {back === null ? (
            <button
              className="mx-auto mt-8 rounded bg-zinc-800 px-5 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              disabled={session.busy}
              onClick={() => void session.reveal()}
            >
              Show answer
            </button>
          ) : (
            <>
              <p className="mt-6 border-t border-zinc-800 pt-6 text-center text-lg text-emerald-300">
                {back}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  className="rounded border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  disabled={session.busy}
                  onClick={() => void session.grade(false)}
                >
                  I was wrong
                </button>
                <button
                  className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  disabled={session.busy}
                  onClick={() => void session.grade(true)}
                >
                  I was right
                </button>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-10">
          <p className="text-lg font-medium text-emerald-400">Deck complete for today 🎉</p>
          <p className="text-sm text-zinc-500">
            {session.reviewedCount === 0
              ? 'Nothing was due in this deck — come back tomorrow.'
              : `${session.reviewedCount} card${session.reviewedCount === 1 ? '' : 's'} scheduled for future review.`}
          </p>
          <button
            className="rounded border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={session.stopSession}
          >
            Back to decks
          </button>
        </section>
      )}
    </div>
  );
}
