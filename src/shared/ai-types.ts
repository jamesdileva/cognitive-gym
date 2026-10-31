/**
 * AI request/response contract shared by main, preload, and renderer.
 * All Ollama-bound calls flow through these types.
 */

/** Token/speed metrics from a completed Ollama generation. */
export interface GenerationMetrics {
  /** Wall-clock time of the whole request, main-process measured. */
  latencyMs: number;
  /** Prompt tokens evaluated by the model, if reported. */
  promptTokens: number | null;
  /** Generated tokens, if reported. */
  completionTokens: number | null;
  /** completionTokens / generation-seconds, if computable. */
  tokensPerSecond: number | null;
}

/** A successful generation. */
export interface GenerationResult {
  text: string;
  model: string;
  metrics: GenerationMetrics;
}

/** Why an AI call failed. Classified by OllamaClient; survives IPC as a tag. */
export type OllamaFailureKind =
  | 'unreachable' // nothing listening at baseUrl
  | 'http_error' // Ollama answered with a non-2xx status
  | 'timeout' // request exceeded its time budget
  | 'aborted' // caller cancelled
  | 'invalid_response' // body was not the JSON shape Ollama promises
  | 'missing_criteria'; // domain failure: no stored solution vector to grade against

export interface AiFailure {
  kind: OllamaFailureKind;
  message: string;
  status?: number;
}

/**
 * AI calls cross IPC as structured envelopes instead of thrown errors:
 * custom error classes do not survive the bridge (prototypes are stripped).
 */
export type AiResult = { ok: true; result: GenerationResult } | { ok: false; failure: AiFailure };

export interface AiGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  /** Per-request override of the client's default generation budget (ms). */
  timeoutMs?: number;
}

export interface AiStatusResponse {
  /** Currently selected engine model (persisted in app_settings). */
  engine: string;
  /** Model tags installed in the local Ollama instance ([] when unreachable). */
  models: string[];
  /** False when Ollama is not running / unreachable. */
  ollamaAvailable: boolean;
}
