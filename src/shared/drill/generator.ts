/**
 * Speed Drill question generator (v0.2, user-directed): easy mental math that
 * ramps gently with the score. Pure — the renderer injects randomness so
 * questions appear instantly and tests can pin the stream.
 */

export interface DrillQuestion {
  prompt: string;
  /** Exact integer answer. */
  answer: number;
}

const randInt = (rand: () => number, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

/** One ramp tier per ~4 correct answers: +/− → ×tables → mixed two-digit. */
export function nextQuestion(score: number, rand: () => number): DrillQuestion {
  if (score <= 3) {
    // Tier 1: small addition / subtraction (answer stays positive).
    const a = randInt(rand, 2, 20);
    const b = randInt(rand, 2, 20);
    return rand() < 0.5
      ? { prompt: `${a} + ${b} = ?`, answer: a + b }
      : { prompt: `${a + b} − ${b} = ?`, answer: a };
  }
  if (score <= 7) {
    // Tier 2: multiplication tables 2–10.
    const a = randInt(rand, 2, 10);
    const b = randInt(rand, 2, 10);
    return { prompt: `${a} × ${b} = ?`, answer: a * b };
  }
  if (score <= 11) {
    // Tier 3: two-digit addition / subtraction.
    const a = randInt(rand, 11, 89);
    const b = randInt(rand, 11, 89);
    return rand() < 0.5
      ? { prompt: `${a} + ${b} = ?`, answer: a + b }
      : { prompt: `${Math.max(a, b)} − ${Math.min(a, b)} = ?`, answer: Math.abs(a - b) };
  }
  // Tier 4+: mixed everything, slightly bigger.
  const mode = randInt(rand, 0, 2);
  if (mode === 0) {
    const a = randInt(rand, 3, 12);
    const b = randInt(rand, 3, 12);
    return { prompt: `${a} × ${b} = ?`, answer: a * b };
  }
  const a = randInt(rand, 15, 99);
  const b = randInt(rand, 15, 99);
  return rand() < 0.5
    ? { prompt: `${a} + ${b} = ?`, answer: a + b }
    : { prompt: `${Math.max(a, b)} − ${Math.min(a, b)} = ?`, answer: Math.abs(a - b) };
}
