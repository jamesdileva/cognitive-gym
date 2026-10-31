import { describe, expect, it } from 'vitest';
import {
  evaluateIntegerExpression,
  fnv1a32,
  mulberry32,
  parseVariableSpec,
  resolveVariableSpec,
  seededRandom
} from '@main/math/specEngine';

describe('seeded randomness', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sequenceA = [a(), a(), a(), a()];
    const sequenceB = [b(), b(), b(), b()];
    expect(sequenceA).toEqual(sequenceB);
    for (const value of sequenceA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('different seeds produce different streams', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('fnv1a32 is stable and input-sensitive', () => {
    expect(fnv1a32('template:1')).toBe(fnv1a32('template:1'));
    expect(fnv1a32('template:1')).not.toBe(fnv1a32('template:2'));
  });

  it('seededRandom mixes the template id so templates diverge', () => {
    const drawA = seededRandom('alpha', 7);
    const drawB = seededRandom('beta', 7);
    expect([drawA(), drawA()]).not.toEqual([drawB(), drawB()]);
  });
});

describe('parseVariableSpec', () => {
  it('parses random_int_range specs', () => {
    expect(parseVariableSpec('random_int_range(2, 12)')).toEqual({ kind: 'random', min: 2, max: 12 });
    expect(parseVariableSpec('random_int_range( -3 , 3 )')).toEqual({ kind: 'random', min: -3, max: 3 });
  });

  it('rejects inverted ranges and treats other strings as expressions', () => {
    expect(() => parseVariableSpec('random_int_range(9, 2)')).toThrow(/below min/);
    expect(parseVariableSpec('coeff * power')).toEqual({ kind: 'expression', source: 'coeff * power' });
  });
});

describe('resolveVariableSpec', () => {
  it('draws within bounds inclusive across many seeds', () => {
    const spec = 'random_int_range(2, 8)';
    for (let seed = 0; seed < 500; seed += 1) {
      const value = resolveVariableSpec(spec, {}, seededRandom('bounds', seed));
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(8);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('resolves expressions over previously generated variables', () => {
    const vars = { coeff: 4, power: 5 };
    expect(resolveVariableSpec('coeff * power', vars, mulberry32(1))).toBe(20);
    expect(resolveVariableSpec('power - 1', vars, mulberry32(1))).toBe(4);
    expect(resolveVariableSpec('(coeff + 1) * (power - 2)', vars, mulberry32(1))).toBe(15);
    expect(resolveVariableSpec('-coeff + power', vars, mulberry32(1))).toBe(1);
  });
});

describe('evaluateIntegerExpression (safe evaluator)', () => {
  const vars = { a: 6, b: 3 };

  it('evaluates precedence, parentheses, and unary minus', () => {
    expect(evaluateIntegerExpression('2 + 3 * 4', {})).toBe(14);
    expect(evaluateIntegerExpression('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateIntegerExpression('-a + b', vars)).toBe(-3);
    expect(evaluateIntegerExpression('a * b - (a - b)', vars)).toBe(15);
  });

  it('allows only exact integer division', () => {
    expect(evaluateIntegerExpression('a / b', vars)).toBe(2);
    expect(() => evaluateIntegerExpression('a / 4', vars)).toThrow(/does not yield an integer/);
    expect(() => evaluateIntegerExpression('a / 0', vars)).toThrow(/Division by zero/);
  });

  it('rejects injection, unknown variables, and malformed input', () => {
    expect(() => evaluateIntegerExpression('process; 1', vars)).toThrow(/Illegal character/);
    expect(() => evaluateIntegerExpression('unknown * 2', vars)).toThrow(/Unknown variable 'unknown'/);
    expect(() => evaluateIntegerExpression('(a + b', vars)).toThrow(/Missing closing parenthesis/);
    expect(() => evaluateIntegerExpression('a + ', vars)).toThrow(/Unexpected/);
  });
});
