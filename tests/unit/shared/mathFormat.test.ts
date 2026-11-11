import { describe, expect, it } from 'vitest';
import { renderMathText } from '@shared/math-format';
import { normalizeMathAnswer } from '@main/math/mathService';

describe('renderMathText (caret -> Unicode superscripts)', () => {
  it('converts single-digit exponents', () => {
    expect(renderMathText("f'(x) = 15x^4")).toBe("f'(x) = 15x⁴");
  });

  it('converts multi-digit exponents', () => {
    expect(renderMathText('x^10 + 2')).toBe('x¹⁰ + 2');
  });

  it('converts negative exponents (caret and brace forms)', () => {
    expect(renderMathText('x^-2')).toBe('x⁻²');
    expect(renderMathText('x^{−3}')).toBe('x⁻³');
  });

  it('leaves text without carets unchanged', () => {
    expect(renderMathText('Solve for x: 4x + 3 = 27')).toBe('Solve for x: 4x + 3 = 27');
  });
});

describe('normalizeMathAnswer (superscript tolerance)', () => {
  it('matches pasted superscripts against caret answers', () => {
    expect(normalizeMathAnswer('x⁹')).toBe(normalizeMathAnswer('x^9'));
    expect(normalizeMathAnswer("f'(x) = 15x⁴")).toBe(normalizeMathAnswer("f'(x) = 15x^4"));
  });
});
