import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachFigureDescriptions,
  describePages,
  detectVisionModel
} from '@main/ingestion/figures';

// The fake PDF bytes can't render — mock the PDF renderer so describePages
// exercises its own save/describe logic deterministically.
vi.mock('unpdf', () => ({
  renderPageAsImage: vi.fn(async () =>
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])
  )
}));

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cg-fig-'));
  tempDirs.push(dir);
  return dir;
}

// PNG signature + IHDR skeleton — returned by the mocked renderer.
const tinyPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 4, 0, 0, 0, 4, 8, 2, 0, 0, 0
]);

// renderPageAsImage is mocked so describePages exercises its own save/describe
// logic without a real PDF (see vi.mock above).
vi.mock('unpdf', () => ({
  renderPageAsImage: vi.fn(async () => tinyPng)
}));

function makeClient(descriptions: string[] | null) {
  const calls: { model: string; messages: { content: string; images: string[] }[] }[] = [];
  return {
    calls,
    client: {
      chat: vi.fn(async (request: { model: string; messages: { content: string; images: string[] }[] }) => {
        calls.push(request);
        if (descriptions === null) throw new Error('model not found');
        return { text: descriptions[calls.length - 1] ?? 'fallback description' };
      }),
      listModels: vi.fn(async () => ['llama3.1:8b', 'qwen2.5vl:3b'])
    }
  };
}

describe('detectVisionModel', () => {
  it('detects explicit VL model names', () => {
    expect(
      detectVisionModel(['llama3.1:8b', 'qwen2.5vl:3b', 'embeddinggemma:latest'])
    ).toBe('qwen2.5vl:3b');
    expect(detectVisionModel(['llava:13b'])).toBe('llava:13b');
    expect(detectVisionModel(['moondream:latest'])).toBe('moondream:latest');
  });

  it('returns null when no VL model is installed', () => {
    expect(detectVisionModel(['llama3.1:8b', 'qwen2.5:7b-instruct'])).toBeNull();
    expect(detectVisionModel([])).toBeNull();
  });
});

describe('attachFigureDescriptions', () => {
  it('appends descriptions for pages inside the chunk span only', () => {
    const descriptions = new Map<number, string>([
      [41, 'A free-body diagram of the block.'],
      [42, 'A graph of velocity versus time.'],
      [60, 'An unrelated figure.']
    ]);
    const enriched = attachFigureDescriptions('Body text.', descriptions, 41, 42, (page) => `figures/knight/p${page}.png`);
    expect(enriched).toContain('Body text.');
    expect(enriched).toContain('[Visual content from page 41: A free-body diagram of the block.]');
    expect(enriched).toContain('[Visual content from page 42: A graph of velocity versus time.]');
    expect(enriched).toContain('[figure: figures/knight/p41.png]');
    expect(enriched).toContain('[figure: figures/knight/p42.png]');
    expect(enriched).not.toContain('unrelated figure');
  });

  it('returns the chunk unchanged when no descriptions map to its span', () => {
    const descriptions = new Map<number, string>([[99, 'elsewhere']]);
    expect(attachFigureDescriptions('Body text.', descriptions, 41, 42, () => 'x.png')).toBe('Body text.');
  });
});

describe('describePages', () => {
  const pdfData = Buffer.from('fake pdf bytes');

  it('renders pages, saves PNGs, and describes them via the VL model', async () => {
    const dir = makeTempDir();
    const { client, calls } = makeClient(['A physics diagram showing force vectors.']);

    const described = await describePages(pdfData, [41, 42], {
      figuresDir: dir,
      bookSlug: 'test-book',
      vlModel: 'qwen2.5vl:3b',
      client,
      maxPages: 8
    });

    expect(described.size).toBe(2);
    expect(described.get(41)).toBe('A physics diagram showing force vectors.');
    expect(calls[0].messages[0].images[0].length).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'test-book', 'p41.png'))).toBe(true);
    expect(existsSync(join(dir, 'test-book', 'p42.png'))).toBe(true);
  });

  it('caps the number of described pages', async () => {
    const dir = makeTempDir();
    const { client } = makeClient(['d']);
    const described = await describePages(pdfData, [1, 2, 3, 4, 5], {
      figuresDir: dir,
      bookSlug: 'b',
      vlModel: 'qwen2.5vl:3b',
      client,
      maxPages: 2
    });
    expect(described.size).toBe(2);
    expect(client.chat).toHaveBeenCalledTimes(2);
  });

  it('skips descriptions entirely when no VL model is available (PNGs still saved)', async () => {
    const dir = makeTempDir();
    const { client } = makeClient(['d']);
    const described = await describePages(pdfData, [41], {
      figuresDir: dir,
      bookSlug: 'b',
      vlModel: null,
      client
    });
    expect(described.size).toBe(0);
    expect(client.chat).not.toHaveBeenCalled();
    expect(existsSync(join(dir, 'b', 'p41.png'))).toBe(true);
  });

  it('skips a page whose render or description fails (enrichment never throws)', async () => {
    const dir = makeTempDir();
    const failing = {
      chat: vi.fn(async () => {
        throw new Error('VL model exploded');
      }),
      listModels: vi.fn(async () => ['qwen2.5vl:3b'])
    };
    // Page 9 deliberately invalid (0 is not a real page number in most PDFs,
    // but the mock doesn't care — we simulate failure via the VL call itself).
    const described = await describePages(pdfData, [41], {
      figuresDir: dir,
      bookSlug: 'b',
      vlModel: 'qwen2.5vl:3b',
      client: failing
    });
    // chat throws → graceful skip → empty map
    expect(described.size).toBe(0);
  });
});

describe('resolveFigurePath (security containment)', () => {
  it('resolves normal paths inside figuresDir', async () => {
    const { resolveFigurePath } = await import('@main/ingestion/figures');
    const dir = makeTempDir();
    const resolved = resolveFigurePath(dir, 'figures/knight/p42.png');
    expect(resolved).toBe(join(dir, 'figures', 'knight', 'p42.png'));
  });

  it('rejects traversal outside figuresDir', async () => {
    const { resolveFigurePath } = await import('@main/ingestion/figures');
    const dir = makeTempDir();
    expect(resolveFigurePath(dir, '../secrets/key.txt')).toBeNull();
    expect(resolveFigurePath(dir, 'figures/../../important.doc')).toBeNull();
  });

  it('rejects non-png files', async () => {
    const { resolveFigurePath } = await import('@main/ingestion/figures');
    const dir = makeTempDir();
    expect(resolveFigurePath(dir, 'figures/knight/p42.exe')).toBeNull();
  });
});
