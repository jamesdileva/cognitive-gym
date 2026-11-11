import type {
  GradeResult,
  ReadingPassageSummary,
  ReadingSession
} from '@shared/reading-types';
import type { AiFailure } from '@shared/ai-types';
import type { FollowUpResult } from '@shared/socratic-types';
import { renderPrompt } from '@shared/prompts';
import type { UserProgressRepo } from '../db/repositories/userProgressRepo';
import type { SocraticTurnsRepo } from '../db/repositories/socraticTurnsRepo';
import type { ContentPoolRepo } from '../db/repositories/contentPoolRepo';
import type { AiEngineService } from '../ollama/engine';
import { countWords } from '../ingestion/chunker';
import { createGrader, PASS_THRESHOLD } from './grader';

export interface ReadingServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  contentPool: ContentPoolRepo;
  progress: Pick<UserProgressRepo, 'recordAttempt'>;
  /** Dialogue memory for post-grade follow-ups (optional). */
  turns?: Pick<SocraticTurnsRepo, 'append' | 'list'>;
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

      // Store the graded exchange as the opening of the Socratic dialogue —
      // follow-up questions are then grounded in the actual answer + feedback.
      if (deps.turns) {
        const key = attemptKeyFor(input.uuid, input.questionIndex);
        deps.turns.append(key, 'student', input.answer);
        deps.turns.append(key, 'tutor', outcome.feedback);
      }

      return { ok: true, score: outcome.score, feedback: outcome.feedback };
    },

    /**
     * Socratic follow-up after a grade: the tutor knows the passage, the
     * question, the student's answer, the feedback already given, and the
     * stored exchange — and responds with exactly one guiding question.
     */
    async followUp(input: {
      uuid: string;
      questionIndex: number;
      message: string;
    }): Promise<FollowUpResult> {
      const stored = deps.contentPool.getByUuid(input.uuid);
      if (!stored) {
        throw new Error(`Unknown reading passage: ${input.uuid}`);
      }
      const prompt = stored.prompts.find((entry) => entry.question_index === input.questionIndex);
      if (!prompt || !prompt.solution_criteria) {
        return {
          ok: false,
          failure: { kind: 'missing_criteria', message: 'This question has no stored grading criteria.' }
        };
      }

      const key = attemptKeyFor(input.uuid, input.questionIndex);
      const priorTurns = deps.turns?.list(key) ?? [];
      const dialogueBlock =
        priorTurns.length > 0
          ? 'PRIOR DIALOGUE (oldest first):\n' +
            priorTurns
              .map((turn) => `${turn.role === 'tutor' ? 'Tutor' : 'Student'}: ${turn.content}`)
              .join('\n') +
            '\n\nTake the prior dialogue into account — do not repeat earlier hints.\n\n'
          : '';

      try {
        const generation = await deps.engine.generateWithEngine({
          prompt: dialogueBlock + input.message,
          system: renderPrompt('reading-grader', {
            passage: stored.content.passage_body,
            question: prompt.prompt_text,
            solution_criteria: prompt.solution_criteria,
            answer: '(the student is asking for guidance after a graded attempt)'
          })
        });
        deps.turns?.append(key, 'student', input.message);
        deps.turns?.append(key, 'tutor', generation.text);
        return { ok: true, reply: generation.text };
      } catch (error) {
        return {
          ok: false,
          failure: {
            kind:
              typeof error === 'object' && error !== null && 'kind' in error
                ? (error as { kind: AiFailure['kind'] }).kind
                : 'unreachable',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  };
}

function attemptKeyFor(uuid: string, questionIndex: number): string {
  return `${uuid}:${questionIndex}`;
}

export type ReadingService = ReturnType<typeof createReadingService>;
