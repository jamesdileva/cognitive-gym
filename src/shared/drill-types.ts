/** Speed Drill contract (v0.2): timed mental-math arcade runs. */

export interface DrillQuestion {
  prompt: string;
  /** Exact integer answer. */
  answer: number;
}

export interface DrillRunResult {
  /** Correct answers before the run ended. */
  score: number;
  /** Smallest time budget reached during the run, in seconds (2–10). */
  minBudgetS: number;
}

export interface DrillStats {
  bestScore: number;
  /** Fastest budget any best-score run reached. */
  bestMinBudgetS: number | null;
  totalRuns: number;
}
