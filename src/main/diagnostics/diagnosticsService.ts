import { renderPrompt } from '@shared/prompts';
import type {
  CodingProblemView,
  DiagnosticsKind,
  DiagnosticsListItem,
  DiagnosticsSubmitResult,
  LogicPuzzleView,
  LogicRow,
  SystemsCaseView
} from '@shared/diagnostics-types';
import type { GradeResult } from '@shared/reading-types';
import type { UserProgressRepo, ModuleType } from '../db/repositories/userProgressRepo';
import type { AiEngineService } from '../ollama/engine';
import { createGrader } from '../reading/grader';

export interface DiagnosticsServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  progress: Pick<UserProgressRepo, 'recordAttempt'>;
  content: {
    coding: { problem_id: string; title: string; language: string; goal: string; code: string; bug_criteria: string }[];
    logic: { puzzle_id: string; title: string; categories: Record<string, string[]>; clues: string[]; solution: Record<string, string>[] }[];
    systems: { case_id: string; title: string; goal: string; log_text: string; diagnosis_criteria: string }[];
  };
}

const LOGIC_PROGRESS_MODULE: ModuleType = 'systems';

/**
 * The three diagnostics rooms (architecture.md §6C/§6D):
 *  - coding: read-only broken code, free-text bug identification graded
 *    against the stored bug criteria, hint ladder via the registry's
 *    code-diagnostics prompt (2-sentence summary + progressive hints).
 *  - logic: deduction grid with a deterministic local solution check; the
 *    model is consulted only for contradiction alerts on a partial board.
 *  - systems: log trace, proposed diagnosis graded semantically.
 *
 * Progress mapping (user_progress CHECK constraint): coding → 'coding';
 * logic and systems both live in the Logic & Systems room → 'systems'.
 */
export function createDiagnosticsService(deps: DiagnosticsServiceDeps) {
  const grader = createGrader({ engine: deps.engine });

  function record(moduleType: ModuleType, itemId: string, successful: boolean): void {
    deps.progress.recordAttempt({ moduleType, contentItemId: itemId, successful });
  }

  function requireCoding(id: string) {
    const problem = deps.content.coding.find((entry) => entry.problem_id === id);
    if (!problem) throw new Error(`Unknown coding problem: ${id}`);
    return problem;
  }
  function requireLogic(id: string) {
    const puzzle = deps.content.logic.find((entry) => entry.puzzle_id === id);
    if (!puzzle) throw new Error(`Unknown logic grid: ${id}`);
    return puzzle;
  }
  function requireSystems(id: string) {
    const systemsCase = deps.content.systems.find((entry) => entry.case_id === id);
    if (!systemsCase) throw new Error(`Unknown systems case: ${id}`);
    return systemsCase;
  }

  function listFor(kind: DiagnosticsKind): DiagnosticsListItem[] {
    if (kind === 'coding') {
      return deps.content.coding.map((problem) => ({
        id: problem.problem_id,
        title: problem.title,
        detail: `${problem.language} · ${problem.goal}`
      }));
    }
    if (kind === 'logic') {
      return deps.content.logic.map((puzzle) => ({
        id: puzzle.puzzle_id,
        title: puzzle.title,
        detail: `${puzzle.clues.length} clues · ${Object.keys(puzzle.categories).join(' / ')}`
      }));
    }
    return deps.content.systems.map((systemsCase) => ({
      id: systemsCase.case_id,
      title: systemsCase.title,
      detail: systemsCase.goal
    }));
  }

  return {
    list(kind: DiagnosticsKind): { items: DiagnosticsListItem[] } {
      return { items: listFor(kind) };
    },

    open(kind: DiagnosticsKind, id: string): { item: CodingProblemView | LogicPuzzleView | SystemsCaseView } {
      if (kind === 'coding') {
        const problem = requireCoding(id);
        return {
          item: {
            id: problem.problem_id,
            title: problem.title,
            language: problem.language,
            goal: problem.goal,
            code: problem.code
          }
        };
      }
      if (kind === 'logic') {
        const puzzle = requireLogic(id);
        const categoryNames = Object.keys(puzzle.categories);
        const view: LogicPuzzleView = {
          id: puzzle.puzzle_id,
          title: puzzle.title,
          categories: puzzle.categories,
          clues: puzzle.clues,
          rowCategory: categoryNames[0],
          fillCategories: categoryNames.slice(1)
        };
        return { item: view }; // solution never ships to the renderer
      }
      const systemsCase = requireSystems(id);
      return {
        item: {
          id: systemsCase.case_id,
          title: systemsCase.title,
          goal: systemsCase.goal,
          logText: systemsCase.log_text
        }
      };
    },

    submit(input: {
      kind: DiagnosticsKind;
      id: string;
      answer: string | LogicRow[];
    }): Promise<DiagnosticsSubmitResult> | DiagnosticsSubmitResult {
      if (input.kind === 'logic') {
        return this.submitLogic(input.id, input.answer as LogicRow[]);
      }
      const wrap = (outcome: GradeResult): DiagnosticsSubmitResult =>
        outcome.ok ? ({ kind: 'graded' as const, ...outcome } as const) : outcome;
      if (input.kind === 'coding') {
        return this.submitCoding(input.id, input.answer as string).then(wrap);
      }
      return this.submitSystems(input.id, input.answer as string).then(wrap);
    },

    submitCoding(id: string, answer: string): Promise<GradeResult> {
      const problem = requireCoding(id);
      return this.gradeAndRecord({
        moduleType: 'coding',
        itemId: problem.problem_id,
        passage: problem.code,
        question: `Identify the defect preventing this goal: ${problem.goal}`,
        criteria: problem.bug_criteria,
        answer
      });
    },

    submitSystems(id: string, answer: string): Promise<GradeResult> {
      const systemsCase = requireSystems(id);
      return this.gradeAndRecord({
        moduleType: 'systems',
        itemId: systemsCase.case_id,
        passage: systemsCase.log_text,
        question: systemsCase.goal,
        criteria: systemsCase.diagnosis_criteria,
        answer
      });
    },

    /** Deterministic check of the submitted board against the stored solution. */
    submitLogic(id: string, rows: LogicRow[]): DiagnosticsSubmitResult {
      const puzzle = requireLogic(id);
      const categoryNames = Object.keys(puzzle.categories);

      if (!Array.isArray(rows) || rows.length !== puzzle.solution.length) {
        record(LOGIC_PROGRESS_MODULE, puzzle.puzzle_id, false);
        return { kind: 'logic', correct: false, note: 'Fill every row of the board, then check again.' };
      }

      const matches = (row: Record<string, string>, solutionRow: Record<string, string>): boolean =>
        categoryNames.every((category) => row[category] === solutionRow[category]);

      const correct = puzzle.solution.every((solutionRow) =>
        rows.some((row) => row[categoryNames[0]] === solutionRow[categoryNames[0]] && matches(row, solutionRow))
      );
      record(LOGIC_PROGRESS_MODULE, puzzle.puzzle_id, correct);
      return {
        kind: 'logic',
        correct,
        note: correct
          ? 'Solved — every deduction holds.'
          : 'Not yet: at least one row contradicts the clues. Ask for a contradiction alert, then re-derive.'
      };
    },

    /** Hint ladder for coding (registry code-diagnostics prompt, verbatim contract). */
    async codingHint(id: string, userMessage: string): Promise<{ ok: true; hint: string } | { ok: false; failure: { kind: string; message: string } }> {
      const problem = requireCoding(id);
      try {
        const generation = await deps.engine.generateWithEngine({
          prompt: userMessage,
          system: renderPrompt('code-diagnostics', {
            code_goal: problem.goal,
            user_code: problem.code
          })
        });
        return { ok: true, hint: generation.text };
      } catch (error) {
        return {
          ok: false,
          failure: {
            kind: error instanceof Error && 'kind' in error ? String((error as { kind: unknown }).kind) : 'unreachable',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    },

    /** Model-based contradiction alert for a partially-filled logic board. */
    async logicHint(
      id: string,
      rows: LogicRow[]
    ): Promise<{ ok: true; hint: string } | { ok: false; failure: { kind: string; message: string } }> {
      const puzzle = requireLogic(id);
      const clues = puzzle.clues.map((clue, index) => `${index + 1}. ${clue}`).join('\n');
      try {
        const generation = await deps.engine.generateWithEngine({
          prompt: `Current board:\n${JSON.stringify(rows)}\n\nWhich of these assignments contradict the clues? Name the clue numbers involved and what to re-examine — do not reveal the solution.`,
          system: `You monitor a logic deduction grid for structural consistency. The full clue set is:\n${clues}\n\nRules: alert the user to contradictions with specific clue numbers, in at most 3 sentences, without ever stating the final solution outright.`
        });
        return { ok: true, hint: generation.text };
      } catch (error) {
        return {
          ok: false,
          failure: {
            kind: error instanceof Error && 'kind' in error ? String((error as { kind: unknown }).kind) : 'unreachable',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    },

    /** Shared semantic-grading path for coding and systems answers. */
    async gradeAndRecord(input: {
      moduleType: ModuleType;
      itemId: string;
      passage: string;
      question: string;
      criteria: string;
      answer: string;
    }): Promise<GradeResult> {
      const outcome = await grader.grade({
        passage: input.passage,
        question: input.question,
        solutionCriteria: input.criteria,
        answer: input.answer
      });
      if (!outcome.ok) {
        return { ok: false, failure: { kind: 'invalid_response', message: outcome.reason } };
      }
      record(input.moduleType, input.itemId, outcome.score >= 70);
      return { ok: true, score: outcome.score, feedback: outcome.feedback };
    }
  };
}

export type DiagnosticsService = ReturnType<typeof createDiagnosticsService>;
