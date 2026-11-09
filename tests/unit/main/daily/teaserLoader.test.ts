import { describe, expect, it } from 'vitest';
import { loadTeasers } from '@main/daily/teaserLoader';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-teaser-'));
  tempDirs.push(dir);
  return dir;
}

const VALID = {
  teaser_id: 'teaser_riddle_09',
  kind: 'riddle',
  prompt: 'What has keys but no locks?',
  criteria: 'Must answer a piano.'
};

describe('loadTeasers', () => {
  it('loads the shipped teasers with kinds and criteria', () => {
    const dir = join(process.cwd(), 'content-library', 'teasers');
    const teasers = loadTeasers(dir);
    expect(teasers.length).toBeGreaterThanOrEqual(5);
    const ids = teasers.map((t) => t.teaser_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('teaser_riddle_01');
    expect(ids).toContain('teaser_philosophical_02');
    for (const teaser of teasers) {
      expect(['riddle', 'lateral', 'philosophical']).toContain(teaser.kind);
      expect(teaser.criteria.length).toBeGreaterThan(20);
    }
  });

  it('rejects invalid JSON with the filename in the error', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    expect(() => loadTeasers(dir)).toThrow(/broken\.json/);
  });

  it('rejects unknown kinds and bad ids', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ ...VALID, kind: 'trivia' }));
    expect(() => loadTeasers(dir)).toThrow(/'kind' must be one of/);

    const dir2 = makeTempDir();
    writeFileSync(join(dir2, 'b.json'), JSON.stringify({ ...VALID, teaser_id: 'riddle_01' }));
    expect(() => loadTeasers(dir2)).toThrow(/teaser_<lowercase_words>/);
  });

  it('rejects duplicate teaser ids across files', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'one.json'), JSON.stringify(VALID));
    writeFileSync(join(dir, 'two.json'), JSON.stringify(VALID));
    expect(() => loadTeasers(dir)).toThrow(/Duplicate teaser_id/);
  });
});
