import type { DashboardOverview } from '@shared/dashboard-types';
import type { GymDatabase } from '../db/database';
import { activityByDay, distinctActiveDates } from '../db/activityLog';
import type { FlashcardsRepo } from '../db/repositories/flashcardsRepo';
import { computeStreak } from './streak';

export interface DashboardServiceDeps {
  db: GymDatabase;
  cards: FlashcardsRepo;
}

/**
 * Gamification overview (Sprint 10): daily streak across every activity
 * source, module mastery, the 30-day activity series, and what's due now.
 * All reads are indexed and aggregate-only — no per-row scans in the renderer.
 */
export function createDashboardService(deps: DashboardServiceDeps) {
  return {
    overview(now: Date = new Date()): DashboardOverview {
      const modules = (
        deps.db
          .prepare(
            `
            SELECT module_type AS module,
                   COUNT(DISTINCT content_item_id) AS items,
                   SUM(total_attempts) AS attempts,
                   SUM(successful_attempts) AS successful
            FROM user_progress
            GROUP BY module_type
            ORDER BY module_type
            `
          )
          .all() as { module: string; items: number; attempts: number; successful: number }[]
      ).map((row) => ({ ...row, successful: row.successful ?? 0 }));

      const dueCards = deps.cards
        .listDecks()
        .reduce((total, deck) => total + deps.cards.dueCount(deck.deck_name), 0);

      return {
        dailyStreak: computeStreak(distinctActiveDates(deps.db), now),
        dueCards,
        modules,
        activity: activityByDay(deps.db, 30, now)
      };
    }
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
