import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrillQuestion, DrillStats } from '@shared/drill-types';
import { nextQuestion } from '@shared/drill/generator';

/** Time budget rules (user-directed): 10s start, −1s per correct, 2s floor. */
export const START_BUDGET_MS = 10_000;
export const CORRECT_BONUS_MS = -1_000;
export const FLOOR_MS = 2_000;

const TICK_MS = 50;

type Phase = 'idle' | 'running' | 'over';

interface RunState {
  question: DrillQuestion;
  answer: string;
  /** Current budget for THIS question, ms. */
  budgetMs: number;
  /** ms remaining on the current question's clock. */
  remainingMs: number;
  score: number;
  minBudgetS: number;
}

/**
 * Speed Drill state machine: idle → running (per-question countdown, −1s per
 * correct, 2s floor) → over (on wrong answer or timeout). Timing is
 * deadline-based (not accumulated ticks) so background throttling can't cheat.
 */
export function useSpeedDrill() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [run, setRun] = useState<RunState | null>(null);
  const [lastRun, setLastRun] = useState<{ score: number; newBest: boolean } | null>(null);
  const [stats, setStats] = useState<DrillStats | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshStats = useCallback(async (): Promise<void> => {
    setStats(await window.api.drillBest());
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const deadlineRef = useRef<number>(0);
  const runRef = useRef<RunState | null>(null);
  runRef.current = run;

  const endRun = useCallback(
    async (finalScore: number, minBudgetS: number): Promise<void> => {
      setPhase('over');
      setRun(null);
      const fresh = await window.api.drillSubmitRun({ score: finalScore, minBudgetS });
      const previous = stats?.bestScore ?? 0;
      setLastRun({ score: finalScore, newBest: finalScore > previous });
      setStats(fresh);
    },
    [stats?.bestScore]
  );

  const startRun = useCallback((): void => {
    const question = nextQuestion(0, Math.random);
    deadlineRef.current = Date.now() + START_BUDGET_MS;
    setRun({
      question,
      answer: '',
      budgetMs: START_BUDGET_MS,
      remainingMs: START_BUDGET_MS,
      score: 0,
      minBudgetS: START_BUDGET_MS / 1000
    });
    setLastRun(null);
    setPhase('running');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Ticker: drives the countdown and the timeout transition.
  useEffect(() => {
    if (phase !== 'running') return;
    const interval = setInterval(() => {
      const current = runRef.current;
      if (!current) return;
      const remaining = Math.max(0, deadlineRef.current - Date.now());
      if (remaining === 0) {
        void endRun(current.score, current.minBudgetS);
        return;
      }
      setRun({ ...current, remainingMs: remaining });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [phase, endRun]);

  const answerCorrect = useCallback(
    (current: RunState): RunState => {
      const budgetMs = Math.max(FLOOR_MS, current.budgetMs + CORRECT_BONUS_MS);
      const score = current.score + 1;
      const question = nextQuestion(score, Math.random);
      deadlineRef.current = Date.now() + budgetMs;
      return {
        question,
        answer: '',
        budgetMs,
        remainingMs: budgetMs,
        score,
        minBudgetS: Math.min(current.minBudgetS, Math.round(budgetMs / 1000))
      };
    },
    []
  );

  const submitAnswer = useCallback(async (): Promise<void> => {
    const current = runRef.current;
    if (!current || phase !== 'running') return;
    const parsed = Number.parseInt(current.answer.trim(), 10);
    if (current.answer.trim() === '' || Number.isNaN(parsed)) return;

    if (parsed === current.question.answer) {
      const next = answerCorrect(current);
      setRun(next);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      await endRun(current.score, current.minBudgetS);
    }
  }, [phase, answerCorrect, endRun]);

  const setAnswer = useCallback((value: string): void => {
    setRun((prev) => (prev ? { ...prev, answer: value.replace(/[^\d-]/g, '') } : prev));
  }, []);

  return {
    phase,
    run,
    lastRun,
    stats,
    inputRef,
    startRun,
    submitAnswer,
    setAnswer,
    refreshStats
  };
}
