import { useCallback, useEffect, useState } from 'react';
import type { ReadingPassageSummary, ReadingSession } from '@shared/reading-types';

export interface QuestionGrade {
  questionIndex: number;
  score: number;
  feedback: string;
}

/**
 * One Reading Room session: passage list → open passage → answer each
 * interpretive question → AI semantic grade against hidden criteria.
 */
export function useReadingSession() {
  const [passages, setPassages] = useState<ReadingPassageSummary[]>([]);
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [grades, setGrades] = useState<Record<number, QuestionGrade>>({});
  const [grading, setGrading] = useState<number | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const { passages: fresh } = await window.api.readPassages();
    setPassages(fresh);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openPassage = useCallback(async (uuid: string): Promise<void> => {
    const { session: fresh } = await window.api.readStart({ uuid });
    setSession(fresh);
    setAnswers({});
    setGrades({});
  }, []);

  const setAnswer = useCallback((questionIndex: number, answer: string): void => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  }, []);

  const submit = useCallback(
    async (questionIndex: number): Promise<void> => {
      if (!session || grading !== null) return;
      const answer = answers[questionIndex]?.trim();
      if (!answer) return;

      setGrading(questionIndex);
      try {
        const outcome = await window.api.readSubmit({
          uuid: session.uuid,
          questionIndex,
          answer
        });
        if (outcome.ok) {
          setGrades((prev) => ({
            ...prev,
            [questionIndex]: { questionIndex, score: outcome.score, feedback: outcome.feedback }
          }));
          await refresh();
        } else {
          setGrades((prev) => ({
            ...prev,
            [questionIndex]: {
              questionIndex,
              score: -1,
              feedback: `Grading failed (${outcome.failure.kind}): ${outcome.failure.message}`
            }
          }));
        }
      } finally {
        setGrading(null);
      }
    },
    [session, grading, answers, refresh]
  );

  const closeSession = useCallback((): void => {
    setSession(null);
    setAnswers({});
    setGrades({});
  }, []);

  return {
    passages,
    session,
    answers,
    grades,
    grading,
    openPassage,
    setAnswer,
    submit,
    closeSession
  };
}
