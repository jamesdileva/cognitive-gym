import { safeParseJson } from '@shared/parseJson';
import { EPISODIC_CHUNKER } from '@shared/prompts';
import type { AiEngineService } from '../ollama/engine';
import { OllamaError } from '../ollama/ollamaClient';

/** 7B models need real time; a two-field JSON answer is quick but not instant. */
const AGENT_TIMEOUT_MS = 180_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Output contract appended to the registry's episodic-chunker prompt
 * (the doc prompt defines the editorial rules; the pipeline needs strict JSON).
 */
const OUTPUT_SPEC = `

OUTPUT FORMAT:
Respond with ONLY a strict JSON object — no markdown fences, no commentary:
{"episode_title": "…", "recap": "…"}
"recap" is one single sentence: a "previously on" recap for an ordered chapter, or a premise hook for an independent story.`;

export interface EpisodeMeta {
  episodeTitle: string;
  recap: string;
}

export type EpisodeMetaOutcome =
  | { ok: true; meta: EpisodeMeta; attempts: number }
  | { ok: false; reason: string; attempts: number };

export interface EpisodeAgentDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
}

/**
 * Episodic chunking agent (book-to-shortstories.md): turns a raw reading chunk
 * into a standalone-feeling episode with a title and a recap/hook. Model output
 * is untrusted — parsed defensively, validated, retried with feedback.
 */
export function createEpisodeAgent(deps: EpisodeAgentDeps) {
  return {
    async ingestEpisodeMeta(chunk: string, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<EpisodeMetaOutcome> {
      let lastReason = 'unknown error';

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const userMessage =
          attempt === 1
            ? chunk
            : `${chunk}\n\nIMPORTANT: Your previous response was not valid JSON matching the schema. Respond with ONLY the JSON object.`;

        try {
          const generation = await deps.engine.generateWithEngine({
            prompt: userMessage,
            system: EPISODIC_CHUNKER.template + OUTPUT_SPEC,
            timeoutMs: AGENT_TIMEOUT_MS
          });

          const validation = validateEpisodeMeta(safeParseJson(generation.text));
          if (validation.ok) {
            return { ok: true, meta: validation.meta, attempts: attempt };
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

export type EpisodeMetaValidation =
  | { ok: true; meta: EpisodeMeta }
  | { ok: false; reason: string };

export function validateEpisodeMeta(raw: unknown): EpisodeMetaValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'model output was not a JSON object' };
  }
  const record = raw as Record<string, unknown>;
  const title = record['episode_title'];
  const recap = record['recap'];

  if (typeof title !== 'string' || title.trim() === '') {
    return { ok: false, reason: 'missing required field: episode_title' };
  }
  if (typeof recap !== 'string' || recap.trim() === '') {
    return { ok: false, reason: 'missing required field: recap' };
  }
  return {
    ok: true,
    meta: { episodeTitle: title.trim().replace(/^["']+|["']+$/g, ''), recap: recap.trim() }
  };
}
