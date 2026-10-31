import { useState } from 'react';
import type { JSX } from 'react';
import { useMathSession } from '../hooks/useMathSession';
import type { TranscriptEntry } from '../hooks/useMathSession';

function Transcript({ entries, thinking }: { entries: TranscriptEntry[]; thinking: boolean }): JSX.Element | null {
  if (entries.length === 0 && !thinking) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {entries.map((entry, index) => (
        <div
          key={index}
          className={
            entry.role === 'user'
              ? 'self-end max-w-[85%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200'
              : entry.role === 'hint'
                ? 'self-start max-w-[85%] rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100'
                : 'self-start max-w-[85%] rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200'
          }
        >
          {entry.text}
        </div>
      ))}
      {thinking && <div className="text-sm text-amber-400">Tutor is thinking…</div>}
    </div>
  );
}

export default function MathView(): JSX.Element {
  const session = useMathSession();
  const [answer, setAnswer] = useState('');
  const [hintDraft, setHintDraft] = useState('');

  if (!session.problem) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <header>
          <h1 className="text-2xl font-bold">Math Gym</h1>
          <p className="text-sm text-zinc-500">
            Infinite procedural practice · the tutor guides with questions, never answers
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {session.topics.map((topic) => (
            <button
              key={topic.templateId}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-emerald-700 hover:bg-zinc-900/80"
              onClick={() => void session.startProblem(topic.templateId)}
            >
              <div className="font-medium text-zinc-200">{topic.topic}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {topic.totalAttempts === 0
                  ? 'not attempted yet'
                  : `${topic.successfulAttempts}/${topic.totalAttempts} correct`}
              </div>
            </button>
          ))}
          {session.topics.length === 0 && (
            <p className="text-sm text-zinc-500">No math templates found in the content library.</p>
          )}
        </div>
      </div>
    );
  }

  const { problem } = session;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{problem.topic}</h1>
          <p className="font-mono text-xs text-zinc-600">
            {problem.templateId} · seed {problem.seed}
          </p>
        </div>
        <button
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          onClick={session.backToTopics}
        >
          ← Topics
        </button>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-center font-mono text-2xl text-zinc-100">{problem.display}</p>

        <div className="mt-5 flex gap-2">
          <input
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-emerald-700"
            placeholder="Your answer, e.g. x = 6"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void session.checkAnswer(answer);
            }}
          />
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={session.busy.checking || !answer.trim()}
            onClick={() => void session.checkAnswer(answer)}
          >
            Check
          </button>
        </div>

        {session.check && (
          <p className={session.check.correct ? 'mt-3 text-sm text-emerald-400' : 'mt-3 text-sm text-amber-400'}>
            {session.check.note}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <button
            className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={session.busy.hint}
            onClick={() => void session.askHint('I am stuck. What should I look at next?')}
          >
            {session.busy.hint ? 'Thinking…' : 'Get a hint'}
          </button>
          <button
            className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={session.busy.reveal}
            onClick={() => void session.reveal()}
          >
            {session.revealed ? 'Solution shown' : 'Show worked solution'}
          </button>
          <button
            className="ml-auto rounded bg-zinc-800 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700"
            onClick={() => {
              setAnswer('');
              void session.startProblem(problem.templateId);
            }}
          >
            Next problem →
          </button>
        </div>

        {session.revealed && (
          <div className="mt-4 rounded border border-zinc-700 bg-zinc-950 p-4">
            <p className="font-mono text-sm text-emerald-300">{session.revealed.answer}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
              {session.revealed.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        <Transcript entries={session.transcript} thinking={session.busy.hint} />

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const message = hintDraft;
            setHintDraft('');
            void session.askHint(message);
          }}
        >
          <input
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-700"
            placeholder="Ask the tutor about your reasoning… (hints only, no answers)"
            value={hintDraft}
            onChange={(event) => setHintDraft(event.target.value)}
          />
          <button
            type="submit"
            className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={session.busy.hint || !hintDraft.trim()}
          >
            Ask
          </button>
        </form>
      </section>
    </div>
  );
}
