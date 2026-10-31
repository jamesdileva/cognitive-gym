import { useCallback, useEffect, useState } from 'react';
import type { SynthesisReport } from '@shared/synthesis-types';
import type { IngestProgress } from '@shared/ingestion-types';

type SynthesisKind = 'stories' | 'math-templates';

const STAGE_LABEL: Record<SynthesisKind, string> = {
  stories: 'Writing hard sci-fi stories with your local model',
  'math-templates': 'Designing new math templates with your local model'
};

/**
 * Zero-source generation state (blueprint.md §1): batch-generate synthetic
 * stories (→ Reading Room) and math templates (→ Math Gym).
 */
export function useSynthesis() {
  const [running, setRunning] = useState<SynthesisKind | null>(null);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [reports, setReports] = useState<Record<SynthesisKind, SynthesisReport | null>>({
    stories: null,
    'math-templates': null
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.api.onIngestProgress(setProgress), []);

  const run = useCallback(async (kind: SynthesisKind, count: number): Promise<void> => {
    setError(null);
    setRunning(kind);
    setProgress(null);
    setReports((prev) => ({ ...prev, [kind]: null }));
    try {
      const outcome =
        kind === 'stories'
          ? await window.api.synthStories({ count })
          : await window.api.synthMath({ count });
      setReports((prev) => ({ ...prev, [kind]: outcome }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(null);
      setProgress(null);
    }
  }, []);

  return { running, progress, reports, error, run, stageLabel: STAGE_LABEL };
}
