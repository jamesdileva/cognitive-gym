import { access, readFile } from 'node:fs/promises';
import type {
  IngestionReport,
  IngestProgress,
  IngestedSourceSummary
} from '@shared/ingestion-types';
import type { ContentPoolRepo, SourceType } from '../db/repositories/contentPoolRepo';
import type { AiEngineService } from '../ollama/engine';
import type { OllamaClient } from '../ollama/ollamaClient';
import { chunkParagraphs, chunkPageSpans } from './chunker';
import { createDistiller, type DistilledQuestion } from './distiller';
import { bookKindForPath, extractDocument } from './extract';
import {
  attachFigureDescriptions,
  describePages,
  detectVisionModel,
  stripFigureRefs
} from './figures';

export interface IngestionServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  contentPool: ContentPoolRepo;
  /** Raw client for vision-language figure descriptions (optional — figures are enrichment). */
  vlClient?: Pick<OllamaClient, 'chat' | 'listModels'>;
  /** Where figure PNGs persist (userData/figures). Optional — no dir, no figures. */
  figuresDir?: string;
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
      const pageSpans = chunkPageSpans(document.paragraphPages, targets);

      // Figure enrichment (PDF only): render + VL-describe pages inside the
      // ingested chunks' spans, then attach descriptions to chunk text so the
      // distiller generates questions that reference figure information.
      const figureDescriptions = new Map<number, string>();
      if (kind === 'pdf' && deps.figuresDir && deps.vlClient) {
        try {
          const pdfData = await readFile(filePath);
          const vlModel = detectVisionModel(await deps.vlClient.listModels());
          if (vlModel) {
            const spanPages = [
              ...new Set(pageSpans?.flatMap((span) => span.fromPage === span.toPage ? [span.fromPage] : [span.fromPage, span.toPage]) ?? [])
            ];
            for (const [page, description] of await describePages(pdfData, spanPages, {
              figuresDir: deps.figuresDir,
              bookSlug: document.title,
              vlModel,
              client: deps.vlClient
            })) {
              figureDescriptions.set(page, description);
            }
          }
        } catch {
          // Enrichment must never fail ingestion.
        }
      }

      const successes: { chunk: string; questions: DistilledQuestion[] }[] = [];
      const failures: IngestionReport['failures'] = [];

      for (const [index, chunk] of targets.entries()) {
        options.onProgress?.({ stage: 'distilling', current: index + 1, total: targets.length });
        const span = pageSpans?.[index];
        const enrichedChunk =
          span && figureDescriptions.size > 0
            ? attachFigureDescriptions(
                chunk,
                figureDescriptions,
                span.fromPage,
                span.toPage,
                (page) => `figures/${document.title}/p${page}.png`
              )
            : chunk;
        const outcome = await distiller.distill(stripFigureRefs(enrichedChunk));
        if (outcome.ok) {
          successes.push({ chunk: enrichedChunk, questions: outcome.questions });
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
