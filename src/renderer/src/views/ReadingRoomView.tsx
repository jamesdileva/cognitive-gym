import type { JSX } from 'react';
import { useReadingSession } from '../hooks/useReadingSession';
import type { QuestionGrade } from '../hooks/useReadingSession';

function scoreStyle(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function GradeCard({ grade }: { grade: QuestionGrade }): JSX.Element {
  if (grade.score < 0) {
    return (
      <p className="mt-2 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
        {grade.feedback}
      </p>
    );
  }
  return (
    <div className="mt-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className={`font-mono text-sm ${scoreStyle(grade.score)}`}>
        graded: {grade.score}/100 {grade.score >= 70 ? '· passed' : '· not yet'}
      </p>
      <p className="mt-1 text-sm text-zinc-300">{grade.feedback}</p>
    </div>
  );
}

export default function ReadingRoomView(): JSX.Element {
  const reading = useReadingSession();

  if (reading.session) {
    const { session } = reading;
    const gradedCount = Object.keys(reading.grades).length;

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{session.sourceTitle}</h1>
            <p className="text-xs text-zinc-600">
              {session.subTopic ?? 'Reading'} · {session.module} · graded {gradedCount}/
              {session.questions.length}
            </p>
          </div>
          <button
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            onClick={reading.closeSession}
          >
            ← Passages
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-zinc-300">
              {session.text.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </article>

          <section className="flex flex-col gap-4">
            {session.questions.map((question) => {
              const grade = reading.grades[question.questionIndex];
              return (
                <div
                  key={question.questionIndex}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <p className="text-sm font-medium text-zinc-200">{question.promptText}</p>
                  <textarea
                    className="mt-2 min-h-20 w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-700"
                    placeholder="Write your interpretation — reasoning matters more than wording."
                    value={reading.answers[question.questionIndex] ?? ''}
                    onChange={(event) => reading.setAnswer(question.questionIndex, event.target.value)}
                  />
                  {grade && <GradeCard grade={grade} />}
                  {!grade && (
                    <button
                      className="mt-2 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      disabled={
                        reading.grading !== null ||
                        !reading.answers[question.questionIndex]?.trim()
                      }
                      onClick={() => void reading.submit(question.questionIndex)}
                    >
                      {reading.grading === question.questionIndex
                        ? 'Grading with your local model…'
                        : 'Submit for grading'}
                    </button>
                  )}
                </div>
              );
            })}
            {gradedCount === session.questions.length && gradedCount > 0 && (
              <p className="text-sm text-emerald-400">
                Session complete — every question graded and recorded to your progress.
              </p>
            )}
            <p className="text-xs text-zinc-600">
              The grader scores reasoning against hidden criteria and answers with hints only — it
              will not hand you the model answer.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Reading Room</h1>
        <p className="text-sm text-zinc-500">
          Interpretive questions over ingested and synthetic passages — free-text answers, semantic
          grading
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {reading.passages.length === 0 && (
          <p className="text-sm text-zinc-500">
            No passages yet. Ingest a book in the Library, create an episode track in Daily Read, or
            start from the bundled synthetic demos on next dev launch.
          </p>
        )}
        {reading.passages.map((passage) => (
          <button
            key={passage.uuid}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-emerald-700"
            onClick={() => void reading.openPassage(passage.uuid)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-zinc-200">{passage.sourceTitle}</div>
              <div className="text-xs text-zinc-500">
                {passage.module} · {passage.questionCount} questions · {passage.wordCount} words
              </div>
            </div>
            {passage.subTopic && (
              <div className="mt-0.5 text-xs text-emerald-500/80">{passage.subTopic}</div>
            )}
            <div className="mt-1 text-sm text-zinc-500">{passage.excerpt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
