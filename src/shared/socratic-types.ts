import type { AiFailure } from './ai-types';

/**
 * Socratic dialogue memory (Sprint 18): grounded follow-up questions after a
 * graded attempt. The tutor stores the exchange and responds with exactly one
 * guiding question about the student's specific mistake. Tree visualization
 * is deferred — this stores the data such a view would render.
 */

export type FollowUpResult =
  | { ok: true; reply: string }
  | { ok: false; failure: AiFailure };
