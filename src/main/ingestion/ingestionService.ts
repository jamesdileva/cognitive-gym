import { access } from 'node:fs/promises';
import type {
  IngestionReport,
  IngestProgress,
  IngestedSourceSummary
} from '@shared/ingestion-types';
import type { ContentPoolRepo, SourceType } from '../db/repositories/contentPoolRepo';
import type { AiEngineService } from '../ollama/engine';
import { chunkParagraphs } from './chunker';
import { createDistiller, type DistilledQuestion } from './distiller';
import { bookKindForPath, extractDocument } from './extract';

export interface IngestionServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  contentPool: ContentPoolRepo;
}

export interface RunIngestionOptions {
  /** Cap the number of distilled chunks (testing / partial runs). */
  maxChunks?: number;
  /** Progress sink (wired to the renderer via IPC events in production). */
  onProgress?: (progress: IngestProgress) => void;
}

export const INGESTED_SOURCE_TYPE: SourceType = 'user_ingested';

/**
 * The full ingestion pipeline (blueprint.md §2):
 *   extract → chunk (300–600 words, sentence-safe) → distill via Ollama
 *   → write content_pool + interactive_prompts.
 *
 * Re-ingesting a source replaces it: successful chunks are collected first,
 * the previous source rows are deleted only once there is something to write,
 * and prompts die with their content (FK cascade).
 */
export function createIngestionService(deps: IngestionServiceDeps) {
  const distiller = createDistiller({ engine: deps.engine });

  return {
    listLibrary(): IngestedSourceSummary[] {
      return deps.contentPool.listSourceSummaries(INGESTED_SOURCE_TYPE);
    },

    deleteSource(sourceTitle: string): boolean {
      return deps.contentPool.deleteBySource(sourceTitle, INGESTED_SOURCE_TYPE) > 0;
    },

    async run(filePath: string, options: RunIngestionOptions = {}): Promise<IngestionReport> {
      const kind = bookKindForPath(filePath);
      options.onProgress?.({ stage: 'extracting', current: 0, total: 0 });

      // Fast existence check — extraction itself validates readability.
      await access(filePath).catch(() => {
        throw new Error(`Cannot read file: ${filePath}`);
      });
      const document = await extractDocument(filePath);

      const chunks = chunkParagraphs(document.paragraphs);
      const targets = options.maxChunks ? chunks.slice(0, options.maxChunks) : chunks;

      const successes: { chunk: string; questions: DistilledQuestion[] }[] = [];
      const failures: IngestionReport['failures'] = [];

      for (const [index, chunk] of targets.entries()) {
        options.onProgress?.({ stage: 'distilling', current: index + 1, total: targets.length });
        const outcome = await distiller.distill(chunk);
        if (outcome.ok) {
          successes.push({ chunk, questions: outcome.questions });
        } else {
          failures.push({ chunkIndex: index, reason: outcome.reason });
        }
      }

      let questionCount = 0;
      if (successes.length > 0) {
        deps.contentPool.deleteBySource(document.title, INGESTED_SOURCE_TYPE);
        for (const success of successes) {
          deps.contentPool.insertWithPrompts({
            module: 'english',
            subTopic: 'Ingested Reading',
            sourceType: INGESTED_SOURCE_TYPE,
            sourceTitle: document.title,
            passageBody: success.chunk,
            prompts: success.questions.map((question) => ({
              questionIndex: question.questionIndex,
              promptText: question.promptText,
              solutionCriteria: question.solutionCriteria
            }))
          });
          questionCount += success.questions.length;
        }
      }

      return {
        title: document.title,
        kind,
        chunkCount: chunks.length,
        ingestedCount: successes.length,
        questionCount,
        failures
      };
    }
  };
}
