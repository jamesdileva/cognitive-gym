/**
 * Model output that is *supposed* to be JSON (blueprint.md §3 requires strict,
 * escape-compliant JSON from ingestion agents) is still untrusted text.
 * This helper extracts the first parseable JSON value, tolerating the common
 * failure mode of markdown-fenced or prose-wrapped responses.
 * Callers must still validate the resulting shape against a schema.
 */
export function safeParseJson(text: string): unknown | null {
  const trimmed = text.trim();

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  // Strip a single ```json ... ``` / ``` ... ``` fence if present.
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  if (fenced) {
    const inner = tryParse(fenced[1]);
    if (inner !== undefined) return inner;
  }

  // Last resort: first { or [ to last matching brace/bracket.
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start !== -1) {
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (end > start) {
      const sliced = tryParse(trimmed.slice(start, end + 1));
      if (sliced !== undefined) return sliced;
    }
  }

  return null;
}

function tryParse(candidate: string): unknown | undefined {
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return undefined;
  }
}
