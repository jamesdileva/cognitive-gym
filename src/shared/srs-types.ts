/** Flashcard review contract. Cards are drawn front-only (answers stay main-side). */

export interface DeckSummary {
  deckName: string;
  cardCount: number;
  /** Cards whose next_review_due has passed. */
  dueCount: number;
}

export interface SrsCard {
  id: number;
  deckName: string;
  front: string;
}

export interface SrsGradeResult {
  back: string;
  /** Leitner box after grading (1–5). */
  box: number;
  /** Days until the card comes due again. */
  nextDueDays: number;
}
