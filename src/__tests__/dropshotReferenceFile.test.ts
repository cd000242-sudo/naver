import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadAsFileBuffer } from '../image/dropshotBrowser';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Dropshot local reference upload', () => {
  it.each(['path', 'file-url'] as const)('loads a local image from a %s reference', async (kind) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bln-dropshot-ref-'));
    roots.push(root);
    const imagePath = path.join(root, '대표 이미지.png');
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await fs.writeFile(imagePath, bytes);

    const reference = kind === 'file-url' ? pathToFileURL(imagePath).href : imagePath;
    const result = await downloadAsFileBuffer(reference);

    expect(result?.name).toBe('대표 이미지.png');
    expect(result?.mimeType).toBe('image/png');
    expect(result?.buffer.equals(bytes)).toBe(true);
  });
});
