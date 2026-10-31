import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateMathTemplate, type MathTemplate } from './templateSchema';

/**
 * Loads and validates every `*.json` math template in a directory.
 * Sorted for deterministic ordering; duplicate template ids fail loudly.
 */
export function loadMathTemplates(dir: string): MathTemplate[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const templates: MathTemplate[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const path = join(dir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    } catch (error) {
      throw new Error(`Math template '${file}' is not valid JSON: ${(error as Error).message}`, {
        cause: error
      });
    }
    const template = validateMathTemplate(raw, file);
    if (seenIds.has(template.template_id)) {
      throw new Error(`Duplicate template_id '${template.template_id}' in '${file}'`);
    }
    seenIds.add(template.template_id);
    templates.push(template);
  }

  return templates;
}
