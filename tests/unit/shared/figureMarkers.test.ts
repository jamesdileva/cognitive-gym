import { describe, expect, it } from 'vitest';
import { parseFigureSegments } from '@shared/figure-markers';

const MARKER_TEXT =
  'Paragraph one about forces.\n\n' +
  '[Visual content from page 42: A free-body diagram of a block on an incline.]\n' +
  '[figure: figures/PhysicSciEng3rdKnight/p42.png]\n\n' +
  'Paragraph two after the figure.';

describe('parseFigureSegments', () => {
  it('splits text into text and figure segments in reading order', () => {
    const segments = parseFigureSegments(MARKER_TEXT);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: 'text', text: expect.stringContaining('Paragraph one') });
    expect(segments[1]).toEqual({
      kind: 'figure',
      page: 42,
      description: 'A free-body diagram of a block on an incline.',
      relPath: 'figures/PhysicSciEng3rdKnight/p42.png'
    });
    expect(segments[2]).toEqual({ kind: 'text', text: expect.stringContaining('Paragraph two') });
  });

  it('returns one text segment when there are no markers', () => {
    const segments = parseFigureSegments('Just plain text.');
    expect(segments).toEqual([{ kind: 'text', text: 'Just plain text.' }]);
  });

  it('handles multiple figures', () => {
    const text =
      '[Visual content from page 4: Chart A.]\n[figure: figures/b/p4.png]\n\n' +
      '[Visual content from page 5: Chart B.]\n[figure: figures/b/p5.png]';
    const segments = parseFigureSegments(text);
    const figures = segments.filter((s) => s.kind === 'figure');
    expect(figures).toHaveLength(2);
  });
});
