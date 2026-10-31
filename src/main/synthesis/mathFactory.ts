import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeParseJson } from '@shared/parseJson';
import { MATH_TEMPLATE_ARCHITECT } from '@shared/prompts';
import type { AiEngineService } from '../ollama/engine';
import { OllamaError } from '../ollama/ollamaClient';
import { resolveVariableSpec, seededRandom } from '../math/specEngine';
import { validateMathTemplate, type MathTemplate } from '../math/templateSchema';

const SYNTHESIS_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export type MathTemplateOutcome =
  | { ok: true; template: MathTemplate; attempts: number }
  | { ok: false; reason: string; attempts: number };

export interface MathFactoryDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  /** Directory where generated templates persist (userData/math-templates). */
  outputDir: string;
}

const GEN_ID_PATTERN = /^gen_[a-z0-9_]+$/;

/**
 * Synthetic math-template factory (blueprint.md §1A): the model authors a new
 * parameterized TEMPLATE; the Sprint 3 engine turns it into infinite problem
 * instances. generate() validates structurally (shared schema + dry-run
 * instantiation + gen_ id prefix) and returns — persistence and dedupe are
 * the caller's job, so a batch can generate multiple candidates safely.
 */
export function createMathFactory(deps: MathFactoryDeps) {
  const existingIds = (): Set<string> => {
    try {
      return new Set(
        readdirSync(deps.outputDir)
          .filter((file) => file.endsWith('.json'))
          .map((file) => file.replace(/\.json$/, ''))
      );
    } catch {
      return new Set();
    }
  };

  return {
    /** Ids already persisted in the output directory. */
    existingTemplateIds: existingIds,

    async generate(maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<MathTemplateOutcome> {
      let lastReason = 'unknown error';

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const userMessage =
          attempt === 1
            ? 'Invent the template now. Respond with only the JSON object.'
            : 'Your previous response was not valid JSON matching the schema. Respond with ONLY the JSON object.';

        try {
          const generation = await deps.engine.generateWithEngine({
            prompt: userMessage,
            system: MATH_TEMPLATE_ARCHITECT.template,
            timeoutMs: SYNTHESIS_TIMEOUT_MS
          });

          const validation = validateGeneratedTemplate(safeParseJson(generation.text));
          if (validation.ok) {
            return { ok: true, template: validation.template, attempts: attempt };
          }
          lastReason = validation.reason;
        } catch (error) {
          lastReason =
            error instanceof OllamaError
              ? `${error.kind}: ${error.message}`
              : error instanceof Error
                ? error.message
                : String(error);
          if (error instanceof OllamaError && error.kind === 'unreachable') {
            return { ok: false, reason: lastReason, attempts: attempt };
          }
        }
      }

      return { ok: false, reason: lastReason, attempts: maxAttempts };
    },

    persist(template: MathTemplate): void {
      mkdirSync(deps.outputDir, { recursive: true });
      writeFileSync(
        join(deps.outputDir, `${template.template_id}.json`),
        JSON.stringify(template, null, 2)
      );
    }
  };
}

export type GeneratedTemplateValidation =
  | { ok: true; template: MathTemplate }
  | { ok: false; reason: string };

/**
 * Validates an untrusted generated template: shared schema, gen_ id prefix,
 * and a dry-run instantiation (one seeded variable resolution pass) to catch
 * broken specs/expressions early. Cross-run collision checks belong to the
 * caller, which owns persistence and dedupe.
 */
export function validateGeneratedTemplate(raw: unknown): GeneratedTemplateValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'model output was not a JSON object' };
  }
  const record = raw as Record<string, unknown>;

  const templateId = record['template_id'];
  if (typeof templateId !== 'string' || !GEN_ID_PATTERN.test(templateId)) {
    return { ok: false, reason: 'template_id must match gen_<lowercase_words>' };
  }

  let structural: MathTemplate;
  try {
    // Deterministic validation errors must not trigger retries upstream.
    structural = validateMathTemplate(raw, templateId);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }

  // Dry-run: resolve every variable once (seeded) to prove specs + expressions
  // evaluate, exactly like the live engine will.
  try {
    const prng = seededRandom(templateId, 1);
    const vars: Record<string, number> = {};
    for (const [name, spec] of Object.entries(structural.variables)) {
      vars[name] = resolveVariableSpec(spec, vars, prng);
    }
    if (Object.keys(vars).length === 0) {
      return { ok: false, reason: 'template declares no variables' };
    }
  } catch (error) {
    return { ok: false, reason: `variables do not resolve: ${(error as Error).message}` };
  }

  return { ok: true, template: structural };
}
