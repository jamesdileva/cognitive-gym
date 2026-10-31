/**
 * Daily-streak computation (Sprint 10). UTC-day based, consistent with the
 * ISO timestamps written by the activity log. Standard habit semantics: if
 * today has no activity yet, the streak still counts through yesterday.
 */

const DAY_MS = 86_400_000;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeStreak(activeDates: string[], today: Date = new Date()): number {
  const active = new Set(activeDates);

  let cursor = new Date(today.getTime());
  if (!active.has(utcDay(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  let streak = 0;
  while (active.has(utcDay(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}
