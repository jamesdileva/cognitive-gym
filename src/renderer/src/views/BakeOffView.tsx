import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { AiStatusResponse } from '@shared/ai-types';
import { PROMPT_REGISTRY } from '@shared/prompts';
import { useBakeOff } from '../hooks/useBakeOff';
import type { BakeOffSide } from '../hooks/useBakeOff';

const NO_SYSTEM = '__none__';

function ModelSelect({
  value,
  onChange,
  models,
  disabled
}: {
  value: string;
  onChange: (model: string) => void;
  models: string[];
  disabled: boolean;
}): JSX.Element {
  // A persisted engine tag may not be installed locally — keep it visible
  // (flagged) instead of rendering a blank select.
  const options = models.includes(value) ? models : [...models, value];
  return (
    <select
      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.length === 0 && <option value={value}>{value || 'no models'}</option>}
      {options.map((model) => (
        <option key={model} value={model}>
          {model === value && !models.includes(model) ? `${model} (not installed)` : model}
        </option>
      ))}
    </select>
  );
}

function MetricsLine({ side }: { side: BakeOffSide }): JSX.Element | null {
  if (side.status !== 'done' || !side.result) return null;
  const { metrics } = side.result;
  return (
    <div className="mt-2 text-xs text-zinc-500">
      {metrics.latencyMs} ms · {metrics.completionTokens ?? '?'} tokens ·{' '}
      {metrics.tokensPerSecond !== null ? `${metrics.tokensPerSecond} tok/s` : 'tok/s n/a'} ·{' '}
      prompt: {metrics.promptTokens ?? '?'} tok
    </div>
  );
}

function SidePanel({ label, side }: { label: string; side: BakeOffSide }): JSX.Element {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="font-semibold text-zinc-300">{label}</h3>
      {side.status === 'idle' && <p className="text-sm text-zinc-500">Awaiting run.</p>}
      {side.status === 'running' && <p className="text-sm text-amber-400">Generating…</p>}
      {side.status === 'error' && (
        <div className="text-sm text-red-400">
          <p className="font-mono text-xs uppercase">{side.failure?.kind}</p>
          <p className="mt-1 text-zinc-400">{side.failure?.message}</p>
          {side.failure?.kind === 'unreachable' && (
            <p className="mt-1 text-zinc-500">Is Ollama running at localhost:11434?</p>
          )}
        </div>
      )}
      {side.status === 'done' && side.result && (
        <>
          <p className="mt-1 font-mono text-xs text-emerald-400">{side.result.model}</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-sm text-zinc-200">
            {side.result.text}
          </pre>
          <MetricsLine side={side} />
        </>
      )}
    </div>
  );
}

export default function BakeOffView(): JSX.Element {
  const { sides, isRunning, run } = useBakeOff();
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [prompt, setPrompt] = useState('Explain, in two sentences, why the sky is blue.');
  const [systemId, setSystemId] = useState<string>(NO_SYSTEM);
  const [leftModel, setLeftModel] = useState('');
  const [rightModel, setRightModel] = useState('');

  useEffect(() => {
    let cancelled = false;
    window.api
      .aiStatus()
      .then((response) => {
        if (cancelled) return;
        setStatus(response);
        // Default the duel to the persisted engine vs the first other model.
        // If the persisted engine tag is not installed locally, fall back to
        // the closest installed base (e.g. qwen2.5:7b -> qwen2.5:7b-instruct).
        const installed = response.models.includes(response.engine);
        const fallback =
          response.models.find((model) => model.split(':')[0] === response.engine.split(':')[0]) ??
          response.models[0] ??
          response.engine;
        const left = installed ? response.engine : fallback;
        setLeftModel(left);
        setRightModel(response.models.find((model) => model !== left) ?? left);
      })
      .catch(() => {
        if (!cancelled) setStatus({ engine: '', models: [], ollamaAvailable: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeEngine = async (model: string): Promise<void> => {
    const { engine } = await window.api.aiSetEngine(model);
    setStatus((prev) => (prev ? { ...prev, engine } : prev));
    setLeftModel(engine);
  };

  const handleRun = async (): Promise<void> => {
    await run(prompt, systemId === NO_SYSTEM ? undefined : systemId, leftModel, rightModel);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Bake-Off Panel</h1>
          <p className="text-sm text-zinc-500">
            Same prompt, both engines, side by side (architecture.md §7)
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Engine:
          <ModelSelect
            value={status?.engine ?? ''}
            models={status?.models ?? []}
            disabled={!status || isRunning}
            onChange={(model) => void changeEngine(model)}
          />
          {status && (
            <span className={status.ollamaAvailable ? 'text-emerald-400' : 'text-red-400'}>
              {status.ollamaAvailable ? 'ollama online' : 'ollama offline'}
            </span>
          )}
        </label>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          System prompt:
          <select
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
            value={systemId}
            onChange={(event) => setSystemId(event.target.value)}
          >
            <option value={NO_SYSTEM}>— none (raw prompt) —</option>
            {PROMPT_REGISTRY.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
        <textarea
          className="min-h-24 rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-200"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Paste the identical request to send to both models…"
        />
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <ModelSelect value={leftModel} onChange={setLeftModel} models={status?.models ?? []} disabled={isRunning} />
          <span className="text-zinc-600">vs</span>
          <ModelSelect value={rightModel} onChange={setRightModel} models={status?.models ?? []} disabled={isRunning} />
          <button
            className="ml-auto rounded bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isRunning || !prompt.trim() || !leftModel || !rightModel}
            onClick={() => void handleRun()}
          >
            {isRunning ? 'Running…' : 'Run bake-off'}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SidePanel label="Left" side={sides.left} />
        <SidePanel label="Right" side={sides.right} />
      </section>
    </div>
  );
}
