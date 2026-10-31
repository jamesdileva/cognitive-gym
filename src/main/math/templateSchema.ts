import { parseVariableSpec } from './specEngine';

/**
 * Math template schema (architecture.md §6A data model). Templates are
 * authoring JSON loaded from disk — validated hard at the boundary
 * (AGENTS.md §3) so a malformed file fails loudly at startup, not mid-session.
 */
export interface MathTemplate {
  template_id: string;
  topic: string;
  formula_string: string;
  variables: Record<string, string>;
  ideal_solution_steps: string[];
  answer_format: string;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function validateMathTemplate(raw: unknown, source: string): MathTemplate {
  const where = `math template '${source}'`;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${where}: expected a JSON object`);
  }
  const record = raw as Record<string, unknown>;

  const str = (field: string): string => {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${where}: '${field}' must be a non-empty string`);
    }
    return value;
  };

  const template_id = str('template_id');
  const topic = str('topic');
  const formula_string = str('formula_string');
  const answer_format = str('answer_format');

  const variablesRaw = record['variables'];
  if (typeof variablesRaw !== 'object' || variablesRaw === null || Array.isArray(variablesRaw)) {
    throw new Error(`${where}: 'variables' must be an object`);
  }
  const variables: Record<string, string> = {};
  for (const [name, spec] of Object.entries(variablesRaw as Record<string, unknown>)) {
    if (typeof spec !== 'string') {
      throw new Error(`${where}: variable '${name}' must have a string spec`);
    }
    try {
      parseVariableSpec(spec);
    } catch (error) {
      throw new Error(
        `${where}: variable '${name}' has an invalid spec: ${(error as Error).message}`,
        { cause: error }
      );
    }
    variables[name] = spec;
  }

  const stepsRaw = record['ideal_solution_steps'];
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new Error(`${where}: 'ideal_solution_steps' must be a non-empty array`);
  }
  const ideal_solution_steps = stepsRaw.map((step) => {
    if (typeof step !== 'string' || step.trim() === '') {
      throw new Error(`${where}: every solution step must be a non-empty string`);
    }
    return step;
  });

  // Every {placeholder} used anywhere must resolve to a declared variable.
  const checkPlaceholders = (text: string, field: string): void => {
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (!(match[1] in variables)) {
        throw new Error(`${where}: ${field} references unknown variable '{${match[1]}}'`);
      }
    }
  };
  checkPlaceholders(formula_string, 'formula_string');
  checkPlaceholders(answer_format, 'answer_format');
  ideal_solution_steps.forEach((step, index) => checkPlaceholders(step, `step ${index + 1}`));

  return { template_id, topic, formula_string, variables, ideal_solution_steps, answer_format };
}
