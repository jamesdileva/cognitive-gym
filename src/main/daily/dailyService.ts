import type {
  DailyComponent,
  DailyOverview,
  DailyTeaser
} from '@shared/daily-types';
import type { GymDatabase } from '../db/database';
import { logActivity } from '../db/activityLog';
import type { FlashcardsRepo } from '../db/repositories/flashcardsRepo';
import type { AiEngineService } from '../ollama/engine';
import { createGrader } from '../reading/grader';
import { fnv1a32 } from '../math/specEngine';
import type { Teaser } from './teaserLoader';

export interface DailyServiceDeps {
  db: GymDatabase;
  cards: FlashcardsRepo;
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  teasers: Teaser[];
}

const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * The Daily Mix (v0.2): one deterministic workout per UTC date, following the
 * user's sequence — speed drill → short-story question → flashcards → teaser
 * of the day. Three components verify themselves from real activity (speed
 * runs, graded reading answers, card reviews); the teaser is answered inline
 * and graded semantically against its stored criteria.
 *
 * Teaser attempts write `attempt_log` (module 'teaser') but deliberately skip
 * user_progress — they are daily bonuses, not tracked mastery skills.
 */
export function createDailyService(deps: DailyServiceDeps) {
  const grader = createGrader({ engine: deps.engine });

  const teaserForDate = (date: string): Teaser => {
    if (deps.teasers.length === 0) {
      throw new Error('No teasers found in the content library');
    }
    return deps.teasers[fnv1a32(`daily:${date}`) % deps.teasers.length];
  };

  const doneToday = (date: string, conditions: { module: string; contentItem?: string }): boolean => {
    const rows = deps.db
      .prepare(
        `
        SELECT COUNT(*) AS c
        FROM attempt_log
        WHERE substr(created_at, 1, 10) = ?
          AND module_type = ?
          AND (? IS NULL OR content_item_id = ?)
        `
      )
      .get(date, conditions.module, conditions.contentItem ?? null, conditions.contentItem ?? null) as {
      c: number;
    };
    return rows.c > 0;
  };

  return {
    today(now: Date = new Date()): DailyOverview {
      const date = utcDay(now);
      const teaser = teaserForDate(date);

      const teaserDone = doneToday(date, { module: 'teaser', contentItem: teaser.teaser_id });
      const components: DailyComponent[] = [
        {
          id: 'math-game',
          label: 'Math game',
          hint: 'One speed drill run — until you lose',
          done:
            (deps.db
              .prepare('SELECT COUNT(*) AS c FROM speed_runs WHERE substr(created_at, 1, 10) = ?')
              .get(date) as { c: number }).c > 0,
          navigateTo: 'drill'
        },
        {
          id: 'reading',
          label: 'Short story question',
          hint: 'Grade one comprehension answer in the Reading Room',
          done:
            (deps.db
              .prepare(
                `
                SELECT COUNT(*) AS c
                FROM attempt_log
                WHERE substr(created_at, 1, 10) = ?
                  AND module_type IN ('english', 'history')
                  AND content_item_id NOT LIKE 'teaser%'
                `
              )
              .get(date) as { c: number }).c > 0,
          navigateTo: 'room'
        },
        {
          id: 'flashcards',
          label: 'Flashcards',
          hint: 'Review the cards that are due',
          done: doneToday(date, { module: 'srs' }),
          navigateTo: 'srs'
        },
        {
          id: 'teaser',
          label: `Teaser: ${teaser.kind}`,
          hint: 'Answer below — graded against hidden criteria',
          done: teaserDone,
          navigateTo: null
        }
      ];

      const view: DailyTeaser = {
        id: teaser.teaser_id,
        kind: teaser.kind,
        prompt: teaser.prompt,
        done: teaserDone
      };

      return {
        date,
        components,
        teaser: view,
        complete: components.every((component) => component.done)
      };
    },

    /** Grades today's teaser answer against its stored criteria. */
    async gradeTeaser(
      answer: string,
      now: Date = new Date()
    ): Promise<{ score: number; feedback: string; overview: DailyOverview }> {
      const date = utcDay(now);
      const teaser = teaserForDate(date);

      const outcome = await grader.grade({
        passage: teaser.prompt,
        question: 'Solve this teaser and explain your reasoning.',
        solutionCriteria: teaser.criteria,
        answer
      });
      if (!outcome.ok) {
        throw new Error(outcome.reason);
      }

      const successful = outcome.score >= 70;
      logActivity(deps.db, 'teaser', teaser.teaser_id, successful);

      return {
        score: outcome.score,
        feedback: outcome.feedback,
        overview: this.today(now)
      };
    }
  };
}

export type DailyService = ReturnType<typeof createDailyService>;
