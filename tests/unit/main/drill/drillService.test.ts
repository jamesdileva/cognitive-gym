import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type GymDatabase } from '@main/db/database';
import { createDrillService } from '@main/drill/drillService';

let db: GymDatabase;
let service: ReturnType<typeof createDrillService>;

beforeEach(() => {
  db = openDatabase(':memory:');
  service = createDrillService({ db });
});

describe('drillService', () => {
  it('returns zeroed stats on a fresh database', () => {
    expect(service.stats()).toEqual({ bestScore: 0, bestMinBudgetS: null, totalRuns: 0 });
  });

  it('persists runs and reports bests (score, fastest budget at best score)', () => {
    service.submitRun({ score: 5, minBudgetS: 6 });
    service.submitRun({ score: 8, minBudgetS: 4 });
    const after = service.submitRun({ score: 8, minBudgetS: 3 });

    expect(after).toEqual({ bestScore: 8, bestMinBudgetS: 3, totalRuns: 3 });
  });

  it('tracks the best score even when a later run scores lower', () => {
    service.submitRun({ score: 12, minBudgetS: 2 });
    const after = service.submitRun({ score: 3, minBudgetS: 9 });
    expect(after.bestScore).toBe(12);
    expect(after.bestMinBudgetS).toBe(2);
  });

  it('clamps hostile submissions (negative scores, absurd budgets)', () => {
    const after = service.submitRun({ score: -50, minBudgetS: 9999 });
    expect(after.totalRuns).toBe(1);
    const row = db.prepare('SELECT score, min_budget_s FROM speed_runs').get() as {
      score: number;
      min_budget_s: number;
    };
    expect(row.score).toBe(0);
    expect(row.min_budget_s).toBe(10);
  });

  it('logs one activity row per run so runs feed the streak', () => {
    service.submitRun({ score: 4, minBudgetS: 7 });
    const logged = db
      .prepare("SELECT COUNT(*) AS c FROM attempt_log WHERE module_type = 'math' AND content_item_id = 'speed_drill'")
      .get() as { c: number };
    expect(logged.c).toBe(1);
  });
});
