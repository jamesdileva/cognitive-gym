import type { AiStatusResponse } from '@shared/ai-types';
import type { GymDatabase } from '../db/database';
import { createAppSettingsRepo } from '../db/repositories/appSettingsRepo';
import type { OllamaClient, GenerateRequest } from './ollamaClient';

export const ENGINE_SETTING_KEY = 'ollama.engine';
export const DEFAULT_ENGINE = 'qwen2.5:7b';

/**
 * Live engine switching (architecture.md §7): the selected model is persisted
 * in app_settings and applied at call time — never hardcoded. The model list
 * and availability always reflect the real Ollama instance.
 */
export function createAiEngineService(
  db: GymDatabase,
  client: Pick<OllamaClient, 'listModels' | 'generate'>
) {
  const settings = createAppSettingsRepo(db);

  const getEngine = (): string => settings.get(ENGINE_SETTING_KEY) ?? DEFAULT_ENGINE;

  return {
    getEngine,

    /** Persists the engine selection. Returns the effective value. */
    setEngine(model: string): { engine: string } {
      const trimmed = model.trim();
      if (!trimmed) {
        throw new Error('Engine model must be a non-empty string');
      }
      settings.set(ENGINE_SETTING_KEY, trimmed);
      return { engine: trimmed };
    },

    /** Status snapshot for the renderer: engine + installed models + availability. */
    async status(): Promise<AiStatusResponse> {
      let models: string[] = [];
      let ollamaAvailable = false;
      try {
        models = await client.listModels(5_000);
        ollamaAvailable = true;
      } catch {
        // Ollama down or slow to respond — surface as unavailable, not an error.
      }
      return { engine: getEngine(), models, ollamaAvailable };
    },

    /** Generation bound to the persisted engine (for module code paths). */
    generateWithEngine(request: Omit<GenerateRequest, 'model'>) {
      return client.generate({ ...request, model: getEngine() });
    }
  };
}

export type AiEngineService = ReturnType<typeof createAiEngineService>;
