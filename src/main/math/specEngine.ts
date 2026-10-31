/**
 * Deterministic seeding for procedural problems (architecture.md §6A):
 * the same (templateId, seed) pair must always produce the same instance,
 * so the main process can re-derive a problem from a lightweight reference.
 */

/** FNV-1a 32-bit — stable string hash for mixing template ids into seeds. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 — tiny, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-template stream: different templates diverge from the same seed. */
export function seededRandom(templateId: string, seed: number): () => number {
  return mulberry32(fnv1a32(`${templateId}:${seed >>> 0}`));
}

export type VariableSpec =
  | { kind: 'random'; min: number; max: number }
  | { kind: 'expression'; source: string };

const RANDOM_SPEC = /^random_int_range\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/;

/**
 * Variable specs come from template JSON (untrusted-ish authoring data):
 *  - "random_int_range(min, max)" — seeded uniform integer draw
 *  - anything else — an integer arithmetic expression over previously
 *    generated variables (e.g. "coeff * power", "power - 1")
 */
export function parseVariableSpec(spec: string): VariableSpec {
  const match = RANDOM_SPEC.exec(spec.trim());
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (max < min) {
      throw new Error(`random_int_range max ${max} is below min ${min}`);
    }
    return { kind: 'random', min, max };
  }
  return { kind: 'expression', source: spec.trim() };
}

/** Resolves one variable spec against already-generated variables. */
export function resolveVariableSpec(
  spec: string,
  vars: Record<string, number>,
  prng: () => number
): number {
  const parsed = parseVariableSpec(spec);
  if (parsed.kind === 'random') {
    return parsed.min + Math.floor(prng() * (parsed.max - parsed.min + 1));
  }
  return evaluateIntegerExpression(parsed.source, vars);
}

// ---------------------------------------------------------------------------
// Safe integer arithmetic evaluator — no eval/Function; validates that an
// expression only contains integer literals, known variables, + - * / ( ).
// ---------------------------------------------------------------------------

type Token = { type: 'num' | 'ident' | 'op' | 'lparen' | 'rparen'; value: string };

function tokenize(source: string): Token[] {
  const rest = source.replace(/\s+/g, '');
  const tokens: Token[] = [];
  let cursor = rest;
  while (cursor.length > 0) {
    const num = /^(\d+)/.exec(cursor);
    if (num) {
      tokens.push({ type: 'num', value: num[1] });
      cursor = cursor.slice(num[1].length);
      continue;
    }
    const ident = /^([A-Za-z_]\w*)/.exec(cursor);
    if (ident) {
      tokens.push({ type: 'ident', value: ident[1] });
      cursor = cursor.slice(ident[1].length);
      continue;
    }
    const head = cursor[0];
    if ('+-*/'.includes(head)) {
      tokens.push({ type: 'op', value: head });
      cursor = cursor.slice(1);
      continue;
    }
    if (head === '(') {
      tokens.push({ type: 'lparen', value: head });
      cursor = cursor.slice(1);
      continue;
    }
    if (head === ')') {
      tokens.push({ type: 'rparen', value: head });
      cursor = cursor.slice(1);
      continue;
    }
    throw new Error(`Illegal character '${head}' in expression '${source}'`);
  }
  return tokens;
}

class ExpressionParser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly vars: Record<string, number>,
    private readonly source: string
  ) {}

  private next(): Token | undefined {
    return this.tokens[this.pos];
  }

  parse(): number {
    const value = this.parseSum();
    if (this.pos !== this.tokens.length) {
      throw new Error(`Unexpected token after expression in '${this.source}'`);
    }
    return value;
  }

  private parseSum(): number {
    let left = this.parseProduct();
    while (this.next()?.type === 'op' && (this.next()?.value === '+' || this.next()?.value === '-')) {
      const op = this.next()?.value;
      this.pos += 1;
      const right = this.parseProduct();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseProduct(): number {
    let left = this.parseFactor();
    while (this.next()?.type === 'op' && (this.next()?.value === '*' || this.next()?.value === '/')) {
      const op = this.next()?.value;
      this.pos += 1;
      const right = this.parseFactor();
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) {
          throw new Error(`Division by zero in '${this.source}'`);
        }
        if (left % right !== 0) {
          throw new Error(
            `Division in '${this.source}' does not yield an integer (${left} / ${right})`
          );
        }
        left = left / right;
      }
    }
    return left;
  }

  private parseFactor(): number {
    const token = this.next();
    if (!token) {
      throw new Error(`Unexpected end of expression '${this.source}'`);
    }
    if (token.type === 'op' && token.value === '-') {
      this.pos += 1;
      return -this.parseFactor();
    }
    if (token.type === 'op' && token.value === '+') {
      this.pos += 1;
      return this.parseFactor();
    }
    if (token.type === 'num') {
      this.pos += 1;
      return Number(token.value);
    }
    if (token.type === 'ident') {
      if (!(token.value in this.vars)) {
        throw new Error(`Unknown variable '${token.value}' in expression '${this.source}'`);
      }
      this.pos += 1;
      return this.vars[token.value];
    }
    if (token.type === 'lparen') {
      this.pos += 1;
      const value = this.parseSum();
      if (this.next()?.type !== 'rparen') {
        throw new Error(`Missing closing parenthesis in '${this.source}'`);
      }
      this.pos += 1;
      return value;
    }
    throw new Error(`Unexpected token '${token.value}' in expression '${this.source}'`);
  }
}

/** Evaluates an integer-only arithmetic expression over the given variables. */
export function evaluateIntegerExpression(source: string, vars: Record<string, number>): number {
  return new ExpressionParser(tokenize(source), vars, source).parse();
}
