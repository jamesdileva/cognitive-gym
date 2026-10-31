import { useCallback, useEffect, useState } from 'react';
import type { DeckSummary, SrsCard, SrsGradeResult } from '@shared/srs-types';

/**
 * One flashcard review session: draw due cards, flip, self-grade, auto-advance.
 * The deck list refreshes after every grade so due counts stay live.
 */
export function useReviewSession() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deckName, setDeckName] = useState<string | null>(null);
  const [card, setCard] = useState<SrsCard | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [lastGrade, setLastGrade] = useState<SrsGradeResult | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const refreshDecks = useCallback(async (): Promise<void> => {
    const { decks: fresh } = await window.api.srsDecks();
    setDecks(fresh);
  }, []);

  useEffect(() => {
    void refreshDecks();
  }, [refreshDecks]);

  const drawNext = useCallback(async (deck: string): Promise<void> => {
    const { card: drawn } = await window.api.srsDraw({ deckName: deck });
    setCard(drawn);
    setBack(null);
  }, []);

  const startDeck = useCallback(
    async (deck: string): Promise<void> => {
      setDeckName(deck);
      setLastGrade(null);
      setReviewedCount(0);
      await drawNext(deck);
    },
    [drawNext]
  );

  const reveal = useCallback(async (): Promise<void> => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const { back: answer } = await window.api.srsReveal({ id: card.id });
      setBack(answer);
    } finally {
      setBusy(false);
    }
  }, [card, busy]);

  const grade = useCallback(
    async (correct: boolean): Promise<void> => {
      if (!card || !deckName || busy) return;
      setBusy(true);
      try {
        const outcome = await window.api.srsGrade({ id: card.id, correct });
        setLastGrade(outcome);
        setReviewedCount((count) => count + 1);
        await drawNext(deckName);
        await refreshDecks();
      } finally {
        setBusy(false);
      }
    },
    [card, deckName, busy, drawNext, refreshDecks]
  );

  const stopSession = useCallback((): void => {
    setDeckName(null);
    setCard(null);
    setBack(null);
    setLastGrade(null);
  }, []);

  return {
    decks,
    deckName,
    card,
    back,
    lastGrade,
    reviewedCount,
    busy,
    startDeck,
    reveal,
    grade,
    stopSession
  };
}
