import type { DrillStats, DrillRunResult } from '@shared/drill-types';
import type { GymDatabase } from '../db/database';
import { logActivity } from '../db/activityLog';

export interface DrillServiceDeps {
  db: GymDatabase;
}

const MAX_SCORE = 500;
const MIN_BUDGET_FLOOR_S = 2;
const MAX_BUDGET_S = 10;

/**
 * Speed Drill persistence (v0.2): one row per finished run plus one
 * attempt_log entry, so runs feed the streak and the 30-day chart like every
 * other surface. Scores are client-submitted — the local single-user trust
 * model accepted in AGENTS.md §6 applies.
 */
export function createDrillService(deps: DrillServiceDeps) {
  const stats = (): DrillStats => {
    const row = deps.db
      .prepare(
        `
        SELECT COALESCE(MAX(score), 0) AS bestScore,
               COALESCE(MIN(CASE WHEN score = (SELECT MAX(score) FROM speed_runs) THEN min_budget_s END), NULL) AS bestMinBudgetS,
               COUNT(*) AS totalRuns
        FROM speed_runs
        `
      )
      .get() as { bestScore: number; bestMinBudgetS: number | null; totalRuns: number };
    return row;
  };

  return {
    stats,

    /** Records a finished run; clamps hostile values and returns fresh bests. */
    submitRun(run: DrillRunResult): DrillStats {
      const score = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(run.score) || 0)));
      const minBudgetS = Math.max(
        MIN_BUDGET_FLOOR_S,
        Math.min(MAX_BUDGET_S, Math.round(Number(run.minBudgetS) || MAX_BUDGET_S))
      );

      const write = deps.db.transaction(() => {
        deps.db
          .prepare('INSERT INTO speed_runs (score, min_budget_s, created_at) VALUES (?, ?, ?)')
          .run(score, minBudgetS, new Date().toISOString());
        logActivity(deps.db, 'math', 'speed_drill', score > 0);
      });
      write();

      return stats();
    }
  };
}

export type DrillService = ReturnType<typeof createDrillService>;
