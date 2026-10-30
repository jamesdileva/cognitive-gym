import { beforeEach, describe, expect, it } from 'vitest';
import type { GenerationResult } from '@shared/ai-types';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createAiEngineService, DEFAULT_ENGINE } from '@main/ollama/engine';
import type { GenerateRequest, OllamaClient } from '@main/ollama/ollamaClient';

/** Duck-typed client double — the service only needs listModels + generate. */
function fakeClient(overrides: {
  listModels?: () => Promise<string[]>;
  generate?: (req: GenerateRequest) => Promise<GenerationResult>;
} = {}): Pick<OllamaClient, 'listModels' | 'generate'> {
  return {
    listModels: overrides.listModels ?? (async () => ['qwen2.5:7b', 'llama3.1:8b']),
    generate:
      overrides.generate ??
      (async (req) => ({
        text: 'ok',
        model: req.model,
        metrics: { latencyMs: 1, promptTokens: 1, completionTokens: 1, tokensPerSecond: 1 }
      }))
  };
}

let db: GymDatabase;
beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('createAiEngineService', () => {
  it('defaults to the documented engine when nothing is persisted', () => {
    const service = createAiEngineService(db, fakeClient());
    expect(service.getEngine()).toBe(DEFAULT_ENGINE);
    expect(DEFAULT_ENGINE).toBe('qwen2.5:7b');
  });

  it('persists engine switches in app_settings (survives service recreation)', () => {
    const first = createAiEngineService(db, fakeClient());
    first.setEngine('llama3.1:8b');
    expect(first.getEngine()).toBe('llama3.1:8b');

    // A fresh service over the same DB must read the persisted choice.
    const second = createAiEngineService(db, fakeClient());
    expect(second.getEngine()).toBe('llama3.1:8b');
  });

  it('rejects empty engine names', () => {
    const service = createAiEngineService(db, fakeClient());
    expect(() => service.setEngine('   ')).toThrow(/non-empty/);
  });

  it('status reports availability and installed models', async () => {
    const service = createAiEngineService(db, fakeClient({ listModels: async () => ['m1'] }));
    await expect(service.status()).resolves.toEqual({
      engine: 'qwen2.5:7b',
      models: ['m1'],
      ollamaAvailable: true
    });
  });

  it('status degrades gracefully when Ollama is unreachable', async () => {
    const service = createAiEngineService(db, fakeClient({ listModels: async () => {
      throw new Error('ECONNREFUSED');
    } }));
    await expect(service.status()).resolves.toEqual({
      engine: 'qwen2.5:7b',
      models: [],
      ollamaAvailable: false
    });
  });

  it('generateWithEngine binds generation to the persisted engine', async () => {
    const seen: string[] = [];
    const service = createAiEngineService(
      db,
      fakeClient({
        generate: async (req) => {
          seen.push(req.model);
          return {
            text: 'ok',
            model: req.model,
            metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
          };
        }
      })
    );
    service.setEngine('llama3.1:8b');
    await service.generateWithEngine({ prompt: 'hello' });
    expect(seen).toEqual(['llama3.1:8b']);
  });
});
