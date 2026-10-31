import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMathTemplates } from '@main/math/templateLoader';

/** Repo root, resolved independently of the test runner's cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const CONTENT_LIBRARY = join(REPO_ROOT, 'content-library', 'math-formulas');

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-math-'));
  tempDirs.push(dir);
  return dir;
}

const VALID = {
  template_id: 'test_01',
  topic: 'Test Topic',
  formula_string: 'Compute {a} + {b}',
  variables: { a: 'random_int_range(1, 5)', b: 'random_int_range(1, 5)', s: 'a + b' },
  ideal_solution_steps: ['Add {a} and {b}.'],
  answer_format: '{s}'
};

describe('loadMathTemplates — committed content library', () => {
  it('loads and validates every shipped template (guards against regressions)', () => {
    const templates = loadMathTemplates(CONTENT_LIBRARY);
    expect(templates.length).toBeGreaterThanOrEqual(3);

    const ids = templates.map((t) => t.template_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('calc1_power_rule_01');

    // Every shipped template instantiates within its declared bounds.
    for (const template of templates) {
      for (const [name, spec] of Object.entries(template.variables)) {
        if (spec.startsWith('random_int_range')) {
          expect(spec, `${template.template_id}.${name} uses random specs`).toMatch(
            /^random_int_range\(\s*-?\d+\s*,\s*-?\d+\s*\)$/
          );
        }
      }
    }
  });
});

describe('loadMathTemplates — validation (temp dir)', () => {
  it('loads valid files sorted by filename and ignores non-JSON', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'b_second.json'), JSON.stringify(VALID));
    writeFileSync(join(dir, 'a_first.json'), JSON.stringify({ ...VALID, template_id: 'test_00' }));
    writeFileSync(join(dir, 'notes.txt'), 'ignored');

    const templates = loadMathTemplates(dir);
    expect(templates.map((t) => t.template_id)).toEqual(['test_00', 'test_01']);
  });

  it('rejects invalid JSON with the filename in the error', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    expect(() => loadMathTemplates(dir)).toThrow(/broken\.json/);
  });

  it('rejects unknown placeholder references', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'bad.json'),
      JSON.stringify({ ...VALID, answer_format: '{missing_var}' })
    );
    expect(() => loadMathTemplates(dir)).toThrow(/unknown variable '\{missing_var\}'/);
  });

  it('rejects invalid variable specs', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'bad.json'),
      JSON.stringify({ ...VALID, variables: { a: 'random_int_range(9, 2)' } })
    );
    expect(() => loadMathTemplates(dir)).toThrow(/invalid spec/);
  });

  it('rejects duplicate template ids across files', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'one.json'), JSON.stringify(VALID));
    writeFileSync(join(dir, 'two.json'), JSON.stringify(VALID));
    expect(() => loadMathTemplates(dir)).toThrow(/Duplicate template_id 'test_01'/);
  });

  it('rejects empty directories (a math module without content is a config error)', () => {
    const dir = makeTempDir();
    expect(loadMathTemplates(dir)).toEqual([]);
  });
});
