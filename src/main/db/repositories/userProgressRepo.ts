import type { GymDatabase } from '../database';
import { logActivity } from '../activityLog';

export type ModuleType = 'math' | 'english' | 'history' | 'coding' | 'systems';

export interface UserProgressRow {
  id: number;
  module_type: ModuleType;
  content_item_id: string;
  difficulty_rank: number;
  total_attempts: number;
  successful_attempts: number;
  last_attempted_timestamp: string;
}

export interface RecordAttemptInput {
  moduleType: ModuleType;
  contentItemId: string;
  successful: boolean;
  difficultyRank?: number;
}

/**
 * Cross-module competency tracking. One row per (module, content item) —
 * `recordAttempt` upserts and accumulates counters.
 */
export function createUserProgressRepo(db: GymDatabase) {
  const selectByItem = db.prepare(
    'SELECT * FROM user_progress WHERE module_type = ? AND content_item_id = ?'
  );
  const selectByModule = db.prepare(
    'SELECT * FROM user_progress WHERE module_type = ? ORDER BY last_attempted_timestamp DESC'
  );

  return {
    /** Records one attempt (upsert + activity log in one transaction). */
    recordAttempt(input: RecordAttemptInput): UserProgressRow {
      const write = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO user_progress (module_type, content_item_id, total_attempts, successful_attempts, difficulty_rank, last_attempted_timestamp)
          VALUES (?, ?, 1, ?, ?, ?)
          ON CONFLICT (module_type, content_item_id) DO UPDATE SET
            total_attempts = total_attempts + 1,
            successful_attempts = successful_attempts + excluded.successful_attempts,
            difficulty_rank = excluded.difficulty_rank,
            last_attempted_timestamp = excluded.last_attempted_timestamp
          `
        ).run(
          input.moduleType,
          input.contentItemId,
          input.successful ? 1 : 0,
          input.difficultyRank ?? 1,
          new Date().toISOString()
        );
        logActivity(db, input.moduleType, input.contentItemId, input.successful);
      });
      write();
      return selectByItem.get(input.moduleType, input.contentItemId) as UserProgressRow;
    },

    getByItem(moduleType: ModuleType, contentItemId: string): UserProgressRow | undefined {
      return selectByItem.get(moduleType, contentItemId) as UserProgressRow | undefined;
    },

    listByModule(moduleType: ModuleType): UserProgressRow[] {
      return selectByModule.all(moduleType) as UserProgressRow[];
    }
  };
}

export type UserProgressRepo = ReturnType<typeof createUserProgressRepo>;
