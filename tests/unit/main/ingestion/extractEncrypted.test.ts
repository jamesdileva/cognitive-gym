/** Encrypted-PDF error mapping test — isolated vi.mock('unpdf'). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractDocument } from '@main/ingestion/extract';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('fake pdf bytes')),
}));
vi.mock('unpdf', () => ({
  extractText: vi.fn(),
  extractTextItems: vi.fn(),
  getDocumentProxy: vi.fn(),
}));

const { getDocumentProxy } = await import('unpdf');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractDocument — encrypted PDF error mapping', () => {
  it('maps PasswordException to a clear user-facing message', async () => {
    const passwordError = Object.assign(new Error('No password given'), {
      name: 'PasswordException'
    });
    vi.mocked(getDocumentProxy).mockRejectedValue(passwordError);

    await expect(extractDocument('C:\\books\\locked.pdf')).rejects.toThrow(
      /password-protected/
    );
  });

  it('maps other pdf.js errors through unchanged', async () => {
    vi.mocked(getDocumentProxy).mockRejectedValue(
      Object.assign(new Error('bad xref'), { name: 'InvalidPDFException' })
    );

    await expect(extractDocument('C:\\books\\broken.pdf')).rejects.toThrow(/bad xref/);
  });
});
