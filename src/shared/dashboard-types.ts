/** Dashboard contract (Sprint 10): streaks, mastery, activity series. */

export interface ModuleStat {
  module: string;
  /** Distinct content items with at least one attempt. */
  items: number;
  attempts: number;
  successful: number;
}

export interface ActivityDay {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  attempts: number;
  successful: number;
}

export interface DashboardOverview {
  /** Consecutive active days ending today (or yesterday if today is inactive). */
  dailyStreak: number;
  /** Flashcards due across all decks. */
  dueCards: number;
  modules: ModuleStat[];
  /** Last 30 UTC days, zero-filled. */
  activity: ActivityDay[];
}
