import { useCallback, useEffect, useState } from 'react';
import type { IngestProgress, IngestionReport, IngestedSourceSummary } from '@shared/ingestion-types';

/**
 * Library + ingestion state: pick a book, watch progress, read the report,
 * manage ingested sources.
 */
export function useIngestion() {
  const [sources, setSources] = useState<IngestedSourceSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [report, setReport] = useState<IngestionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const { sources: fresh } = await window.api.ingestLibrary();
    setSources(fresh);
  }, []);

  useEffect(() => {
    void refresh();
    // Subscribe for the lifetime of the view; resubscribing is cheap.
    return window.api.onIngestProgress(setProgress);
  }, [refresh]);

  const selectAndRun = useCallback(
    async (maxChunks?: number): Promise<void> => {
      setError(null);
      setReport(null);
      const { path } = await window.api.ingestSelectFile();
      if (!path) return;

      setRunning(true);
      setProgress(null);
      try {
        const outcome = await window.api.ingestRun({ path, maxChunks });
        setReport(outcome);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setRunning(false);
        setProgress(null);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (sourceTitle: string): Promise<void> => {
      await window.api.ingestDelete({ sourceTitle });
      await refresh();
    },
    [refresh]
  );

  return { sources, running, progress, report, error, selectAndRun, remove, refresh };
}
