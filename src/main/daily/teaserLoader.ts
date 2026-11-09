import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Teaser-of-the-day content (v0.2): riddles, lateral thinking, philosophy. */

export interface Teaser {
  teaser_id: string;
  kind: 'riddle' | 'lateral' | 'philosophical';
  prompt: string;
  /** Solution vector for semantic grading — stays main-side. */
  criteria: string;
}

const KINDS = new Set(['riddle', 'lateral', 'philosophical']);
const ID_PATTERN = /^teaser_[a-z0-9_]+$/;

/**
 * Loads and validates every `*.json` teaser in a directory — same strict
 * boundary discipline as the other loaders (AGENTS.md §3).
 */
export function loadTeasers(dir: string): Teaser[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const teasers: Teaser[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const where = `teaser '${file}'`;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as unknown;
    } catch (error) {
      throw new Error(`${where} is not valid JSON: ${(error as Error).message}`, { cause: error });
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`${where}: expected a JSON object`);
    }
    const record = raw as Record<string, unknown>;

    const teaserId = record['teaser_id'];
    if (typeof teaserId !== 'string' || !ID_PATTERN.test(teaserId)) {
      throw new Error(`${where}: 'teaser_id' must match teaser_<lowercase_words>`);
    }
    if (seen.has(teaserId)) {
      throw new Error(`Duplicate teaser_id '${teaserId}' in '${file}'`);
    }
    seen.add(teaserId);

    const kind = record['kind'];
    if (typeof kind !== 'string' || !KINDS.has(kind)) {
      throw new Error(`${where}: 'kind' must be one of riddle, lateral, philosophical`);
    }

    const prompt = record['prompt'];
    const criteria = record['criteria'];
    if (typeof prompt !== 'string' || prompt.trim() === '' || typeof criteria !== 'string' || criteria.trim() === '') {
      throw new Error(`${where}: 'prompt' and 'criteria' must be non-empty strings`);
    }

    teasers.push({
      teaser_id: teaserId,
      kind: kind as Teaser['kind'],
      prompt,
      criteria
    });
  }

  return teasers;
}
