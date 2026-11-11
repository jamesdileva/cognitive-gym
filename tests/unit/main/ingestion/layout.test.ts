import { describe, expect, it } from 'vitest';
import {
  clusterLines,
  isTwoColumn,
  joinLine,
  layoutParagraphs,
  type PositionedTextItem
} from '@main/ingestion/layout';

function item(str: string, x: number, y: number, width = 50, height = 12): PositionedTextItem {
  return { str, x, y, width, height };
}

/** Single-column page: lines of text flowing down, paragraph gap before the last line. */
function singleColumnPage(): PositionedTextItem[] {
  const items: PositionedTextItem[] = [];
  let y = 700;
  for (const line of ['The harbor kept its silence while', 'the fog moved between the masts.', 'Ships waited at anchor all night.']) {
    for (const word of line.split(' ')) {
      items.push(item(word, 72 + items.filter((i) => i.y === y).length * 40, y, 38, 12));
    }
    y -= 14; // normal line gap
  }
  y -= 24; // paragraph gap
  for (const word of ['A', 'second', 'paragraph', 'begins', 'here', 'with', 'more', 'text.']) {
    items.push(item(word, 72 + items.filter((i) => i.y === y).length * 40, y, 38, 12));
    y -= 14;
  }
  return items;
}

describe('layoutParagraphs (pure layout from positioned items)', () => {
  it('returns empty for no items', () => {
    expect(layoutParagraphs([])).toEqual([]);
  });

  it('single column: y-gap produces paragraph breaks, normal gaps do not', () => {
    const paragraphs = layoutParagraphs(singleColumnPage());
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]).toContain('harbor kept its silence');
    expect(paragraphs[1]).toContain('second paragraph begins');
  });

  it('dehyphenates words split across lines', () => {
    const items = [
      item('The captain inspected the equip-', 72, 700, 200, 12),
      item('ment before departure.', 72, 686, 200, 12)
    ];
    const paragraphs = layoutParagraphs(items);
    expect(paragraphs[0]).toContain('equipment before');
    expect(paragraphs[0]).not.toContain('equip- ment');
  });

  it('joins items with single spaces (no double spaces)', () => {
    const paragraphs = layoutParagraphs([item('One', 72, 700, 30, 12), item('two.', 110, 700, 30, 12)]);
    expect(paragraphs[0]).toBe('One two.');
  });
});

describe('isTwoColumn', () => {
  it('detects two clear columns (most lines split at the center gap)', () => {
    const items: PositionedTextItem[] = [];
    let y = 700;
    for (let row = 0; row < 8; row += 1) {
      items.push(item(`Left ${row} words here.`, 72, y, 180, 12));
      items.push(item(`Right ${row} words there.`, 320, y, 180, 12));
      y -= 16;
    }
    const lines = clusterLines(items);
    // spanX = 500 (max right edge) - 72 (min x) = 428; threshold = 64.2 < gap 68
    expect(isTwoColumn(lines, 428)).toBe(true);
  });

  it('rejects single-column pages (figure labels only occasionally gap)', () => {
    const items: PositionedTextItem[] = [];
    let y = 700;
    for (let row = 0; row < 8; row += 1) {
      items.push(item(`Continuous ${row} text flowing across.`, 72, y, 300, 12));
      y -= 16;
    }
    const lines = clusterLines(items);
    expect(isTwoColumn(lines, 500)).toBe(false);
  });
});

describe('two-column reading order', () => {
  it('reads the left column fully before the right column', () => {
    const items: PositionedTextItem[] = [];
    let y = 700;
    for (let row = 0; row < 6; row += 1) {
      items.push(item(`L${row} left text continues.`, 72, y, 180, 12));
      items.push(item(`R${row} right text continues.`, 320, y, 180, 12));
      y -= 16;
    }
    const paragraphs = layoutParagraphs(items);
    const all = paragraphs.join(' ');
    const lastLeft = all.lastIndexOf('L5');
    const firstRight = all.indexOf('R0');
    expect(lastLeft).toBeGreaterThanOrEqual(0);
    expect(firstRight).toBeGreaterThan(lastLeft); // right column read after left
  });
});

describe('joinLine', () => {
  it('dehyphenates and joins without double spaces', () => {
    expect(joinLine([item('equip-', 0, 0), item('ment.', 50, 0)])).toBe('equipment.');
    expect(joinLine([item('a', 0, 0), item('b', 20, 0)])).toBe('a b');
  });
});
