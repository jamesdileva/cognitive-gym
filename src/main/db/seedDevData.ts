import type { GymDatabase } from './database';
import { createBookEpisodesRepo } from './repositories/bookEpisodesRepo';
import { createContentPoolRepo } from './repositories/contentPoolRepo';
import { createFlashcardsRepo } from './repositories/flashcardsRepo';
import { loadFlashcardDecks } from '../srs/deckLoader';

/**
 * Dev-mode fixture seeds (AGENTS.md §6): all text below and in the committed
 * deck files is original synthetic or standard-reference content — no book
 * excerpts, no copyrighted material.
 *
 * Flashcard decks seed per-deck idempotently (a deck with existing rows is
 * skipped), so new deck files appear on the next dev start without touching
 * the user's review state. Content pool and episodes still only seed when
 * their tables are entirely empty.
 */
export function seedDevDataIfEmpty(db: GymDatabase, flashcardsDir: string): void {
  seedFlashcardDecks(db, flashcardsDir);

  const empty = (table: string): boolean =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c === 0;

  if (!empty('content_pool') || !empty('book_episodes')) return;

  const seed = db.transaction(() => {
    seedContentPool(db);
    seedBookEpisodes(db);
  });
  seed();
}

function seedFlashcardDecks(db: GymDatabase, flashcardsDir: string): void {
  const repo = createFlashcardsRepo(db);
  for (const deck of loadFlashcardDecks(flashcardsDir)) {
    if (repo.listByDeck(deck.deck_name).length > 0) continue;
    for (const card of deck.cards) {
      repo.create({ deckName: deck.deck_name, frontPrompt: card.front, backAnswer: card.back });
    }
  }
}

function seedContentPool(db: GymDatabase): void {
  const repo = createContentPoolRepo(db);
  repo.insertWithPrompts({
    module: 'english',
    subTopic: 'Golden Age Sci-Fi',
    sourceType: 'synthetic',
    sourceTitle: 'The Lantern Watch (synthetic demo)',
    passageBody:
      'The keeper of Lantern Nine had recorded the same tide for forty years: a silver line drawn ' +
      'across the same page, at the same hour, without deviation. On the night the line arrived ' +
      'eleven minutes early, he did not report it. He checked his clock against the stars, found ' +
      'the stars obedient, and understood that the sea itself had changed its mind. By morning, ' +
      'three more stations reported the same drift, and the fourth reported nothing at all.',
    prompts: [
      {
        questionIndex: 1,
        promptText: 'Why does the keeper choose not to report the early tide immediately?',
        solutionCriteria:
          'Must identify his verification ritual (clock vs stars) as evidence of methodical doubt rather than negligence.',
        hintTier1: 'Consider what the keeper trusts more than his instruments.',
        hintTier2: 'Note the order of his checks: clock first, stars second. What does that sequence imply?',
        hintTier3: 'His silence is provisional — he is gathering proof, not hiding the anomaly.'
      },
      {
        questionIndex: 2,
        promptText: 'What does the fourth station reporting "nothing at all" suggest?',
        solutionCriteria:
          'Must read the ambiguity: silence could mean equipment failure, evacuation, or the anomaly reaching the station itself.',
        hintTier1: 'The story treats silence as information.',
        hintTier2: 'Contrast "reported the same drift" with "reported nothing" — both are signals.',
        hintTier3: 'The escalation pattern implies the anomaly is spreading outward from Lantern Nine.'
      },
      {
        questionIndex: 3,
        promptText: 'How does the forty-year routine sharpen the impact of the eleven-minute drift?',
        solutionCriteria:
          'Must connect the long stability to the scale of the deviation: the routine is the measuring instrument.',
        hintTier1: 'Ask what the routine measures besides the tide.',
        hintTier2: 'Forty years of sameness functions as a baseline — deviation is only meaningful against it.',
        hintTier3: 'The line "without deviation" is the story’s calibration: eleven minutes now outweighs any absolute size.'
      }
    ]
  });
}

function seedBookEpisodes(db: GymDatabase): void {
  const repo = createBookEpisodesRepo(db);
  repo.insertBook('Demo: Signal Hill Nights', [
    {
      episodeNumber: 1,
      episodeTitle: 'The Antenna That Listened Back',
      contentText:
        'Signal Hill had one job: transcribe the noise of the ionosphere into numbers nobody read. ' +
        'Operator Ines Vale transcribed them anyway, because silence was worse. On the third of ' +
        'March, the noise began answering her — one pulse for yes, two for no — and the first ' +
        'question it asked was whether she was alone.',
      isCanonical: false
    },
    {
      episodeNumber: 2,
      episodeTitle: 'Calibration',
      contentText:
        'Ines spent a week proving the voice was not her own equipment reflecting. She disconnected ' +
        'the antenna entirely, and the voice continued, patient and thin, like something reading ' +
        'over her shoulder. She asked how it was transmitting. It answered with the serial number ' +
        'of a radio that had never been manufactured.',
      isCanonical: false
    },
    {
      episodeNumber: 3,
      episodeTitle: 'The Third Answer',
      contentText:
        'The voice agreed to three questions per night, no more. Ines rationed hers like water. ' +
        'Her colleagues noticed she had stopped aging her coffee, stopped flinching at storms. ' +
        'When the hill’s power failed for six hours, the voice stayed with her in the dark and ' +
        'counted the seconds aloud, and for the first time Ines heard it hesitate.',
      isCanonical: false
    }
  ]);
}
