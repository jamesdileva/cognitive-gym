import type { PromptTemplate } from './socraticPrompts';

/**
 * Synthetic short-story factory (blueprint.md §1B, Sprint 9). Core constraints
 * verbatim from the doc; the JSON output spec is appended by the pipeline so a
 * 7B model can hit it reliably.
 */
export const STORY_ARCHITECT: PromptTemplate = {
  id: 'story-architect',
  label: 'Short Story Architect',
  source: 'blueprint.md §1B',
  placeholders: ['topic'],
  template: `Role: Master Short Story Architect.
Style Constraints: Hard Sci-Fi, high lexical diversity, reminiscent of Isaac Asimov or Arthur C. Clarke.
Structural Constraints: Exactly 4 paragraphs. Must embed a core logical, philosophical, or scientific dilemma.
Topic: {topic}

OUTPUT FORMAT:
Respond with ONLY a strict JSON object — no markdown fences, no commentary:
{
  "title": "…",
  "story_text": "paragraph one\\n\\nparagraph two\\n\\nparagraph three\\n\\nparagraph four",
  "evaluations": [
    { "question_text": "…", "solution_vector": "…" }
  ]
}
"evaluations" must hold exactly 3 entries. Each "solution_vector" states the criteria an ideal analytical answer must contain — never the full answer itself.`
};

/**
 * Synthetic math-template factory (blueprint.md §1A, Sprint 9): the model
 * authors a NEW parameterized template (formula, variable bounds, steps,
 * answer format); the Sprint 3 engine then generates infinite instances.
 */
export const MATH_TEMPLATE_ARCHITECT: PromptTemplate = {
  id: 'math-template-architect',
  label: 'Math Template Architect',
  source: 'blueprint.md §1A',
  placeholders: [],
  template: `You are the Math Template Architect for a procedural tutoring engine. Invent ONE new parameterized math template in the K-12 through Calculus 2 range — pick a topic and difficulty that produce clean, exact integer answers.

TEMPLATE RULES:
1. "variables" maps names to specs. Specs are either "random_int_range(min, max)" or integer arithmetic over EARLIER variables (e.g. "coeff * power", "power - 1"). Every random draw must keep all derived values exact integers.
2. "formula_string", every "ideal_solution_steps" entry, and "answer_format" reference variables as {name} placeholders — every placeholder must exist in "variables".
3. "ideal_solution_steps" must teach the method without skipping the arithmetic.
4. "answer_format" is the canonical final form (e.g. "f'(x) = {new_coeff}x^{new_power}" or "x = {x}").
5. "template_id" must start with "gen_" followed by lowercase words and underscores (e.g. "gen_calc1_constant_multiple").

OUTPUT FORMAT:
Respond with ONLY a strict JSON object — no markdown fences, no commentary:
{
  "template_id": "gen_…",
  "topic": "…",
  "formula_string": "…{var}…",
  "variables": { "name": "random_int_range(2, 9)" | "earlier * earlier2" },
  "ideal_solution_steps": ["…{var}…", "…"],
  "answer_format": "…{var}…"
}`
};
