import { useCallback, useEffect, useState } from 'react';
import type {
  DailyFeed,
  EpisodeQuestion,
  EpisodeTrack,
  EpisodicIngestReport,
  EpisodicIngestRequest
} from '@shared/episodes-types';
import type { IngestProgress } from '@shared/ingestion-types';

/**
 * Daily reader state: track list, today's episode, questions, streak advance,
 * plus the episodic ingestion flow.
 */
export function useReader() {
  const [tracks, setTracks] = useState<EpisodeTrack[]>([]);
  const [feed, setFeed] = useState<DailyFeed | null>(null);
  const [questions, setQuestions] = useState<EpisodeQuestion[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [report, setReport] = useState<EpisodicIngestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshTracks = useCallback(async (): Promise<void> => {
    const { tracks: fresh } = await window.api.epTracks();
    setTracks(fresh);
  }, []);

  useEffect(() => {
    void refreshTracks();
    return window.api.onIngestProgress(setProgress);
  }, [refreshTracks]);

  const openTrack = useCallback(async (bookTitle: string): Promise<void> => {
    const { feed: daily } = await window.api.epFeed({ bookTitle });
    setFeed(daily);
    setQuestions([]);
    if (daily.episode?.contentUuid) {
      const { questions: stored } = await window.api.epQuestions({
        contentUuid: daily.episode.contentUuid
      });
      setQuestions(stored);
    }
  }, []);

  const markRead = useCallback(async (): Promise<void> => {
    if (!feed) return;
    await window.api.epFinish({ bookTitle: feed.bookTitle });
    // Reload at the advanced streak position; the feed shows the next episode
    // (or the completion state when the track is finished).
    await openTrack(feed.bookTitle);
  }, [feed, openTrack]);

  const closeTrack = useCallback((): void => {
    setFeed(null);
    setQuestions([]);
  }, []);

  const ingest = useCallback(
    async (request: Omit<EpisodicIngestRequest, 'path'> & { path: string | null }): Promise<void> => {
      if (!request.path) return;
      setError(null);
      setReport(null);
      setRunning(true);
      setProgress(null);
      try {
        const outcome = await window.api.epIngest(request as EpisodicIngestRequest);
        setReport(outcome);
        await refreshTracks();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setRunning(false);
        setProgress(null);
      }
    },
    [refreshTracks]
  );

  return {
    tracks,
    feed,
    questions,
    running,
    progress,
    report,
    error,
    openTrack,
    markRead,
    closeTrack,
    ingest
  };
}
