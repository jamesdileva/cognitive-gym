import type { GymDatabase } from './database';

/**
 * Per-attempt history (migration v4) powering the dashboard: streaks, the
 * 30-day activity chart, and future speed analytics. Every learning surface
 * writes here — module attempts via userProgressRepo.recordAttempt, flashcard
 * reviews via flashcardsRepo.updateReviewState, episode reads via
 * readingStreaksRepo.advance.
 */

export interface ActivityDay {
  date: string;
  attempts: number;
  successful: number;
}

export function logActivity(
  db: GymDatabase,
  moduleType: string,
  contentItemId: string,
  successful: boolean
): void {
  db.prepare(
    `
    INSERT INTO attempt_log (module_type, content_item_id, successful, created_at)
    VALUES (?, ?, ?, ?)
    `
  ).run(moduleType, contentItemId, successful ? 1 : 0, new Date().toISOString());
}

/** Attempts bucketed by UTC day over the last `days` days, missing days filled with zeros. */
export function activityByDay(db: GymDatabase, days = 30, now: Date = new Date()): ActivityDay[] {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const rows = db
    .prepare(
      `
      SELECT substr(created_at, 1, 10) AS date,
             COUNT(*) AS attempts,
             SUM(successful) AS successful
      FROM attempt_log
      WHERE created_at >= ?
      GROUP BY date
      `
    )
    .all(since.toISOString()) as { date: string; attempts: number; successful: number }[];

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: ActivityDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    const row = byDate.get(date);
    series.push({
      date,
      attempts: row?.attempts ?? 0,
      successful: row?.successful ?? 0
    });
  }
  return series;
}

/**
 * Distinct UTC dates with any recorded activity, across all sources:
 * module attempts, flashcard reviews, and episode reads.
 */
export function distinctActiveDates(db: GymDatabase): string[] {
  const dates = new Set<string>();

  const attemptRows = db
    .prepare('SELECT DISTINCT substr(created_at, 1, 10) AS date FROM attempt_log')
    .all() as { date: string }[];
  for (const row of attemptRows) dates.add(row.date);

  const streakRows = db
    .prepare('SELECT DISTINCT substr(last_read_date, 1, 10) AS date FROM user_reading_streaks WHERE last_read_date IS NOT NULL')
    .all() as { date: string }[];
  for (const row of streakRows) dates.add(row.date);

  const cardRows = db
    .prepare('SELECT DISTINCT substr(last_reviewed_at, 1, 10) AS date FROM flashcards WHERE last_reviewed_at IS NOT NULL')
    .all() as { date: string }[];
  for (const row of cardRows) dates.add(row.date);

  return [...dates];
}
