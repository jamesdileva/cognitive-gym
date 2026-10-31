import { randomInt } from 'node:crypto';
import { renderPrompt } from '@shared/prompts';
import type {
  MathCheckResponse,
  MathHintResult,
  MathProblem,
  MathRevealResponse,
  MathTopicSummary
} from '@shared/math-types';
import type { AiFailure } from '@shared/ai-types';
import type { AiEngineService } from '../ollama/engine';
import type { UserProgressRepo } from '../db/repositories/userProgressRepo';
import { resolveVariableSpec, seededRandom } from './specEngine';
import type { MathTemplate } from './templateSchema';

export interface RenderedProblem {
  problem: MathProblem;
  variables: Record<string, number>;
  solutionSteps: string[];
  answer: string;
}

export interface MathServiceDeps {
  templates: MathTemplate[];
  progress: Pick<UserProgressRepo, 'recordAttempt' | 'getByItem'>;
  engine: Pick<AiEngineService, 'generateWithEngine'>;
}

/**
 * Procedural math with Socratic hinting (architecture.md §6A, §7).
 * The renderer holds only a {@link MathProblem} reference; every check/reveal/
 * hint re-derives the full problem deterministically from (templateId, seed),
 * so answers and solution steps never cross the IPC boundary.
 */
export function createMathService(deps: MathServiceDeps) {
  const byId = new Map(deps.templates.map((template) => [template.template_id, template]));

  function render(templateId: string, seed: number): RenderedProblem {
    const template = byId.get(templateId);
    if (!template) {
      throw new Error(`Unknown math template: ${templateId}`);
    }
    const prng = seededRandom(templateId, seed);
    const variables: Record<string, number> = {};
    for (const [name, spec] of Object.entries(template.variables)) {
      variables[name] = resolveVariableSpec(spec, variables, prng);
    }
    const fill = (text: string): string =>
      text.replace(/\{(\w+)\}/g, (token, key: string) =>
        key in variables ? String(variables[key]) : token
      );

    return {
      problem: {
        templateId,
        seed,
        topic: template.topic,
        display: fill(template.formula_string)
      },
      variables,
      solutionSteps: template.ideal_solution_steps.map(fill),
      answer: fill(template.answer_format)
    };
  }

  return {
    /** Re-derives the full problem (main-side only; not exposed over IPC). */
    render,

    newProblem(templateId: string): MathProblem {
      return render(templateId, randomInt(0, 2 ** 31)).problem;
    },

    listTopics(): MathTopicSummary[] {
      return deps.templates.map((template) => {
        const progress = deps.progress.getByItem('math', template.template_id);
        return {
          templateId: template.template_id,
          topic: template.topic,
          totalAttempts: progress?.total_attempts ?? 0,
          successfulAttempts: progress?.successful_attempts ?? 0
        };
      });
    },

    checkAnswer(problem: MathProblem, answer: string): MathCheckResponse {
      const rendered = render(problem.templateId, problem.seed);
      const correct = normalizeMathAnswer(answer) === normalizeMathAnswer(rendered.answer);
      deps.progress.recordAttempt({
        moduleType: 'math',
        contentItemId: problem.templateId,
        successful: correct
      });
      return {
        correct,
        note: correct
          ? 'Correct — that matches the expected final form.'
          : 'Not quite. Trace the steps again, or ask the tutor for a hint.'
      };
    },

    reveal(problem: MathProblem): MathRevealResponse {
      const rendered = render(problem.templateId, problem.seed);
      return { steps: rendered.solutionSteps, answer: rendered.answer };
    },

    /**
     * Socratic hint: renders the registry's socratic-math prompt with the
     * computed problem and its structural steps, bound to the live engine.
     */
    async hint(problem: MathProblem, userMessage: string): Promise<MathHintResult> {
      const rendered = render(problem.templateId, problem.seed);
      const system = renderPrompt('socratic-math', {
        computed_problem: rendered.problem.display,
        solution_steps: rendered.solutionSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')
      });
      try {
        const generation = await deps.engine.generateWithEngine({
          prompt: userMessage,
          system
        });
        return { ok: true, hint: generation.text };
      } catch (error) {
        const failure: AiFailure = {
          kind:
            typeof error === 'object' && error !== null && 'kind' in error
              ? (error as { kind: AiFailure['kind'] }).kind
              : 'unreachable',
          message: error instanceof Error ? error.message : String(error)
        };
        return { ok: false, failure };
      }
    }
  };
}

export type MathService = ReturnType<typeof createMathService>;

/**
 * Strict-form answer comparison for the MVP: case/whitespace-insensitive,
 * common math glyphs normalized, and any "label =" prefix stripped so
 * "x = 6", "6" and "X=6" all match the canonical "x = 6".
 */
export function normalizeMathAnswer(answer: string): string {
  let normalized = answer
    .trim()
    .toLowerCase()
    .replace(/[\u2212\u2013\u2014]/g, '-') // minus/en/em dash -> hyphen
    .replace(/[\u00d7\u22c5]/g, '*') // × and · -> *
    .replace(/\s+/g, '')
    .replace(/[{}]/g, ''); // tolerate LaTeX-ish braces: x^{9} === x^9
  const equalsIndex = normalized.indexOf('=');
  if (equalsIndex !== -1) {
    normalized = normalized.slice(equalsIndex + 1);
  }
  return normalized;
}
