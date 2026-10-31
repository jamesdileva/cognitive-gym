import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import AdmZip from 'adm-zip';
import { extractText, getDocumentProxy } from 'unpdf';
import type { BookKind } from '@shared/ingestion-types';

export interface ExtractedDocument {
  /** Title derived from the file name (extension stripped). */
  title: string;
  kind: BookKind;
  /** Paragraphs in reading order, normalized. */
  paragraphs: string[];
  /** Paragraph indices that begin a chapter/part (typography heuristic). */
  chapterStarts: number[];
}

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.epub', '.txt']);

export function bookKindForPath(filePath: string): BookKind {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported book format: ${extension} (use pdf, epub, or txt)`);
  }
  return extension.slice(1) as BookKind;
}

/**
 * Structural extraction (blueprint.md §2 step 1): reads the raw text layer of
 * a book file and splits it into normalized paragraphs. No OCR — PDFs without
 * a text layer (scans) yield little/no text and fail validation downstream.
 */
export async function extractDocument(filePath: string): Promise<ExtractedDocument> {
  const kind = bookKindForPath(filePath);
  const title = basename(filePath).replace(/\.[^.]+$/, '');

  const rawText =
    kind === 'pdf'
      ? await extractPdfText(filePath)
      : kind === 'epub'
        ? await extractEpubText(filePath)
        : await readFile(filePath, 'utf-8');

  const paragraphs = splitParagraphs(rawText);
  if (paragraphs.length === 0) {
    throw new Error(
      `No readable text extracted from '${title}' — the file may be empty or a scanned PDF without a text layer`
    );
  }

  const chapterStarts = paragraphs
    .map((paragraph, index) => [paragraph, index] as const)
    .filter(([text]) => /^(chapter|part)\s+([ivxlcdm]+|\d+|\w+)\b/i.test(text.trim()))
    .map(([, index]) => index);

  return { title, kind, paragraphs, chapterStarts };
}

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : text;
}

/** Best-effort EPUB v2/v3: spine-ordered XHTML documents, paragraph-faithful. */
async function extractEpubText(filePath: string): Promise<string> {
  const zip = new AdmZip(filePath);

  const container = zip.readAsText('META-INF/container.xml');
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) {
    throw new Error('EPUB is missing META-INF/container.xml or its rootfile declaration');
  }
  const opf = zip.readAsText(opfPath);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\s+[^>]*?id="([^"]+)"[^>]*?href="([^"]+)"[^>]*?\/?>/g)) {
    manifest.set(match[1], match[2]);
  }

  const spineIds = [...opf.matchAll(/<itemref\s+[^>]*?idref="([^"]+)"/g)].map((m) => m[1]);
  const hrefs = spineIds.map((id) => manifest.get(id)).filter((href): href is string => Boolean(href));

  const paragraphs: string[] = [];
  for (const href of hrefs) {
    const file = zip.getEntry(decodeURIComponent(opfDir + href));
    if (!file) continue;
    paragraphs.push(...extractXhtmlParagraphs(file.getData().toString('utf-8')));
  }
  return paragraphs.join('\n\n');
}

function extractXhtmlParagraphs(xhtml: string): string[] {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  const paragraphMatches = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  const source = paragraphMatches.length > 0 ? paragraphMatches.map((m) => m[1]) : [body];
  return source
    .map((chunk) => decodeEntities(chunk.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Normalizes raw book text into paragraphs:
 *  - de-hyphenates words broken across line wraps ("exam-\nple" → "example")
 *  - joins single line breaks (soft wraps) into flowing lines
 *  - treats blank-line runs as paragraph boundaries
 */
export function splitParagraphs(rawText: string): string[] {
  const text = rawText
    .replace(/\r\n?/g, '\n')
    .replace(/(\w)-\n(?=\w)/g, '$1')
    .replace(/(?<=\S)\n(?=\S)/g, ' ');

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}
