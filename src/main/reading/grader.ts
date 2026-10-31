import { safeParseJson } from '@shared/parseJson';
import { renderPrompt } from '@shared/prompts';
import type { AiEngineService } from '../ollama/engine';
import { OllamaError } from '../ollama/ollamaClient';

const GRADE_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export const PASS_THRESHOLD = 70;

export interface GradeInput {
  passage: string;
  question: string;
  solutionCriteria: string;
  answer: string;
}

export type GraderOutcome =
  | { ok: true; score: number; feedback: string; attempts: number }
  | { ok: false; reason: string; attempts: number };

export interface GraderDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
}

export interface RawGrade {
  score?: unknown;
  feedback?: unknown;
}

/**
 * Semantic grading against the stored solution vector (architecture.md §6B:
 * "the local model grades the reasoning quality based on a strict semantic
 * boundary"). Output is untrusted: validated, score-clamped, retried with
 * corrective feedback. The no-reveal rule lives in the registry prompt.
 */
export function createGrader(deps: GraderDeps) {
  return {
    async grade(input: GradeInput, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<GraderOutcome> {
      let lastReason = 'unknown error';

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const userMessage =
          attempt === 1
            ? 'Grade the student answer now. Respond with only the JSON object.'
            : 'Your previous response was not valid JSON matching the schema. Respond with ONLY the JSON object.';

        try {
          const generation = await deps.engine.generateWithEngine({
            prompt: userMessage,
            system: renderPrompt('reading-grader', {
              passage: input.passage,
              question: input.question,
              solution_criteria: input.solutionCriteria,
              answer: input.answer
            }),
            timeoutMs: GRADE_TIMEOUT_MS
          });

          const validation = validateGrade(safeParseJson(generation.text));
          if (validation.ok) {
            return { ok: true, score: validation.score, feedback: validation.feedback, attempts: attempt };
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
    }
  };
}

export type GradeValidation =
  | { ok: true; score: number; feedback: string }
  | { ok: false; reason: string };

export function validateGrade(raw: unknown): GradeValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'model output was not a JSON object' };
  }
  const record = raw as RawGrade;

  if (typeof record.score !== 'number' || !Number.isFinite(record.score)) {
    return { ok: false, reason: 'missing or non-numeric field: score' };
  }
  if (typeof record.feedback !== 'string' || record.feedback.trim() === '') {
    return { ok: false, reason: 'missing required field: feedback' };
  }

  const score = Math.round(Math.min(100, Math.max(0, record.score)));
  return { ok: true, score, feedback: record.feedback.trim() };
}
