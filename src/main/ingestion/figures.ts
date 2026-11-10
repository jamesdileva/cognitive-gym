import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPageAsImage } from 'unpdf';

export interface FigureRecord {
  page: number;
  /** PNG file path under figuresDir. */
  path: string;
  /** Base64 PNG for VL models. */
  base64: string;
}

export interface DescribePagesOptions {
  figuresDir: string;
  bookSlug: string;
  /** Vision-language model tag; null skips descriptions entirely. */
  vlModel: string | null;
  client: {
    chat(request: {
      model: string;
      messages: { role: 'user'; content: string; images: string[] }[];
    }): Promise<{ text: string }>;
  };
  /** Hard cap on rendered+described pages per run. */
  maxPages?: number;
}

const PAGE_PROMPT =
  'This is a page from a textbook. Describe only its diagrams, figures, charts, graphs, ' +
  'and images — what they show, their labels, axes, and the relationships depicted. ' +
  'Ignore regular body text. 2-5 sentences.';

/** Vision-language model tag detection — prefers explicit VL model names. */
export function detectVisionModel(models: string[]): string | null {
  return (
    models.find((model) => /(?:vision|llava|minicpm|moondream|vl:|_vl|-vl|vl-\d|qwen.*vl)/i.test(model)) ??
    null
  );
}

/**
 * Renders the given PDF pages to PNG files and (when a VL model is available)
 * returns a per-page visual description. Pages are deduped and capped; a page
 * that fails to render or describe is skipped gracefully — text ingestion must
 * never fail because figure enrichment could not.
 */
export async function describePages(
  pdfData: Buffer,
  pages: number[],
  options: DescribePagesOptions
): Promise<Map<number, string>> {
  const unique = [...new Set(pages)].sort((a, b) => a - b).slice(0, options.maxPages ?? 8);
  const described = new Map<number, string>();
  if (unique.length === 0) return described;

  const figureDir = join(options.figuresDir, options.bookSlug);
  mkdirSync(figureDir, { recursive: true });

  for (const page of unique) {
    try {
      const png = Buffer.from(
        (await renderPageAsImage(new Uint8Array(pdfData), page, {
          canvasImport: async () => await import('@napi-rs/canvas'),
          scale: 1.5
        })) as Uint8Array
      );
      const file = join(figureDir, `p${page}.png`);
      writeFileSync(file, png);

      if (!options.vlModel) continue;
      const result = await options.client.chat({
        model: options.vlModel,
        messages: [
          {
            role: 'user',
            content: PAGE_PROMPT,
            images: [png.toString('base64')]
          }
        ]
      });
      described.set(page, result.text.trim());
    } catch {
      // Figures are enrichment — one bad page never fails ingestion.
    }
  }
  return described;
}

/**
 * Appends per-page visual descriptions to a chunk's text, marked as enrichment
 * so the distiller can reference figure information in its questions.
 */
export function attachFigureDescriptions(
  chunkText: string,
  descriptions: Map<number, string>,
  fromPage: number,
  toPage: number
): string {
  const lines: string[] = [];
  for (let page = fromPage; page <= toPage; page += 1) {
    const description = descriptions.get(page);
    if (description) {
      lines.push(`[Visual content from page ${page}: ${description}]`);
    }
  }
  return lines.length > 0 ? `${chunkText}\n\n${lines.join('\n')}` : chunkText;
}
