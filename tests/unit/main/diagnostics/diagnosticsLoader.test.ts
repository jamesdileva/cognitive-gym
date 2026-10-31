import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDiagnosticsContent } from '@main/diagnostics/diagnosticsLoader';

/** Repo root, resolved independently of the test runner's cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

const VALID_CODING = {
  problem_id: 'c1',
  title: 'T',
  language: 'python',
  goal: 'g',
  code: 'x',
  bug_criteria: 'b'
};
const VALID_LOGIC = {
  puzzle_id: 'l1',
  title: 'T',
  categories: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'], C: ['c1', 'c2', 'c3'] },
  clues: ['Clue one.'],
  solution: [
    { A: 'a1', B: 'b1', C: 'c1' },
    { A: 'a2', B: 'b2', C: 'c2' },
    { A: 'a3', B: 'b3', C: 'c3' }
  ]
};
describe('loadDiagnosticsContent — committed content library', () => {
  it('loads the shipped fixtures for all three rooms', () => {
    const content = loadDiagnosticsContent(join(REPO_ROOT, 'content-library'));

    expect(content.coding.map((p) => p.problem_id)).toEqual([
      'coding_closure_scope_01',
      'coding_off_by_one_01'
    ]);
    expect(content.logic.map((p) => p.puzzle_id)).toEqual(['logic_harbor_01']);
    expect(content.systems.map((c) => c.case_id)).toEqual([
      'systems_backup_full_01',
      'systems_upstream_502_01'
    ]);

    // The shipped logic puzzle must be internally consistent (each value once).
    const puzzle = content.logic[0];
    for (const category of Object.keys(puzzle.categories)) {
      const used = puzzle.solution.map((row) => row[category]).sort();
      expect(used).toEqual([...puzzle.categories[category]].sort());
    }
  });

  it('tolerates a missing content directory (empty room)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cg-diag-empty-'));
    tempDirs.push(dir);
    const content = loadDiagnosticsContent(dir);
    expect(content).toEqual({ coding: [], logic: [], systems: [] });
  });
});

describe('loadDiagnosticsContent — validation', () => {
  it('rejects malformed JSON with the filename', () => {
    const dir = makeTempDir2('coding-diagnostics/broken.json', '{ nope');
    expect(() => loadDiagnosticsContent(dir)).toThrow(/broken\.json/);
  });

  it('rejects logic solutions that reuse a value', () => {
    const dir = makeTempDir2('logic-grids/dup.json', {
      ...VALID_LOGIC,
      solution: [
        { A: 'a1', B: 'b1', C: 'c1' },
        { A: 'a2', B: 'b1', C: 'c2' },
        { A: 'a3', B: 'b3', C: 'c3' }
      ]
    });
    expect(() => loadDiagnosticsContent(dir)).toThrow(/reuses a value in category 'B'/);
  });

  it('rejects logic solutions with unknown values', () => {
    const dir = makeTempDir2('logic-grids/bad.json', {
      ...VALID_LOGIC,
      solution: [
        { A: 'a1', B: 'zz', C: 'c1' },
        { A: 'a2', B: 'b2', C: 'c2' },
        { A: 'a3', B: 'b3', C: 'c3' }
      ]
    });
    expect(() => loadDiagnosticsContent(dir)).toThrow(/invalid value for 'B'/);
  });

  it('rejects grids that are not 3×3', () => {
    const dir = makeTempDir2('logic-grids/small.json', {
      ...VALID_LOGIC,
      categories: { A: ['a1', 'a2'], B: ['b1', 'b2'], C: ['c1', 'c2'] }
    });
    expect(() => loadDiagnosticsContent(dir)).toThrow(/exactly 3 non-empty values/);
  });

  it('rejects coding problems with missing fields', () => {
    const dir = makeTempDir2('coding-diagnostics/bad.json', {
      ...VALID_CODING,
      bug_criteria: undefined
    });
    expect(() => loadDiagnosticsContent(dir)).toThrow(/bug_criteria/);
  });

  function makeTempDir2(relative: string, data: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'cg-diag2-'));
    tempDirs.push(dir);
    const [subdir] = relative.split('/');
    mkdirSync(join(dir, subdir), { recursive: true });
    writeFileSync(join(dir, relative), JSON.stringify(data));
    return dir;
  }
});
