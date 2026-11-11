/**
 * Math display formatting (polish pass): templates write exponents in caret
 * notation (`x^5`, `x^{10}`) — the UI renders them as Unicode superscripts so
 * problems read like real math instead of source code.
 */

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '−': '⁻'
};

function toSuperscript(digits: string): string {
  return digits
    .split('')
    .map((char) => SUPERSCRIPT_DIGITS[char] ?? char)
    .join('');
}

/**
 * Converts caret exponents to Unicode superscripts: `x^5` → `x⁵`,
 * `x^{10}` → `x¹⁰`, `x^-2` / `x^{−2}` → `x⁻²`. Everything else passes
 * through unchanged.
 */
export function renderMathText(text: string): string {
  return text.replace(/\^\{?([-−]?[0-9]+)\}?/g, (_match, digits: string) => toSuperscript(digits));
}
