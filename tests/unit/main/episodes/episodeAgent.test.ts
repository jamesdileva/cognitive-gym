import { describe, expect, it, vi } from 'vitest';
import { OllamaError } from '@main/ollama/ollamaClient';
import { createEpisodeAgent, validateEpisodeMeta } from '@main/episodes/episodeAgent';

function makeEngine(outputs: string[]) {
  const calls: { prompt: string; system?: string }[] = [];
  const queue = [...outputs];
  const engine = {
    generateWithEngine: vi.fn(async (request: { prompt: string; system?: string }) => {
      calls.push(request);
      const next = queue.shift();
      if (next === undefined) throw new Error('script exhausted');
      return {
        text: next,
        model: 'test-model',
        metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
      };
    })
  };
  return { engine, calls };
}

const chunk = 'The keeper climbed the stair. The lamp answered. '.repeat(12);

describe('createEpisodeAgent', () => {
  it('returns title and recap from valid JSON on the first attempt', async () => {
    const { engine, calls } = makeEngine([
      JSON.stringify({ episode_title: 'The Long Stair', recap: 'The keeper resumed his watch.' })
    ]);

    const outcome = await createEpisodeAgent({ engine }).ingestEpisodeMeta(chunk);
    expect(outcome).toEqual({
      ok: true,
      meta: { episodeTitle: 'The Long Stair', recap: 'The keeper resumed his watch.' },
      attempts: 1
    });
    // The registry's episodic rules plus the JSON output spec are both sent.
    expect(calls[0].system).toContain('300 to 600 words');
    expect(calls[0].system).toContain('episode_title');
    expect(calls[0].prompt).toBe(chunk);
  });

  it('strips wrapping quotes from model titles', async () => {
    const { engine } = makeEngine([
      JSON.stringify({ episode_title: '"The Long Stair"', recap: 'Hook line.' })
    ]);
    const outcome = await createEpisodeAgent({ engine }).ingestEpisodeMeta(chunk);
    expect(outcome.ok && outcome.meta.episodeTitle).toBe('The Long Stair');
  });

  it('retries malformed output with corrective feedback', async () => {
    const { engine, calls } = makeEngine([
      'Here is a lovely paragraph instead of JSON…',
      JSON.stringify({ episode_title: 'Recovered', recap: 'Second attempt worked.' })
    ]);

    const outcome = await createEpisodeAgent({ engine }).ingestEpisodeMeta(chunk);
    expect(outcome).toMatchObject({ ok: true, attempts: 2 });
    expect(calls[1].prompt).toContain('previous response was not valid JSON');
  });

  it('fails after exhausting attempts and skips retries when unreachable', async () => {
    const { engine } = makeEngine(['nope', 'nope', 'nope']);
    expect(await createEpisodeAgent({ engine }).ingestEpisodeMeta(chunk)).toMatchObject({
      ok: false,
      attempts: 3
    });

    const down = {
      generateWithEngine: vi.fn(async () => {
        throw new OllamaError('unreachable', 'ECONNREFUSED');
      })
    };
    expect(await createEpisodeAgent({ engine: down }).ingestEpisodeMeta(chunk)).toMatchObject({
      ok: false,
      attempts: 1
    });
    expect(down.generateWithEngine).toHaveBeenCalledOnce();
  });
});

describe('validateEpisodeMeta', () => {
  it('rejects missing fields and non-objects', () => {
    expect(validateEpisodeMeta('prose').ok).toBe(false);
    expect(validateEpisodeMeta({ episode_title: 'x' }).ok).toBe(false);
    expect(validateEpisodeMeta({ episode_title: '', recap: 'y' }).ok).toBe(false);
  });
});
