import { safeParseJson } from '@shared/parseJson';
import { LITERARY_COMPRESSOR } from '@shared/prompts';
import type { AiEngineService } from '../ollama/engine';
import { OllamaError } from '../ollama/ollamaClient';

/** Distillation timeout: 7B models need real time for a 300-token JSON answer. */
const DISTILL_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export interface DistilledQuestion {
  questionIndex: number;
  promptText: string;
  solutionCriteria: string;
}

export type DistillOutcome =
  | { ok: true; questions: DistilledQuestion[]; attempts: number }
  | { ok: false; reason: string; attempts: number };

export interface DistillerDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
}

interface RawDistillation {
  content_chunk?: unknown;
  evaluations?: unknown;
}

/**
 * Cognitive distillation (blueprint.md §2 step 3, Prompt 1): sends one reading
 * chunk to the local model and expects strict JSON with comprehension
 * questions + solution vectors.
 *
 * Model output is untrusted (AGENTS.md §3): parse defensively, validate shape,
 * retry with corrective feedback, and never trust the model's `content_chunk` —
 * we store the chunk we extracted ourselves; only the questions are taken.
 */
export function createDistiller(deps: DistillerDeps) {
  return {
    async distill(chunk: string, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<DistillOutcome> {
      let lastReason = 'unknown error';

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const userMessage =
          attempt === 1
            ? chunk
            : `${chunk}\n\nIMPORTANT: Your previous response was not valid JSON matching the required schema. Respond with ONLY the JSON object — no markdown fences, no commentary.`;

        try {
          const generation = await deps.engine.generateWithEngine({
            prompt: userMessage,
            system: LITERARY_COMPRESSOR.template,
            timeoutMs: DISTILL_TIMEOUT_MS
          });

          const parsed = safeParseJson(generation.text);
          const validation = validateDistillation(parsed);
          if (validation.ok) {
            return { ok: true, questions: validation.questions, attempts: attempt };
          }
          lastReason = validation.reason;
        } catch (error) {
          lastReason =
            error instanceof OllamaError
              ? `${error.kind}: ${error.message}`
              : error instanceof Error
                ? error.message
                : String(error);
          // Transport-level failures (engine down) will not improve on retry.
          if (error instanceof OllamaError && error.kind === 'unreachable') {
            return { ok: false, reason: lastReason, attempts: attempt };
          }
        }
      }

      return { ok: false, reason: lastReason, attempts: maxAttempts };
    }
  };
}

export type DistillValidation =
  | { ok: true; questions: DistilledQuestion[] }
  | { ok: false; reason: string };

/** Validates the (untrusted) distilled payload; keeps at most 3 questions. */
export function validateDistillation(raw: unknown): DistillValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'model output was not a JSON object' };
  }
  const record = raw as RawDistillation;

  if (typeof record.content_chunk !== 'string' || record.content_chunk.trim() === '') {
    return { ok: false, reason: 'missing required field: content_chunk' };
  }
  if (!Array.isArray(record.evaluations) || record.evaluations.length === 0) {
    return { ok: false, reason: 'missing required field: evaluations (non-empty array)' };
  }

  const questions: DistilledQuestion[] = [];
  for (const [index, entry] of record.evaluations.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, reason: `evaluation ${index + 1} is not an object` };
    }
    const evaluation = entry as Record<string, unknown>;
    const promptText = evaluation['question_text'];
    const solutionCriteria = evaluation['solution_vector'];
    if (typeof promptText !== 'string' || promptText.trim() === '' || typeof solutionCriteria !== 'string' || solutionCriteria.trim() === '') {
      return { ok: false, reason: `evaluation ${index + 1} needs non-empty question_text and solution_vector` };
    }
    const questionNumber = evaluation['question_number'];
    questions.push({
      questionIndex:
        typeof questionNumber === 'number' && Number.isInteger(questionNumber)
          ? questionNumber
          : index + 1,
      promptText: promptText.trim(),
      solutionCriteria: solutionCriteria.trim()
    });
    if (questions.length === 3) break; // the doc prompt asks for exactly 3
  }

  return { ok: true, questions };
}
