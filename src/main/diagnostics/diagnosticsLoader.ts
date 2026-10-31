import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Content schemas for the three diagnostics rooms (architecture.md §6C/§6D). */

export interface CodingProblem {
  problem_id: string;
  title: string;
  language: string;
  goal: string;
  code: string;
  /** Solution vector for semantic grading — never leaves the main process. */
  bug_criteria: string;
}

export interface LogicPuzzle {
  puzzle_id: string;
  title: string;
  /** Exactly three categories × three values. */
  categories: Record<string, string[]>;
  clues: string[];
  /** One row per entity of the first category; hand-verified solvable. */
  solution: Record<string, string>[];
}

export interface SystemsCase {
  case_id: string;
  title: string;
  goal: string;
  log_text: string;
  diagnosis_criteria: string;
}

export interface DiagnosticsContent {
  coding: CodingProblem[];
  logic: LogicPuzzle[];
  systems: SystemsCase[];
}

const FIRST_CATEGORY_SIZE = 3;

/**
 * Loads and validates every `*.json` fixture in the three content-library
 * directories. Same strict boundary discipline as the other loaders
 * (AGENTS.md §3): a malformed fixture fails loudly at startup.
 */
export function loadDiagnosticsContent(root: string): DiagnosticsContent {
  return {
    coding: loadDir(join(root, 'coding-diagnostics'), 'coding problem', validateCoding),
    logic: loadDir(join(root, 'logic-grids'), 'logic grid', validateLogic),
    systems: loadDir(join(root, 'systems-logs'), 'systems case', validateSystems)
  };
}

function loadDir<T>(dir: string, label: string, validate: (raw: unknown, file: string) => T): T[] {
  const items: T[] = [];
  const seen = new Set<string>();
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    // A missing directory is an empty room (packaged apps may prune content);
    // anything else is a real misconfiguration and must fail loudly.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return items;
  }

  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as unknown;
    } catch (error) {
      throw new Error(`${label} '${file}' is not valid JSON: ${(error as Error).message}`, {
        cause: error
      });
    }
    const item = validate(raw, file);
    if (seen.has(itemKey(item))) {
      throw new Error(`Duplicate ${label} id '${itemKey(item)}' in '${file}'`);
    }
    seen.add(itemKey(item));
    items.push(item);
  }
  return items;
}

function itemKey(item: unknown): string {
  const record = item as Record<string, unknown>;
  return String(record['problem_id'] ?? record['puzzle_id'] ?? record['case_id']);
}

function requireString(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${where}: '${field}' must be a non-empty string`);
  }
  return value;
}

function validateCoding(raw: unknown, file: string): CodingProblem {
  const where = `coding problem '${file}'`;
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: expected object`);
  const record = raw as Record<string, unknown>;
  return {
    problem_id: requireString(record, 'problem_id', where),
    title: requireString(record, 'title', where),
    language: requireString(record, 'language', where),
    goal: requireString(record, 'goal', where),
    code: requireString(record, 'code', where),
    bug_criteria: requireString(record, 'bug_criteria', where)
  };
}

function validateSystems(raw: unknown, file: string): SystemsCase {
  const where = `systems case '${file}'`;
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: expected object`);
  const record = raw as Record<string, unknown>;
  return {
    case_id: requireString(record, 'case_id', where),
    title: requireString(record, 'title', where),
    goal: requireString(record, 'goal', where),
    log_text: requireString(record, 'log_text', where),
    diagnosis_criteria: requireString(record, 'diagnosis_criteria', where)
  };
}

function validateLogic(raw: unknown, file: string): LogicPuzzle {
  const where = `logic grid '${file}'`;
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: expected object`);
  const record = raw as Record<string, unknown>;

  const categoriesRaw = record['categories'];
  if (typeof categoriesRaw !== 'object' || categoriesRaw === null) {
    throw new Error(`${where}: 'categories' must be an object`);
  }
  const categories: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(categoriesRaw as Record<string, unknown>)) {
    if (!Array.isArray(values) || values.length !== FIRST_CATEGORY_SIZE || !values.every((v) => typeof v === 'string' && v.trim() !== '')) {
      throw new Error(`${where}: category '${name}' must hold exactly ${FIRST_CATEGORY_SIZE} non-empty values`);
    }
    categories[name] = values as string[];
  }
  const categoryNames = Object.keys(categories);
  if (categoryNames.length !== FIRST_CATEGORY_SIZE) {
    throw new Error(`${where}: expected exactly ${FIRST_CATEGORY_SIZE} categories`);
  }

  const cluesRaw = record['clues'];
  if (!Array.isArray(cluesRaw) || cluesRaw.length === 0 || !cluesRaw.every((c) => typeof c === 'string' && c.trim() !== '')) {
    throw new Error(`${where}: 'clues' must be a non-empty array of strings`);
  }

  const solutionRaw = record['solution'];
  if (!Array.isArray(solutionRaw) || solutionRaw.length !== FIRST_CATEGORY_SIZE) {
    throw new Error(`${where}: 'solution' must hold exactly ${FIRST_CATEGORY_SIZE} rows`);
  }
  const firstCategory = categoryNames[0];
  const solution: Record<string, string>[] = [];
  for (const [index, row] of solutionRaw.entries()) {
    if (typeof row !== 'object' || row === null) {
      throw new Error(`${where}: solution row ${index + 1} must be an object`);
    }
    const rowRecord = row as Record<string, unknown>;
    const mapped: Record<string, string> = {};
    for (const category of categoryNames) {
      const value = rowRecord[category];
      if (typeof value !== 'string' || !categories[category].includes(value)) {
        throw new Error(`${where}: solution row ${index + 1} has invalid value for '${category}'`);
      }
      mapped[category] = value;
    }
    solution.push(mapped);
  }

  // Every category's values must be used exactly once across the rows.
  for (const category of categoryNames) {
    const used = solution.map((row) => row[category]).sort();
    if (new Set(used).size !== FIRST_CATEGORY_SIZE) {
      throw new Error(`${where}: solution reuses a value in category '${category}'`);
    }
  }
  if (new Set(solution.map((row) => row[firstCategory])).size !== FIRST_CATEGORY_SIZE) {
    throw new Error(`${where}: solution rows must each have a distinct '${firstCategory}'`);
  }

  return {
    puzzle_id: requireString(record, 'puzzle_id', where),
    title: requireString(record, 'title', where),
    categories,
    clues: cluesRaw as string[],
    solution
  };
}
