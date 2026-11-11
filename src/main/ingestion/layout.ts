/**
 * Position-aware text layout for PDF extraction (Sprint 17 hardening).
 *
 * pdf.js text items carry x/y positions, which the blank-line heuristic
 * ignores — academic two-column layouts (e.g. Knight Physics) collapse into
 * one wall of text without this. Pure function: takes positioned text items,
 * returns paragraphs in reading order.
 *
 * Algorithm:
 *  1. Cluster items into visual lines by y (tolerance scales with font size).
 *  2. Detect two-column pages: if most multi-item lines show a large internal
 *     x-gap, split the page at the midpoint and read left column, then right.
 *  3. Within each flow, insert paragraph breaks where the vertical gap
 *     between consecutive lines exceeds ~1.6× the median line gap.
 */

export interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const LINE_TOLERANCE = 0.6;
const COLUMN_SPLIT_RATIO = 0.15;
const TWO_COLUMN_LINE_RATIO = 0.5;
const MIN_LINES_FOR_COLUMNS = 4;
const PARA_BREAK_RATIO = 1.6;

/** Clusters items into visual lines (top-to-bottom, left-to-right within). */
export function clusterLines(items: PositionedTextItem[]): PositionedTextItem[][] {
  const usable = items.filter((item) => item.str.trim() !== '');
  if (usable.length === 0) return [];

  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedTextItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    const reference = last?.[0];
    const tolerance = Math.max(item.height, reference?.height ?? 0) * LINE_TOLERANCE;
    if (reference && Math.abs(reference.y - item.y) <= tolerance) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** Joins a visual line's items into one string, dehyphenating word splits. */
export function joinLine(items: PositionedTextItem[]): string {
  let out = '';
  for (const item of items) {
    const text = item.str;
    if (out === '') out = text;
    else if (out.endsWith('-') && /^[a-z]/.test(text)) out = out.slice(0, -1) + text;
    else out += ' ' + text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** True when the page's lines split into two clear columns. */
export function isTwoColumn(lines: PositionedTextItem[][], spanX: number): boolean {
  if (spanX <= 0 || lines.length < MIN_LINES_FOR_COLUMNS) return false;
  let multiItemLines = 0;
  let splitLines = 0;
  for (const line of lines) {
    if (line.length < 2) continue;
    multiItemLines += 1;
    let maxGap = 0;
    for (let i = 1; i < line.length; i += 1) {
      const gap = line[i].x - (line[i - 1].x + line[i - 1].width);
      if (gap > maxGap) maxGap = gap;
    }
    if (maxGap > spanX * COLUMN_SPLIT_RATIO) splitLines += 1;
  }
  return multiItemLines > 0 && splitLines / multiItemLines >= TWO_COLUMN_LINE_RATIO;
}

/** Builds paragraphs from an ordered set of items using y-gap analysis. */
export function buildFlow(items: PositionedTextItem[]): string[] {
  if (items.length === 0) return [];
  const lines = clusterLines(items);
  if (lines.length === 1) return [joinLine(lines[0])];

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const gap = lines[i - 1][0].y - lines[i][0].y;
    if (gap > 0) gaps.push(gap);
  }
  const positive = [...gaps].sort((a, b) => a - b);
  const medianGap = positive.length > 0 ? positive[Math.floor(positive.length / 2)] : 0;
  const breakThreshold = medianGap * PARA_BREAK_RATIO;

  const paragraphs: string[] = [];
  let current: PositionedTextItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      const gap = lines[i - 1][0].y - lines[i][0].y;
      if (gap > breakThreshold && current.length > 0) {
        paragraphs.push(joinLine(current));
        current = [];
      }
    }
    current.push(...lines[i]);
  }
  if (current.length > 0) paragraphs.push(joinLine(current));

  return paragraphs.map((paragraph) => paragraph.replace(/\s+/g, ' ').trim()).filter((p) => p !== '');
}

/** Full layout: paragraphs in reading order for one page's items. */
export function layoutParagraphs(items: PositionedTextItem[]): string[] {
  const usable = items.filter((item) => item.str.trim() !== '');
  if (usable.length === 0) return [];

  const minX = Math.min(...usable.map((item) => item.x));
  const maxX = Math.max(...usable.map((item) => item.x + item.width));
  const spanX = maxX - minX;
  const lines = clusterLines(usable);

  if (isTwoColumn(lines, spanX)) {
    const midX = minX + spanX / 2;
    const left = usable.filter((item) => item.x + item.width / 2 < midX);
    const right = usable.filter((item) => item.x + item.width / 2 >= midX);
    return [...buildFlow(left), ...buildFlow(right)];
  }
  return buildFlow(usable);
}
