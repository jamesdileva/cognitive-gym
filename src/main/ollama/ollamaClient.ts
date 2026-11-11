import type {
  AiResult,
  GenerationMetrics,
  GenerationResult,
  OllamaFailureKind
} from '@shared/ai-types';

export class OllamaError extends Error {
  constructor(
    readonly kind: OllamaFailureKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

export interface OllamaClientConfig {
  /** Ollama REST root. Defaults to the standard local engine port. */
  baseUrl?: string;
  /** Default generation time budget in ms (local 7B models can be slow). */
  timeoutMs?: number;
  /** Idle timeout for streams: aborts when no bytes arrive for this long. */
  streamIdleTimeoutMs?: number;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  timeoutMs?: number;
}

export interface StreamHandlers {
  /** Called per token as it arrives. Errors inside the callback propagate. */
  onToken?: (token: string) => void;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Base64-encoded images for vision-language models (Ollama image API). */
  images?: string[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  timeoutMs?: number;
}

interface OllamaDoneFields {
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaStreamLine extends OllamaDoneFields {
  model?: string;
  response?: string;
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaGenerateResponse extends OllamaDoneFields {
  model: string;
  response: string;
  done: boolean;
}

interface OllamaChatResponse extends OllamaDoneFields {
  model: string;
  message?: { role: string; content: string };
  done: boolean;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT'
]);

/**
 * The single wrapper around the local Ollama REST API (architecture.md §7).
 * Non-streaming for now — streaming is deferred to the Sprint 7 chat UI.
 * `fetchImpl` exists for tests; production uses the platform fetch.
 */
export class OllamaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number;
  private readonly streamIdleTimeoutMs: number;

  constructor(
    private readonly config: OllamaClientConfig = {},
    fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {
    this.fetchImpl = fetchImpl;
    this.defaultTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'http://localhost:11434';
  }

  /** Installed model tags (e.g., ["qwen2.5:7b", "llama3.1:8b"]). */
  async listModels(timeoutMs: number = this.defaultTimeoutMs): Promise<string[]> {
    const { body } = await this.requestJson<{ models?: { name: string }[] }>(
      `${this.baseUrl}/api/tags`,
      { method: 'GET' },
      timeoutMs
    );
    if (!Array.isArray(body.models)) {
      throw new OllamaError('invalid_response', 'Ollama /api/tags response has no models array');
    }
    return body.models.map((entry) => entry.name);
  }

  async generate(request: GenerateRequest): Promise<GenerationResult> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const { body, latencyMs } = await this.requestJson<OllamaGenerateResponse>(
      `${this.baseUrl}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          system: request.system,
          stream: false
        })
      },
      timeoutMs
    );

    if (typeof body.response !== 'string') {
      throw new OllamaError('invalid_response', 'Ollama generate response has no text field');
    }
    return {
      text: body.response,
      model: body.model ?? request.model,
      metrics: extractMetrics(body, latencyMs)
    };
  }

  async chat(request: ChatRequest): Promise<GenerationResult> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const { body, latencyMs } = await this.requestJson<OllamaChatResponse>(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: request.model, messages: request.messages, stream: false })
      },
      timeoutMs
    );

    const content = body.message?.content;
    if (typeof content !== 'string') {
      throw new OllamaError('invalid_response', 'Ollama chat response has no message content');
    }
    return {
      text: content,
      model: body.model ?? request.model,
      metrics: extractMetrics(body, latencyMs)
    };
  }

  /** Streaming variant of {@link generate} — calls `onToken` per NDJSON token. */
  async generateStream(
    request: GenerateRequest & StreamHandlers,
    fetchImpl?: typeof fetch
  ): Promise<GenerationResult> {
    const { text, model, metrics } = await this.streamJson(
      `${this.baseUrl}/api/generate`,
      {
        model: request.model,
        prompt: request.prompt,
        system: request.system,
        stream: true
      },
      (line) => line.response ?? '',
      this.streamIdleTimeoutMs,
      request.onToken,
      fetchImpl ?? this.fetchImpl
    );
    return { text, model: model ?? request.model, metrics };
  }

  /** Streaming variant of {@link chat} — calls `onToken` per NDJSON token. */
  async chatStream(
    request: ChatRequest & StreamHandlers,
    fetchImpl?: typeof fetch
  ): Promise<GenerationResult> {
    const { text, model, metrics } = await this.streamJson(
      `${this.baseUrl}/api/chat`,
      {
        model: request.model,
        messages: request.messages,
        stream: true
      },
      (line) => line.message?.content ?? '',
      this.streamIdleTimeoutMs,
      request.onToken,
      fetchImpl ?? this.fetchImpl
    );
    return { text, model: model ?? request.model, metrics };
  }

  /**
   * Shared NDJSON stream reader. Idle-timeout based: the abort timer resets on
   * every received chunk, so slow-but-flowing generation never trips the
   * budget while a stalled engine still gets cut off.
   */
  private async streamJson(
    url: string,
    body: Record<string, unknown>,
    tokenOf: (line: OllamaStreamLine) => string,
    idleTimeoutMs: number,
    onToken: ((token: string) => void) | undefined,
    fetchImpl: typeof fetch
  ): Promise<{ text: string; model?: string; metrics: GenerationMetrics }> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const armIdle = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, idleTimeoutMs);
    };
    armIdle();

    // Resolves null when the abort signal fires — raced against body reads so
    // a stalled stream (mocked or real) is cut off by the idle timer.
    const abortSignalPromise: Promise<null> = new Promise((resolve) => {
      if (controller.signal.aborted) {
        resolve(null);
        return;
      }
      controller.signal.addEventListener('abort', () => resolve(null), { once: true });
    });

    const startedAt = performance.now();
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: true }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new OllamaError(
          'http_error',
          `Ollama responded with HTTP ${response.status} for ${url}`,
          response.status
        );
      }
      if (!response.body) {
        throw new OllamaError('invalid_response', 'Ollama stream returned no body');
      }

      let text = '';
      let model: string | undefined;
      let doneLine: OllamaStreamLine | null = null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const readResult = await Promise.race([reader.read(), abortSignalPromise]);
        if (readResult === null) {
          // The controller aborted (stall or external cancel).
          break;
        }
        const { done, value } = readResult;
        if (done) break;
        armIdle();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          let parsed: OllamaStreamLine;
          try {
            parsed = JSON.parse(trimmed) as OllamaStreamLine;
          } catch {
            continue; // tolerate partial/garbage lines in the stream
          }
          if (parsed.done === true) {
            doneLine = parsed;
            break;
          }
          if (parsed.model) model = parsed.model;
          const token = tokenOf(parsed);
          if (token) {
            text += token;
            onToken?.(token);
          }
        }
        if (doneLine !== null) break;
      }
      if (timer) clearTimeout(timer);

      if (doneLine === null) {
        // Distinguish our idle-timeout abort from an external cancel.
        if (controller.signal.aborted) {
          throw timedOut
            ? new OllamaError('timeout', `Ollama stream stalled past its ${idleTimeoutMs}ms idle budget: ${url}`)
            : new OllamaError('aborted', 'Ollama stream was cancelled');
        }
        throw new OllamaError('invalid_response', 'Ollama stream ended without a done marker');
      }
      return {
        text,
        model,
        metrics: extractMetrics(doneLine, Math.round(performance.now() - startedAt))
      };
    } catch (error) {
      throw classifyOllamaFailure(error, timedOut, url, this.baseUrl, this.defaultTimeoutMs);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<{ body: T; latencyMs: number }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const startedAt = performance.now();
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });

      if (!response.ok) {
        throw new OllamaError(
          'http_error',
          `Ollama responded with HTTP ${response.status} for ${url}`,
          response.status
        );
      }

      let body: T;
      try {
        body = (await response.json()) as T;
      } catch {
        throw new OllamaError('invalid_response', `Ollama returned non-JSON body for ${url}`);
      }
      return { body, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      throw classifyOllamaFailure(error, timedOut, url, this.baseUrl, timeoutMs);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Shared failure classifier for requestJson and streamJson. */
function classifyOllamaFailure(
  error: unknown,
  timedOut: boolean,
  url: string,
  baseUrl: string,
  budgetMs: number
): Error {
  if (error instanceof OllamaError) return error;
  if (timedOut) {
    return new OllamaError('timeout', `Ollama request exceeded its ${budgetMs}ms budget: ${url}`);
  }
  const cause = error as { cause?: { code?: string }; code?: string };
  const code = cause?.cause?.code ?? cause?.code;
  if (typeof code === 'string' && UNREACHABLE_CODES.has(code)) {
    return new OllamaError('unreachable', `Cannot reach Ollama at ${baseUrl} (${code})`);
  }
  return new OllamaError('unreachable', `Ollama request failed: ${String(error)}`);
}

/** Derives token metrics from Ollama's done-fields (durations are nanoseconds). */
function extractMetrics(done: OllamaDoneFields, latencyMs: number): GenerationMetrics {
  const promptTokens = typeof done.prompt_eval_count === 'number' ? done.prompt_eval_count : null;
  const completionTokens = typeof done.eval_count === 'number' ? done.eval_count : null;
  const evalDurationS =
    typeof done.eval_duration === 'number' && done.eval_duration > 0
      ? done.eval_duration / 1e9
      : null;
  const tokensPerSecond =
    completionTokens !== null && evalDurationS !== null ? completionTokens / evalDurationS : null;

  return {
    latencyMs,
    promptTokens,
    completionTokens,
    tokensPerSecond: tokensPerSecond === null ? null : Math.round(tokensPerSecond * 10) / 10
  };
}

/**
 * Maps a generation promise into the structured envelope used across IPC —
 * custom error classes do not survive the bridge, only their data does.
 */
export function toAiResult(promise: Promise<GenerationResult>): Promise<AiResult> {
  return promise.then(
    (result) => ({ ok: true, result }) as AiResult,
    (error: unknown) => ({
      ok: false,
      failure: {
        kind: error instanceof OllamaError ? error.kind : 'unreachable',
        message: error instanceof Error ? error.message : String(error),
        status: error instanceof OllamaError ? error.status : undefined
      }
    })
  );
}
