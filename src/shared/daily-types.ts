/** Daily Mix contract (v0.2): generalized daily workout, deterministic per date. */

export type TeaserKind = 'riddle' | 'lateral' | 'philosophical';

export interface DailyComponent {
  id: 'math-game' | 'reading' | 'flashcards' | 'teaser';
  label: string;
  hint: string;
  done: boolean;
  /** Where to go to complete it (null for the inline teaser). */
  navigateTo: 'drill' | 'room' | 'srs' | null;
}

export interface DailyTeaser {
  id: string;
  kind: TeaserKind;
  prompt: string;
  done: boolean;
}

export interface DailyOverview {
  /** UTC date, YYYY-MM-DD — the workout is deterministic per date. */
  date: string;
  components: DailyComponent[];
  teaser: DailyTeaser;
  complete: boolean;
}

export interface DailyTeaserGrade {
  score: number;
  feedback: string;
  overview: DailyOverview;
}
