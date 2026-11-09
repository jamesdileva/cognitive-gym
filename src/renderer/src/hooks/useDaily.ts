import { useCallback, useEffect, useState } from 'react';
import type { DailyOverview, DailyTeaserGrade } from '@shared/daily-types';

/**
 * Daily Mix state: today's checklist (auto-verified from real activity),
 * the teaser of the day with inline semantic grading, and completion.
 */
export function useDaily() {
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [answer, setAnswer] = useState('');
  const [grade, setGrade] = useState<DailyTeaserGrade | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setOverview(await window.api.dailyToday());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitTeaser = useCallback(async (): Promise<void> => {
    if (grading || !answer.trim()) return;
    setGrading(true);
    setError(null);
    try {
      const outcome = await window.api.dailyGradeTeaser({ answer: answer.trim() });
      setGrade(outcome);
      setOverview(outcome.overview);
      setAnswer('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGrading(false);
    }
  }, [grading, answer]);

  return { overview, answer, setAnswer, grade, grading, error, refresh, submitTeaser };
}
