import { CODE_DIAGNOSTICS, SOCRATIC_MATH, type PromptTemplate } from './socraticPrompts';
import {
  EPISODIC_CHUNKER,
  HINT_TREE_BUILDER,
  LITERARY_COMPRESSOR
} from './ingestionPrompts';

export type { PromptTemplate } from './socraticPrompts';
export {
  SOCRATIC_MATH,
  CODE_DIAGNOSTICS
} from './socraticPrompts';
export {
  LITERARY_COMPRESSOR,
  HINT_TREE_BUILDER,
  EPISODIC_CHUNKER
} from './ingestionPrompts';

/** The full registry — every system prompt the app ships, in one place (AGENTS.md §7). */
export const PROMPT_REGISTRY: readonly PromptTemplate[] = [
  SOCRATIC_MATH,
  CODE_DIAGNOSTICS,
  LITERARY_COMPRESSOR,
  HINT_TREE_BUILDER,
  EPISODIC_CHUNKER
];

export function getPromptTemplate(id: string): PromptTemplate {
  const template = PROMPT_REGISTRY.find((entry) => entry.id === id);
  if (!template) {
    throw new Error(`Unknown prompt template id: ${id}`);
  }
  return template;
}

/**
 * Fills a template's {placeholder} tokens. Unknown {tokens} are left intact so
 * a missing variable is visible in output instead of silently vanishing.
 */
export function renderPrompt(id: string, vars: Record<string, string> = {}): string {
  const template = getPromptTemplate(id);
  return template.template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : token
  );
}
