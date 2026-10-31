import { useCallback, useEffect, useState } from 'react';
import type { MathCheckResponse, MathProblem, MathRevealResponse, MathTopicSummary } from '@shared/math-types';

export interface TranscriptEntry {
  role: 'user' | 'hint' | 'system';
  text: string;
}

interface BusyState {
  checking: boolean;
  hint: boolean;
  reveal: boolean;
}

const IDLE_BUSY: BusyState = { checking: false, hint: false, reveal: false };

/**
 * One math practice session: topic → problem → check → Socratic hints → reveal.
 * Progress summaries are refreshed after each graded attempt.
 */
export function useMathSession() {
  const [topics, setTopics] = useState<MathTopicSummary[]>([]);
  const [problem, setProblem] = useState<MathProblem | null>(null);
  const [check, setCheck] = useState<MathCheckResponse | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [revealed, setRevealed] = useState<MathRevealResponse | null>(null);
  const [busy, setBusy] = useState<BusyState>(IDLE_BUSY);

  const refreshTopics = useCallback(async (): Promise<void> => {
    const { topics: fresh } = await window.api.mathTopics();
    setTopics(fresh);
  }, []);

  useEffect(() => {
    void refreshTopics();
  }, [refreshTopics]);

  const startProblem = useCallback(
    async (templateId: string): Promise<void> => {
      const { problem: fresh } = await window.api.mathNewProblem({ templateId });
      setProblem(fresh);
      setCheck(null);
      setRevealed(null);
      setTranscript([]);
      setBusy(IDLE_BUSY);
    },
    []
  );

  const checkAnswer = useCallback(
    async (answer: string): Promise<void> => {
      if (!problem || busy.checking) return;
      setBusy((prev) => ({ ...prev, checking: true }));
      try {
        const outcome = await window.api.mathCheckAnswer({ problem, answer });
        setCheck(outcome);
        await refreshTopics();
      } finally {
        setBusy((prev) => ({ ...prev, checking: false }));
      }
    },
    [problem, busy.checking, refreshTopics]
  );

  const askHint = useCallback(
    async (message: string): Promise<void> => {
      if (!problem || busy.hint || !message.trim()) return;
      setBusy((prev) => ({ ...prev, hint: true }));
      setTranscript((prev) => [...prev, { role: 'user', text: message }]);
      try {
        const outcome = await window.api.mathHint({ problem, userMessage: message });
        setTranscript((prev) => [
          ...prev,
          outcome.ok
            ? { role: 'hint', text: outcome.hint }
            : { role: 'system', text: `Tutor unavailable (${outcome.failure.kind}): ${outcome.failure.message}` }
        ]);
      } finally {
        setBusy((prev) => ({ ...prev, hint: false }));
      }
    },
    [problem, busy.hint]
  );

  const reveal = useCallback(async (): Promise<void> => {
    if (!problem || busy.reveal) return;
    setBusy((prev) => ({ ...prev, reveal: true }));
    try {
      setRevealed(await window.api.mathReveal({ problem }));
    } finally {
      setBusy((prev) => ({ ...prev, reveal: false }));
    }
  }, [problem, busy.reveal]);

  const backToTopics = useCallback((): void => {
    setProblem(null);
    setCheck(null);
    setRevealed(null);
    setTranscript([]);
  }, []);

  return {
    topics,
    problem,
    check,
    transcript,
    revealed,
    busy,
    startProblem,
    checkAnswer,
    askHint,
    reveal,
    backToTopics
  };
}
