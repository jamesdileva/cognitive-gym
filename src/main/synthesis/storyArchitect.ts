import { safeParseJson } from '@shared/parseJson';
import { STORY_ARCHITECT } from '@shared/prompts';
import type { GeneratedStory } from '@shared/synthesis-types';
import type { AiEngineService } from '../ollama/engine';
import { OllamaError } from '../ollama/ollamaClient';

const SYNTHESIS_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export type StoryOutcome =
  | { ok: true; story: GeneratedStory; attempts: number }
  | { ok: false; reason: string; attempts: number };

export interface StoryArchitectDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
}

/**
 * Synthetic short-story factory (blueprint.md §1B): one call produces a
 * 4-paragraph hard sci-fi story plus 3 analytical questions with solution
 * vectors. Output is untrusted — parsed, validated hard (exactly 4 paragraphs,
 * exactly 3 evaluations), retried with corrective feedback.
 */
export function createStoryArchitect(deps: StoryArchitectDeps) {
  return {
    async synthesize(topic: string, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<StoryOutcome> {
      let lastReason = 'unknown error';

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const userMessage =
          attempt === 1
            ? `Write the story now. Topic: ${topic}`
            : 'Your previous response was not valid JSON matching the schema (exactly 4 paragraphs, exactly 3 evaluations). Respond with ONLY the JSON object.';

        try {
          const generation = await deps.engine.generateWithEngine({
            prompt: userMessage,
            system: renderStoryPrompt(topic),
            timeoutMs: SYNTHESIS_TIMEOUT_MS
          });

          const validation = validateStory(safeParseJson(generation.text));
          if (validation.ok) {
            return { ok: true, story: validation.story, attempts: attempt };
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

export function renderStoryPrompt(topic: string): string {
  return STORY_ARCHITECT.template.replace(/\{topic\}/g, topic);
}

export type StoryValidation =
  | { ok: true; story: GeneratedStory }
  | { ok: false; reason: string };

export function validateStory(raw: unknown): StoryValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'model output was not a JSON object' };
  }
  const record = raw as Record<string, unknown>;

  const title = record['title'];
  const storyText = record['story_text'];
  const evaluations = record['evaluations'];

  if (typeof title !== 'string' || title.trim() === '') {
    return { ok: false, reason: 'missing required field: title' };
  }
  if (typeof storyText !== 'string' || storyText.trim() === '') {
    return { ok: false, reason: 'missing required field: story_text' };
  }
  const paragraphs = storyText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length !== 4) {
    return { ok: false, reason: `story_text must contain exactly 4 paragraphs (got ${paragraphs.length})` };
  }
  if (!Array.isArray(evaluations) || evaluations.length !== 3) {
    return { ok: false, reason: 'evaluations must hold exactly 3 entries' };
  }

  const questions: GeneratedStory['questions'] = [];
  for (const [index, entry] of evaluations.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, reason: `evaluation ${index + 1} is not an object` };
    }
    const evaluation = entry as Record<string, unknown>;
    const promptText = evaluation['question_text'];
    const solutionCriteria = evaluation['solution_vector'];
    if (
      typeof promptText !== 'string' ||
      promptText.trim() === '' ||
      typeof solutionCriteria !== 'string' ||
      solutionCriteria.trim() === ''
    ) {
      return { ok: false, reason: `evaluation ${index + 1} needs non-empty question_text and solution_vector` };
    }
    questions.push({
      questionIndex: index + 1,
      promptText: promptText.trim(),
      solutionCriteria: solutionCriteria.trim()
    });
  }

  return {
    ok: true,
    story: {
      title: title.trim().replace(/^["']+|["']+$/g, ''),
      storyText: paragraphs.join('\n\n'),
      questions
    }
  };
}
