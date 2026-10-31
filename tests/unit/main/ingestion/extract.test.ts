import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bookKindForPath,
  extractDocument,
  splitParagraphs
} from '@main/ingestion/extract';

/** Repo root, resolved independently of the test runner's cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const FIXTURES = join(REPO_ROOT, 'tests', 'fixtures');

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-ingest-'));
  tempDirs.push(dir);
  return dir;
}

describe('splitParagraphs (normalization)', () => {
  it('de-hyphenates words broken across line wraps', () => {
    expect(splitParagraphs('The ship crossed the mid-\nnight line in silence.')).toEqual([
      'The ship crossed the midnight line in silence.'
    ]);
  });

  it('joins soft line wraps but keeps blank-line paragraph breaks', () => {
    const paragraphs = splitParagraphs('First paragraph\nwraps onto\na second line.\n\nSecond paragraph.\n\n\nThird.');
    expect(paragraphs).toEqual(['First paragraph wraps onto a second line.', 'Second paragraph.', 'Third.']);
  });

  it('drops empty paragraphs', () => {
    expect(splitParagraphs('A.\n\n   \n\nB.')).toEqual(['A.', 'B.']);
  });
});

describe('bookKindForPath', () => {
  it('accepts supported extensions case-insensitively', () => {
    expect(bookKindForPath('C:\\books\\novel.PDF')).toBe('pdf');
    expect(bookKindForPath('/books/novel.epub')).toBe('epub');
    expect(bookKindForPath('/books/notes.txt')).toBe('txt');
  });

  it('rejects unsupported formats', () => {
    expect(() => bookKindForPath('/books/photo.jpg')).toThrow(/Unsupported book format/);
  });
});

describe('extractDocument — TXT fixture (committed, synthetic)', () => {
  it('extracts paragraphs and detects the chapter marker', async () => {
    const doc = await extractDocument(join(FIXTURES, 'reading-sample.txt'));
    expect(doc.title).toBe('reading-sample');
    expect(doc.kind).toBe('txt');
    expect(doc.paragraphs.length).toBeGreaterThanOrEqual(6);
    expect(doc.paragraphs[0]).toContain('cartographer arrived in Ember Hollow');
    expect(doc.chapterStarts).toEqual([]); // "Chapter One of her commission" is mid-sentence, not a heading

    // Reconstruct: no content lost in normalization.
    const rejoined = doc.paragraphs.join('\n\n');
    expect(rejoined).toContain('surveyor\'s first instrument is patience');
  });
});

/**
 * Builds a minimal but structurally valid single-page PDF with computed xref
 * offsets — no PDF-writer dependency needed for unit-testing extraction.
 */
function makeMinimalPdf(lines: string[]): Buffer {
  const escaped = lines.map((line) => line.replace(/([()\\])/g, '\\$1'));
  const contentCommands = ['BT', '/F1 12 Tf', '14 TL', '72 720 Td', ...escaped.map((line) => `(${line}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${contentCommands.length}>>\nstream\n${contentCommands}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `${xref}trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

describe('extractDocument — PDF (synthetic minimal PDF)', () => {
  it('extracts the text layer from a valid PDF', async () => {
    const dir = makeTempDir();
    const path = join(dir, 'synthetic.pdf');
    writeFileSync(path, makeMinimalPdf(['The lighthouse keeper counted the seconds aloud.', 'Nine hundred and twelve, then silence.']));

    const doc = await extractDocument(path);
    expect(doc.kind).toBe('pdf');
    expect(doc.title).toBe('synthetic');
    const text = doc.paragraphs.join(' ');
    expect(text).toContain('lighthouse keeper');
    expect(text).toContain('Nine hundred and twelve');
  });
});

describe('extractDocument — EPUB (synthetic, built in-test)', () => {
  it('walks the spine in order and keeps paragraphs', () => {
    const dir = makeTempDir();
    const path = join(dir, 'synthetic.epub');

    const zip = new AdmZip();
    zip.addFile('mimetype', Buffer.from('application/epub+zip'));
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    );
    zip.addFile(
      'OEBPS/content.opf',
      Buffer.from('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>')
    );
    zip.addFile(
      'OEBPS/ch1.xhtml',
      Buffer.from('<html><body><p>Chapter One begins at the harbor.</p><p>The tide waited for no one.</p></body></html>')
    );
    zip.addFile('OEBPS/ch2.xhtml', Buffer.from('<html><body><p>Chapter Two left the harbor behind.</p></body></html>'));
    zip.writeZip(path);

    return extractDocument(path).then((doc) => {
      expect(doc.kind).toBe('epub');
      expect(doc.paragraphs).toEqual([
        'Chapter One begins at the harbor.',
        'The tide waited for no one.',
        'Chapter Two left the harbor behind.'
      ]);
      // Chapter headings are detected from typography.
      expect(doc.chapterStarts).toEqual([0, 2]);
    });
  });

  it('decodes HTML entities inside paragraphs', () => {
    const dir = makeTempDir();
    const path = join(dir, 'entities.epub');
    const zip = new AdmZip();
    zip.addFile('mimetype', Buffer.from('application/epub+zip'));
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>')
    );
    zip.addFile(
      'content.opf',
      Buffer.from('<package xmlns="http://www.idpf.org/2007/opf" version="2.0"><manifest><item id="c1" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>')
    );
    zip.addFile('c.xhtml', Buffer.from('<html><body><p>Fish &amp; chips &lt;sold out&gt;</p></body></html>'));
    zip.writeZip(path);

    return extractDocument(path).then((doc) => {
      expect(doc.paragraphs[0]).toBe('Fish & chips <sold out>');
    });
  });
});

describe('extractDocument — failure cases', () => {
  it('rejects an empty document with a helpful message', async () => {
    const dir = makeTempDir();
    const path = join(dir, 'empty.txt');
    writeFileSync(path, '   \n\n  ');
    await expect(extractDocument(path)).rejects.toThrow(/No readable text extracted/);
  });

  it('rejects a missing file', async () => {
    await expect(extractDocument(join(tmpdir(), 'does-not-exist-12345.txt'))).rejects.toThrow();
  });
});
