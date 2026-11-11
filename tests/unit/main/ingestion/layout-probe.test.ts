/** TEMPORARY probe — text item positions on Knight Physics page 50. DELETE after run. */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { getDocumentProxy } from 'unpdf';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const PHYSICS = join(REPO_ROOT, 'PhysicSciEng3rdKnight.pdf');

interface ProbeItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

describe('probe: text item positions on Knight Physics p50', () => {
  it('maps x/y distribution and column structure', { timeout: 300_000 }, async () => {
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(PHYSICS)));
    const page = await pdf.getPage(50);
    const content = await page.getTextContent();

    const items: ProbeItem[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const t = item as unknown as { str: string; transform: number[]; width: number; height: number };
      if (t.str.trim() === '') continue;
      items.push({ str: t.str, x: t.transform[4], y: t.transform[5], width: t.width, height: t.height });
    }

    const xs = items.map((i) => i.x);
    const ys = items.map((i) => i.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs.map((x, i) => x + items[i].width));
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX;

    console.log(
      'item stats:',
      JSON.stringify({
        items: items.length,
        minX: Math.round(minX),
        maxX: Math.round(maxX),
        spanX: Math.round(spanX),
        minY: Math.round(minY),
        maxY: Math.round(maxY),
        sample: items.slice(0, 3).map((i) => ({ str: i.str.slice(0, 20), x: Math.round(i.x), y: Math.round(i.y) }))
      })
    );

    // Column detection heuristic preview: for each line (y-cluster), find the
    // largest internal gap between sorted items.
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; items: ProbeItem[] }[] = [];
    for (const item of sorted) {
      const line = lines.find((l) => Math.abs(l.y - item.y) < item.height * 0.6);
      if (line) line.items.push(item);
      else lines.push({ y: item.y, items: [item] });
    }
    const twoColLines = lines.filter((line) => {
      const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
      let maxGap = 0;
      for (let i = 1; i < sortedItems.length; i += 1) {
        const prevEnd = sortedItems[i - 1].x + sortedItems[i - 1].width;
        const gap = sortedItems[i].x - prevEnd;
        if (gap > maxGap) maxGap = gap;
      }
      return maxGap > spanX * 0.15;
    }).length;

    console.log(
      'layout preview:',
      JSON.stringify({ lines: lines.length, twoColLines, spanX: Math.round(spanX) })
    );
  });
});
