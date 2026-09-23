/**
 * NAVER FULL AUTO — every generated image of a homefeed run is 800x800, including engines that ignore
 * the requested ratio (Flow, Dropshot). Real sharp, real files (spec §2, §10; T4 size).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { currentSquareImageTarget, normalizeSquareImageTarget, runWithSquareImageTarget } from '../image/squareImageTarget';

function inMemoryBlobStore() {
  let id = 0;
  const store = new Map<string, { bytes: Uint8Array; meta: any }>();
  return {
    write: async (bytes: Uint8Array, meta: { mimeType: string; width: number; height: number }) => {
      const blobId = `SQ_${++id}`;
      const full = { blobId, ...meta, byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), createdAt: Date.now() };
      store.set(blobId, { bytes, meta: full });
      return full;
    },
    read: async (blobId: string) => {
      const entry = store.get(blobId);
      return entry ? { ok: true as const, bytes: entry.bytes, meta: entry.meta } : { ok: false as const, reason: 'missing' as const, placeholder: '' };
    },
    has: async (blobId: string) => store.has(blobId),
    hasMany: async (ids: string[]) => ids.map((blobId) => store.has(blobId)),
    materializeTempFile: async () => null,
  };
}

async function png(width: number, height: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  // A bright square on a dark field so the salient ("attention") crop has something to find.
  const base = sharp({ create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } } });
  const spot = await sharp({ create: { width: Math.round(height / 3), height: Math.round(height / 3), channels: 3, background: { r: 250, g: 220, b: 40 } } }).png().toBuffer();
  return base.composite([{ input: spot, left: Math.round(width * 0.7), top: Math.round(height / 3) }]).png().toBuffer();
}

async function dims(filePath: string): Promise<{ width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(filePath).metadata();
  return { width: meta.width || 0, height: meta.height || 0 };
}

let tmpDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fullauto-square-'));
  process.env.TEST_MODE = 'true';
  process.env.GENERATED_IMAGES_DIR = tmpDir;
  const { _setBlobStoreInstanceForTesting } = await import('../main/blobStore/singleton.js');
  _setBlobStoreInstanceForTesting(inMemoryBlobStore() as any);
});

afterEach(async () => {
  delete process.env.TEST_MODE;
  delete process.env.GENERATED_IMAGES_DIR;
  const { _setBlobStoreInstanceForTesting } = await import('../main/blobStore/singleton.js');
  _setBlobStoreInstanceForTesting(null);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
});

describe('FULL AUTO 800x800 square target', () => {
  it('only valid sizes turn the target on, and it is scoped to the run', async () => {
    expect(normalizeSquareImageTarget(800)).toBe(800);
    expect(normalizeSquareImageTarget(undefined)).toBeNull();
    expect(normalizeSquareImageTarget(10)).toBeNull();
    expect(currentSquareImageTarget()).toBeNull();
    await runWithSquareImageTarget(800, async () => {
      await Promise.resolve();
      expect(currentSquareImageTarget()).toBe(800);
    });
    expect(currentSquareImageTarget()).toBeNull();
  });

  it('a 16:9 engine output becomes 800x800 inside a homefeed run, and the image record says so', async () => {
    const { writeImageFile } = await import('../image/imageUtils.js');
    const refused = await runWithSquareImageTarget(800, () => writeImageFile(Buffer.alloc(0), 'png').catch(() => null));
    expect(refused).toBeNull(); // empty buffers are still refused

    const wide = await runWithSquareImageTarget(800, async () => writeImageFile(await png(1600, 900), 'png', 'flow-wide'));
    expect(await dims(wide.filePath)).toEqual({ width: 800, height: 800 });
    // GeneratedImage.width/height (blob meta) describe the saved bytes — the publish check reads them.
    expect(wide.width).toBe(800);
    expect(wide.height).toBe(800);
  });

  it('outside a homefeed run the user ratio is kept (16:9 stays wide)', async () => {
    const { writeImageFile } = await import('../image/imageUtils.js');
    const wide = await writeImageFile(await png(1600, 900), 'png', 'user-ratio');
    expect(await dims(wide.filePath)).toEqual({ width: 800, height: 450 });
    expect(wide.width).toBe(800);
  });

  it('collected / downloaded photos are never forced square (keepAspect)', async () => {
    const { writeImageFile } = await import('../image/imageUtils.js');
    const photo = await runWithSquareImageTarget(800, async () => writeImageFile(await png(1600, 900), 'png', 'news-photo', undefined, undefined, { keepAspect: true }));
    expect((await dims(photo.filePath)).width).toBe(1200);
  });
});
