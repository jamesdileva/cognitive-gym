import type { DeckSummary, SrsGradeResult, SrsCard } from '@shared/srs-types';
import type { FlashcardsRepo } from '../db/repositories/flashcardsRepo';
import { BOX_INTERVAL_DAYS, review } from './leitner';

export interface ReviewServiceDeps {
  cards: FlashcardsRepo;
}

/**
 * Flashcard review sessions over the Leitner scheduler. Same boundary rule as
 * the math module: a drawn card exposes only its front — the back answer is
 * revealed or graded through dedicated calls, never shipped in the queue.
 */
export function createReviewService(deps: ReviewServiceDeps) {
  return {
    listDecks(): DeckSummary[] {
      return deps.cards.listDecks().map((deck) => ({
        deckName: deck.deck_name,
        cardCount: deck.card_count,
        dueCount: deps.cards.dueCount(deck.deck_name)
      }));
    },

    /** Next due card in the deck, oldest due first. Null when the deck is done. */
    drawCard(deckName: string): SrsCard | null {
      const card = deps.cards.drawDueCard(deckName);
      if (!card) return null;
      return { id: card.id, deckName: card.deck_name, front: card.front_prompt };
    },

    /** Flips the card without changing its scheduling state. */
    revealCard(id: number): { back: string } {
      const card = deps.cards.getById(id);
      if (!card) {
        throw new Error(`Unknown flashcard: ${id}`);
      }
      return { back: card.back_answer };
    },

    /** Applies the Leitner transition and returns the graded outcome for UI copy. */
    gradeCard(id: number, correct: boolean): SrsGradeResult {
      const card = deps.cards.getById(id);
      if (!card) {
        throw new Error(`Unknown flashcard: ${id}`);
      }
      const next = review({ box: card.leitner_box_position }, correct);
      deps.cards.updateReviewState(id, next.box, next.dueAt);
      return {
        back: card.back_answer,
        box: next.box,
        nextDueDays: BOX_INTERVAL_DAYS[next.box - 1]
      };
    }
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
