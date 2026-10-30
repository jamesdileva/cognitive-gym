import { describe, expect, it } from 'vitest';
import { safeParseJson } from '@shared/parseJson';

describe('safeParseJson', () => {
  it('parses plain JSON objects and arrays', () => {
    expect(safeParseJson('{"a": 1}')).toEqual({ a: 1 });
    expect(safeParseJson('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('parses markdown-fenced JSON (the classic model wrapper)', () => {
    expect(safeParseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(safeParseJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('recovers JSON embedded in surrounding prose', () => {
    expect(safeParseJson('Sure! Here is the payload: {"a": {"b": 2}} — hope that helps.')).toEqual({
      a: { b: 2 }
    });
  });

  it('returns null for non-JSON output', () => {
    expect(safeParseJson('The derivative is computed with the power rule.')).toBeNull();
    expect(safeParseJson('')).toBeNull();
    expect(safeParseJson('{broken')).toBeNull();
  });
});
