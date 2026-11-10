import { describe, expect, it, vi } from 'vitest';
import { OllamaClient } from '@main/ollama/ollamaClient';

/**
 * Streaming NDJSON tests: a mock fetch whose body is a ReadableStream of
 * NDJSON lines, split at awkward boundaries to prove the line buffer works.
 */
function ndjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    }
  });
}

/** Split lines at awkward byte boundaries to stress the line buffer. */
function chunkedStream(lines: string[], chunkSize: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const all = encoder.encode(lines.map((l) => l + '\n').join(''));
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < all.length; i += chunkSize) {
        controller.enqueue(all.slice(i, i + chunkSize));
      }
      controller.close();
    }
  });
}

function responseFrom(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const DONE_LINE = JSON.stringify({
  model: 'qwen2.5vl:3b',
  done: true,
  prompt_eval_count: 10,
  eval_count: 25,
  eval_duration: 5_000_000_000
});

describe('OllamaClient streaming (NDJSON over fetch)', () => {
  it('generateStream emits tokens and returns full metrics from the done line', async () => {
    const fetchImpl = vi.fn(async () =>
      responseFrom(
        ndjsonStream([
          JSON.stringify({ model: 'qwen2.5vl:3b', response: 'Hello', done: false }),
          JSON.stringify({ model: 'qwen2.5vl:3b', response: ' gym', done: false }),
          DONE_LINE
        ])
      )
    ) as unknown as typeof fetch;

    const tokens: string[] = [];
    const client = new OllamaClient({ baseUrl: 'http://x' }, fetchImpl);
    const result = await client.generateStream({
      model: 'qwen2.5vl:3b',
      prompt: 'hi',
      onToken: (t) => tokens.push(t)
    });

    expect(tokens).toEqual(['Hello', ' gym']);
    expect(result.text).toBe('Hello gym');
    expect(result.metrics.completionTokens).toBe(25);
    expect(result.metrics.tokensPerSecond).toBe(5); // 25 tokens / 5 s
  });

  it('chatStream accumulates message.content tokens', async () => {
    const fetchImpl = vi.fn(async () =>
      responseFrom(
        ndjsonStream([
          JSON.stringify({ message: { role: 'assistant', content: 'He' }, done: false }),
          JSON.stringify({ message: { role: 'assistant', content: 'llo' }, done: false }),
          DONE_LINE
        ])
      )
    ) as unknown as typeof fetch;

    const client = new OllamaClient({ baseUrl: 'http://x' }, fetchImpl);
    const result = await client.chatStream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }]
    });
    expect(result.text).toBe('Hello');
  });

  it('reassembles lines split across arbitrary byte boundaries', async () => {
    const fetchImpl = vi.fn(async () =>
      responseFrom(
        chunkedStream(
          [
            JSON.stringify({ model: 'm', response: 'AAA', done: false }),
            JSON.stringify({ model: 'm', response: 'BBB', done: false }),
            DONE_LINE
          ],
          7 // splits mid-JSON
        )
      )
    ) as unknown as typeof fetch;

    const tokens: string[] = [];
    const client = new OllamaClient({ baseUrl: 'http://x' }, fetchImpl);
    const result = await client.generateStream({
      model: 'm',
      prompt: 'p',
      onToken: (t) => tokens.push(t)
    });

    expect(result.text).toBe('AAABBB');
    expect(tokens.join('')).toBe('AAABBB');
  });

  it('skips garbage lines instead of crashing', async () => {
    const fetchImpl = vi.fn(async () =>
      responseFrom(
        ndjsonStream(['not json at all', JSON.stringify({ response: 'ok', done: false }), DONE_LINE])
      )
    ) as unknown as typeof fetch;

    const client = new OllamaClient({ baseUrl: 'http://x' }, fetchImpl);
    const result = await client.generateStream({ model: 'm', prompt: 'p' });
    expect(result.text).toBe('ok');
  });

  it('aborts with a timeout when the stream stalls', async () => {
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ response: 'x', done: false })));
          // never enqueue again, never close
        }
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const client = new OllamaClient({ baseUrl: 'http://x', streamIdleTimeoutMs: 80 }, fetchImpl);
    await expect(client.generateStream({ model: 'm', prompt: 'p' })).rejects.toMatchObject({
      kind: 'timeout'
    });
  });
});
