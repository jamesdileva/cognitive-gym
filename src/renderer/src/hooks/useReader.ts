import { useCallback, useEffect, useState } from 'react';
import type {
  DailyFeed,
  EpisodeQuestion,
  EpisodeSummary,
  EpisodeTrack,
  EpisodicIngestReport,
  EpisodicIngestRequest
} from '@shared/episodes-types';
import type { IngestProgress } from '@shared/ingestion-types';

/**
 * Daily reader state: track list, today's episode, questions, streak advance,
 * episode revisiting, plus the episodic ingestion flow.
 */
export function useReader() {
  const [tracks, setTracks] = useState<EpisodeTrack[]>([]);
  const [feed, setFeed] = useState<DailyFeed | null>(null);
  const [questions, setQuestions] = useState<EpisodeQuestion[]>([]);
  const [browse, setBrowse] = useState<EpisodeSummary[]>([]);
  const [browseBook, setBrowseBook] = useState<string | null>(null);
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

  const loadQuestions = useCallback(async (contentUuid: string | null | undefined): Promise<void> => {
    setQuestions([]);
    if (contentUuid) {
      const { questions: stored } = await window.api.epQuestions({ contentUuid });
      setQuestions(stored);
    }
  }, []);

  const openTrack = useCallback(
    async (bookTitle: string, episodeNumber?: number): Promise<void> => {
      const { feed: daily } = await window.api.epFeed({ bookTitle, episodeNumber });
      setFeed(daily);
      setBrowse([]);
      await loadQuestions(daily.episode?.contentUuid);
    },
    [loadQuestions]
  );

  const openBrowse = useCallback(async (bookTitle: string): Promise<void> => {
    const { episodes } = await window.api.epList({ bookTitle });
    setBrowse(episodes);
    setBrowseBook(bookTitle);
    setFeed(null);
    setQuestions([]);
  }, []);

  const markRead = useCallback(async (): Promise<void> => {
    if (!feed || feed.revisit) return;
    await window.api.epFinish({ bookTitle: feed.bookTitle });
    // Reload at the advanced streak position; the feed shows the next episode
    // (or the completion state when the track is finished).
    await openTrack(feed.bookTitle);
  }, [feed, openTrack]);

  const closeTrack = useCallback((): void => {
    setFeed(null);
    setBrowse([]);
    setBrowseBook(null);
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
    browse,
    browseBook,
    running,
    progress,
    report,
    error,
    openTrack,
    openBrowse,
    markRead,
    closeTrack,
    ingest
  };
}
