import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadFlashcardDecks } from '@main/srs/deckLoader';

/** Repo root, resolved independently of the test runner's cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const CONTENT_LIBRARY = join(REPO_ROOT, 'content-library', 'flashcards');

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-srs-'));
  tempDirs.push(dir);
  return dir;
}

const VALID = {
  deck_name: 'Test Deck',
  cards: [
    { front: 'f1', back: 'b1' },
    { front: 'f2', back: 'b2' }
  ]
};

describe('loadFlashcardDecks — committed content library', () => {
  it('loads the shipped decks with their full card sets', () => {
    const decks = loadFlashcardDecks(CONTENT_LIBRARY);
    const names = decks.map((deck) => deck.deck_name);

    expect(names).toContain('Military Alphabet');
    expect(names).toContain('Python Keywords');

    const military = decks.find((deck) => deck.deck_name === 'Military Alphabet');
    expect(military?.cards).toHaveLength(26); // A–Z
    expect(military?.cards[0]).toEqual({ front: 'A', back: 'Alpha' });
    expect(military?.cards[25]).toEqual({ front: 'Z', back: 'Zulu' });

    const python = decks.find((deck) => deck.deck_name === 'Python Keywords');
    expect(python?.cards.length).toBeGreaterThanOrEqual(10);
  });
});

describe('loadFlashcardDecks — validation (temp dir)', () => {
  it('loads valid decks and ignores non-JSON files', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'deck.json'), JSON.stringify(VALID));
    writeFileSync(join(dir, 'readme.txt'), 'ignored');

    expect(loadFlashcardDecks(dir)).toEqual([VALID]);
  });

  it('rejects invalid JSON with the filename in the error', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    expect(() => loadFlashcardDecks(dir)).toThrow(/broken\.json/);
  });

  it('rejects empty card lists and malformed cards', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'empty.json'), JSON.stringify({ deck_name: 'E', cards: [] }));
    expect(() => loadFlashcardDecks(dir)).toThrow(/non-empty array/);

    writeFileSync(
      join(dir, 'bad_card.json'),
      JSON.stringify({ deck_name: 'B', cards: [{ front: 'only-front' }] })
    );
    expect(() => loadFlashcardDecks(dir)).toThrow(/card 1 needs non-empty/);
  });

  it('rejects duplicate deck names across files', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'one.json'), JSON.stringify(VALID));
    writeFileSync(join(dir, 'two.json'), JSON.stringify(VALID));
    expect(() => loadFlashcardDecks(dir)).toThrow(/Duplicate deck_name 'Test Deck'/);
  });
});
