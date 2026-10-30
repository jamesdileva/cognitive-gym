import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { OllamaClient, OllamaError } from '@main/ollama/ollamaClient';

/** Minimal Ollama stand-in over a real HTTP server (roadmap: mocked server tests). */
async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

const servers: Server[] = [];
afterAll(() => {
  for (const server of servers) server.close();
});

describe('OllamaClient (against a mocked Ollama HTTP server)', () => {
  it('listModels returns installed model tags', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }] })
      );
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url });
    await expect(client.listModels()).resolves.toEqual(['qwen2.5:7b', 'llama3.1:8b']);
  });

  it('generate posts the payload and derives token metrics', async () => {
    let received = '';
    const { server, url } = await startServer((req, res) => {
      void readBody(req).then((body) => {
        received = body;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            model: 'qwen2.5:7b',
            response: 'Hello, gym.',
            done: true,
            prompt_eval_count: 12,
            eval_count: 34,
            eval_duration: 2_000_000_000
          })
        );
      });
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url });
    const result = await client.generate({ model: 'qwen2.5:7b', prompt: 'Say hi', system: 'be brief' });

    expect(JSON.parse(received)).toEqual({
      model: 'qwen2.5:7b',
      prompt: 'Say hi',
      system: 'be brief',
      stream: false
    });
    expect(result.text).toBe('Hello, gym.');
    expect(result.metrics.promptTokens).toBe(12);
    expect(result.metrics.completionTokens).toBe(34);
    expect(result.metrics.tokensPerSecond).toBe(17); // 34 tokens / 2 s
    expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('chat returns the assistant message content with metrics', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          model: 'llama3.1:8b',
          message: { role: 'assistant', content: 'Hello.' },
          done: true,
          eval_count: 5,
          eval_duration: 1_000_000_000
        })
      );
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url });
    const result = await client.chat({
      model: 'llama3.1:8b',
      messages: [{ role: 'user', content: 'hi' }]
    });
    expect(result.text).toBe('Hello.');
    expect(result.metrics.tokensPerSecond).toBe(5);
  });

  it('classifies HTTP errors with their status', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.writeHead(500);
      res.end('boom');
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url, timeoutMs: 2_000 });
    const error = await client.generate({ model: 'm', prompt: 'p' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect((error as OllamaError).kind).toBe('http_error');
    expect((error as OllamaError).status).toBe(500);
  });

  it('classifies a hanging server as timeout', async () => {
    const { server, url } = await startServer(() => {
      /* never respond */
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url, timeoutMs: 120 });
    const error = await client.generate({ model: 'm', prompt: 'p' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect((error as OllamaError).kind).toBe('timeout');
  });

  it('classifies non-JSON bodies as invalid_response', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.end('this is not json');
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url, timeoutMs: 2_000 });
    const error = await client.generate({ model: 'm', prompt: 'p' }).catch((e: unknown) => e);
    expect((error as OllamaError).kind).toBe('invalid_response');
  });

  it('classifies responses missing the promised fields as invalid_response', async () => {
    const { server, url } = await startServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ done: true }));
    });
    servers.push(server);

    const client = new OllamaClient({ baseUrl: url, timeoutMs: 2_000 });
    const error = await client.generate({ model: 'm', prompt: 'p' }).catch((e: unknown) => e);
    expect((error as OllamaError).kind).toBe('invalid_response');
  });

  it('classifies connection failures as unreachable', async () => {
    // Port 9 (discard) has no listener in the test environment.
    const client = new OllamaClient({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 2_000 });
    const error = await client.generate({ model: 'm', prompt: 'p' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect((error as OllamaError).kind).toBe('unreachable');
  });

  it('toAiResult maps success and typed failures into IPC envelopes', async () => {
    const { toAiResult } = await import('@main/ollama/ollamaClient');

    const ok = await toAiResult(
      Promise.resolve({
        text: 't',
        model: 'm',
        metrics: { latencyMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSecond: 1 }
      })
    );
    expect(ok).toEqual({
      ok: true,
      result: {
        text: 't',
        model: 'm',
        metrics: { latencyMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSecond: 1 }
      }
    });

    const failed = await toAiResult(Promise.reject(new OllamaError('timeout', 'slow', undefined)));
    expect(failed).toEqual({
      ok: false,
      failure: { kind: 'timeout', message: 'slow', status: undefined }
    });
  });
});
