import { access } from 'node:fs/promises';
import type {
  DailyFeed,
  EpisodeQuestion,
  EpisodeTrack,
  EpisodicIngestReport
} from '@shared/episodes-types';
import type { IngestProgress } from '@shared/ingestion-types';
import type { BookEpisodesRepo } from '../db/repositories/bookEpisodesRepo';
import type { ContentPoolRepo } from '../db/repositories/contentPoolRepo';
import type { ReadingStreaksRepo } from '../db/repositories/readingStreaksRepo';
import type { AiEngineService } from '../ollama/engine';
import { chunkParagraphs } from '../ingestion/chunker';
import { createDistiller } from '../ingestion/distiller';
import { bookKindForPath, extractDocument } from '../ingestion/extract';
import { createEpisodeAgent } from './episodeAgent';
import { buildFeed, nextEpisodeInFeed } from './feed';

export interface EpisodeServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  bookEpisodes: BookEpisodesRepo;
  contentPool: ContentPoolRepo;
  streaks: ReadingStreaksRepo;
}

export interface RunEpisodeIngestOptions {
  isCanonical: boolean;
  maxEpisodes?: number;
  onProgress?: (progress: IngestProgress) => void;
}

/**
 * Episodic pipeline (book-to-shortstories.md): a book file becomes a daily
 * episode track. Per chunk, two local-model calls run: the episodic chunking
 * agent (title + recap) and the distiller (3 comprehension questions, stored
 * in content_pool as "<title> (episodes)" — the distinct source title keeps
 * episode content separate from plain Library ingestion of the same book).
 */
export function createEpisodeService(deps: EpisodeServiceDeps) {
  const agent = createEpisodeAgent({ engine: deps.engine });
  const distiller = createDistiller({ engine: deps.engine });

  return {
    listTracks(): EpisodeTrack[] {
      return deps.bookEpisodes.listBooks().map((book) => {
        const isCanonical = deps.bookEpisodes.bookTrack(book.book_title) ?? true;
        const streak = deps.streaks.get(book.book_title);
        return {
          bookTitle: book.book_title,
          episodeCount: book.episode_count,
          isCanonical,
          currentEpisode: streak?.current_episode ?? 1,
          lastReadDate: streak?.last_read_date ?? null
        };
      });
    },

    getDailyFeed(bookTitle: string): DailyFeed {
      const isCanonical = deps.bookEpisodes.bookTrack(bookTitle) ?? true;
      const episodes = deps.bookEpisodes.listEpisodes(bookTitle);
      const feed = buildFeed(
        episodes.map((episode) => episode.episode_number),
        isCanonical,
        bookTitle
      );
      const streak = deps.streaks.ensure(bookTitle);

      const episodeNumber = nextEpisodeInFeed(feed, streak.current_episode);
      const row = episodeNumber === null ? undefined : deps.bookEpisodes.getEpisode(bookTitle, episodeNumber);

      return {
        bookTitle,
        isCanonical,
        position: Math.min(streak.current_episode, feed.length),
        total: feed.length,
        episode:
          row === undefined
            ? null
            : {
                episodeNumber: row.episode_number,
                episodeTitle: row.episode_title ?? `Episode ${row.episode_number}`,
                recap: row.episodeRecap ?? '',
                text: row.content_text,
                contentUuid: row.contentUuid
              }
      };
    },

    /** Marks today's episode read and advances the streak. */
    finishEpisode(bookTitle: string): { nextEpisodeNumber: number | null } {
      const isCanonical = deps.bookEpisodes.bookTrack(bookTitle) ?? true;
      const episodes = deps.bookEpisodes.listEpisodes(bookTitle);
      const feed = buildFeed(
        episodes.map((episode) => episode.episode_number),
        isCanonical,
        bookTitle
      );

      const streak = deps.streaks.advance(bookTitle);
      return { nextEpisodeNumber: nextEpisodeInFeed(feed, streak.current_episode) };
    },

    getEpisodeQuestions(contentUuid: string): EpisodeQuestion[] {
      const stored = deps.contentPool.getByUuid(contentUuid);
      if (!stored) return [];
      return stored.prompts.map((prompt) => ({
        questionIndex: prompt.question_index,
        promptText: prompt.prompt_text,
        solutionCriteria: prompt.solution_criteria ?? ''
      }));
    },

    async run(
      filePath: string,
      options: RunEpisodeIngestOptions
    ): Promise<EpisodicIngestReport> {
      const kind = bookKindForPath(filePath);
      options.onProgress?.({ stage: 'extracting', current: 0, total: 0 });

      await access(filePath).catch(() => {
        throw new Error(`Cannot read file: ${filePath}`);
      });
      const document = await extractDocument(filePath);

      const chunks = chunkParagraphs(document.paragraphs);
      const targets = options.maxEpisodes ? chunks.slice(0, options.maxEpisodes) : chunks;

      // Nothing is written during the loop: old rows are deleted only once the
      // run has something to replace them with, and content rows must exist
      // before episodes can reference them (FK), so writing happens at the end.
      const written: {
        episode: Omit<Parameters<BookEpisodesRepo['insertBook']>[1][number], 'contentUuid'>;
        questions: { questionIndex: number; promptText: string; solutionCriteria: string }[];
      }[] = [];
      const failures: EpisodicIngestReport['failures'] = [];

      for (const [index, chunk] of targets.entries()) {
        options.onProgress?.({ stage: 'episodes', current: index + 1, total: targets.length });
        const meta = await agent.ingestEpisodeMeta(chunk);
        if (!meta.ok) {
          failures.push({ chunkIndex: index, reason: meta.reason });
          continue;
        }

        options.onProgress?.({ stage: 'questions', current: index + 1, total: targets.length });
        let questions: { questionIndex: number; promptText: string; solutionCriteria: string }[] = [];
        const distilled = await distiller.distill(chunk);
        if (distilled.ok) {
          questions = distilled.questions.map((question) => ({
            questionIndex: question.questionIndex,
            promptText: question.promptText,
            solutionCriteria: question.solutionCriteria
          }));
        } else {
          failures.push({ chunkIndex: index, reason: `questions: ${distilled.reason}` });
        }

        written.push({
          questions,
          episode: {
            episodeNumber: index + 1,
            episodeTitle: meta.meta.episodeTitle,
            contentText: chunk,
            isCanonical: options.isCanonical,
            episodeRecap: meta.meta.recap
          }
        });
      }

      let questionTotal = 0;
      if (written.length > 0) {
        deps.bookEpisodes.deleteBook(document.title);
        deps.contentPool.deleteBySource(`${document.title} (episodes)`, 'user_ingested');
        for (const entry of written) {
          // No questions distilled → no content row; the episode stands alone.
          const contentUuid =
            entry.questions.length > 0
              ? deps.contentPool.insertWithPrompts({
                  module: 'english',
                  subTopic: 'Episodic Episode',
                  sourceType: 'user_ingested',
                  sourceTitle: `${document.title} (episodes)`,
                  passageBody: entry.episode.contentText,
                  prompts: entry.questions
                })
              : undefined;
          deps.bookEpisodes.insertBook(document.title, [{ ...entry.episode, contentUuid }]);
          questionTotal += entry.questions.length;
        }
      }

      return {
        title: document.title,
        kind,
        chunkCount: chunks.length,
        ingestedCount: written.length,
        questionCount: questionTotal,
        failures
      };
    }
  };
}

export type EpisodeService = ReturnType<typeof createEpisodeService>;
