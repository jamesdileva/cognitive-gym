import type {
  GradeResult,
  ReadingPassageSummary,
  ReadingSession
} from '@shared/reading-types';
import type { UserProgressRepo } from '../db/repositories/userProgressRepo';
import type { ContentPoolRepo } from '../db/repositories/contentPoolRepo';
import type { AiEngineService } from '../ollama/engine';
import { countWords } from '../ingestion/chunker';
import { createGrader, PASS_THRESHOLD } from './grader';

export interface ReadingServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  contentPool: ContentPoolRepo;
  progress: Pick<UserProgressRepo, 'recordAttempt'>;
}

const EXCERPT_CHARS = 140;

/**
 * The Reading Room (architecture.md §6B): passages with interpretive questions,
 * free-text answers graded semantically against stored solution vectors.
 * Criteria are the answer key — they never leave the main process, and each
 * graded attempt lands in user_progress under the passage's own module.
 */
export function createReadingService(deps: ReadingServiceDeps) {
  const grader = createGrader({ engine: deps.engine });

  return {
    listPassages(): ReadingPassageSummary[] {
      return deps.contentPool.listReadingPassages().map((row) => ({
        uuid: row.uuid,
        sourceTitle: row.source_title ?? 'Untitled',
        subTopic: row.sub_topic,
        module: row.module,
        questionCount: row.question_count,
        wordCount: countWords(row.passage_body),
        excerpt:
          row.passage_body.length > EXCERPT_CHARS
            ? `${row.passage_body.slice(0, EXCERPT_CHARS).trimEnd()}…`
            : row.passage_body
      }));
    },

    startSession(uuid: string): ReadingSession {
      const stored = deps.contentPool.getByUuid(uuid);
      if (!stored) {
        throw new Error(`Unknown reading passage: ${uuid}`);
      }
      return {
        uuid: stored.content.uuid,
        sourceTitle: stored.content.source_title ?? 'Untitled',
        subTopic: stored.content.sub_topic,
        module: stored.content.module,
        text: stored.content.passage_body,
        questions: stored.prompts.map((prompt) => ({
          questionIndex: prompt.question_index,
          promptText: prompt.prompt_text
        }))
      };
    },

    async submitAnswer(input: {
      uuid: string;
      questionIndex: number;
      answer: string;
    }): Promise<GradeResult> {
      const stored = deps.contentPool.getByUuid(input.uuid);
      if (!stored) {
        throw new Error(`Unknown reading passage: ${input.uuid}`);
      }
      const prompt = stored.prompts.find((entry) => entry.question_index === input.questionIndex);
      if (!prompt) {
        throw new Error(`Question ${input.questionIndex} not found for this passage`);
      }
      if (!prompt.solution_criteria) {
        return {
          ok: false,
          failure: {
            kind: 'missing_criteria',
            message: 'This question has no stored grading criteria.'
          }
        };
      }

      const outcome = await grader.grade({
        passage: stored.content.passage_body,
        question: prompt.prompt_text,
        solutionCriteria: prompt.solution_criteria,
        answer: input.answer
      });

      if (!outcome.ok) {
        return { ok: false, failure: { kind: 'invalid_response', message: outcome.reason } };
      }

      deps.progress.recordAttempt({
        moduleType: stored.content.module === 'history' ? 'history' : 'english',
        contentItemId: input.uuid,
        successful: outcome.score >= PASS_THRESHOLD
      });

      return { ok: true, score: outcome.score, feedback: outcome.feedback };
    }
  };
}

export type ReadingService = ReturnType<typeof createReadingService>;
