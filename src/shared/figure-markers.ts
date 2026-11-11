/**
 * Parses figure markers out of passage/episode text (Sprint 16).
 *
 * Markers are emitted by the ingestion pipeline as a two-line pair:
 *   [Visual content from page 42: <description>]
 *   [figure: figures/<book>/p42.png]
 *
 * The parser splits text into renderable segments: plain text and figure
 * images (each with its description). Pure and renderer-safe.
 */

export type TextSegment = { kind: 'text'; text: string };
export interface FigureSegment {
  kind: 'figure';
  page: number;
  description: string;
  /** Path relative to the app's figures directory. */
  relPath: string;
}
export type TextSegmentOrFigure = TextSegment | FigureSegment;

const PAIR_PATTERN =
  /\[Visual content from page (\d+): ([^\]]+)\]\n?\[figure: ([^\]]+)\]/g;

/** Splits text into text and figure segments in reading order. */
export function parseFigureSegments(text: string): TextSegmentOrFigure[] {
  const segments: TextSegmentOrFigure[] = [];
  let cursor = 0;

  for (const match of text.matchAll(PAIR_PATTERN)) {
    const before = text.slice(cursor, match.index);
    if (before.trim().length > 0) {
      segments.push({ kind: 'text', text: before });
    }
    segments.push({
      kind: 'figure',
      page: Number(match[1]),
      description: match[2],
      relPath: match[3]
    });
    cursor = match.index + match[0].length;
  }

  const rest = text.slice(cursor);
  if (rest.trim().length > 0 || segments.length === 0) {
    segments.push({ kind: 'text', text: rest });
  }
  return segments;
}
