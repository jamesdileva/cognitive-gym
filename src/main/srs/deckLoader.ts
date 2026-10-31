import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Pre-compiled flashcard deck JSON (architecture.md: /content-library/flashcards). */
export interface FlashcardDeck {
  deck_name: string;
  cards: { front: string; back: string }[];
}

/**
 * Loads and validates every `*.json` deck in a directory — same strict
 * boundary discipline as the math template loader (AGENTS.md §3).
 */
export function loadFlashcardDecks(dir: string): FlashcardDeck[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const decks: FlashcardDeck[] = [];
  const seenNames = new Set<string>();

  for (const file of files) {
    const path = join(dir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    } catch (error) {
      throw new Error(`Flashcard deck '${file}' is not valid JSON: ${(error as Error).message}`, {
        cause: error
      });
    }

    const deck = validateDeck(raw, file);
    if (seenNames.has(deck.deck_name)) {
      throw new Error(`Duplicate deck_name '${deck.deck_name}' in '${file}'`);
    }
    seenNames.add(deck.deck_name);
    decks.push(deck);
  }

  return decks;
}

function validateDeck(raw: unknown, source: string): FlashcardDeck {
  const where = `flashcard deck '${source}'`;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${where}: expected a JSON object`);
  }
  const record = raw as Record<string, unknown>;

  const deckName = record['deck_name'];
  if (typeof deckName !== 'string' || deckName.trim() === '') {
    throw new Error(`${where}: 'deck_name' must be a non-empty string`);
  }

  const cardsRaw = record['cards'];
  if (!Array.isArray(cardsRaw) || cardsRaw.length === 0) {
    throw new Error(`${where}: 'cards' must be a non-empty array`);
  }
  const cards = cardsRaw.map((card, index) => {
    if (typeof card !== 'object' || card === null) {
      throw new Error(`${where}: card ${index + 1} must be an object`);
    }
    const entry = card as Record<string, unknown>;
    const front = entry['front'];
    const back = entry['back'];
    if (typeof front !== 'string' || front.trim() === '' || typeof back !== 'string' || back.trim() === '') {
      throw new Error(`${where}: card ${index + 1} needs non-empty 'front' and 'back' strings`);
    }
    return { front, back };
  });

  return { deck_name: deckName, cards };
}
