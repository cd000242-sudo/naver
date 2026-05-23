// src/__tests__/blobStore.idempotent.test.ts
// Verifies that writing the same bytes twice returns the same blob-id (sha256 dedup).

import { describe, it, expect } from 'vitest';
import { createBlobStore } from '../main/blobStore/index';
import type { FsBackend } from '../main/blobStore/fsBackend';
import type { BlobMetaInput } from '../main/blobStore/index';

// ---------------------------------------------------------------------------
// In-memory FsBackend (same pattern as blobStore.test.ts)
// ---------------------------------------------------------------------------

function createMemBackend(baseDir = '/mem-base', tempDir = '/mem-temp'): FsBackend & { _files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();

  return {
    baseDir,
    tempDir,
    _files: files,

    async ensureDir(_path: string): Promise<void> {},

    async readFile(path: string): Promise<Buffer> {
      const buf = files.get(path);
      if (!buf) throw new Error(`ENOENT: ${path}`);
      return buf;
    },

    async writeFile(path: string, data: Buffer): Promise<void> {
      files.set(path, Buffer.from(data));
    },

    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },

    async copyFile(src: string, dest: string): Promise<void> {
      const buf = files.get(src);
      if (!buf) throw new Error(`ENOENT: ${src}`);
      files.set(dest, Buffer.from(buf));
    },
  };
}

const SAMPLE_META: BlobMetaInput = { mimeType: 'image/png', width: 64, height: 64 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('blobStore — idempotent write (sha256 dedup)', () => {
  it('writing the same bytes twice returns the identical blob-id', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const meta1 = await store.write(bytes, SAMPLE_META);
    const meta2 = await store.write(bytes, SAMPLE_META);

    expect(meta1.blobId).toBe(meta2.blobId);
  });

  it('only one blob data file exists on disk after two writes of the same content', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
    const meta1 = await store.write(bytes, SAMPLE_META);
    const meta2 = await store.write(bytes, SAMPLE_META);

    // Same blob-id means same file path — only one blob file should exist.
    const blobFiles = Array.from(backend._files.keys()).filter(
      (k) => k.endsWith('.png') && !k.endsWith('.meta.json'),
    );

    // Both writes resolve to the same blobId, so only one data file
    expect(blobFiles.length).toBe(1);
    expect(meta1.blobId).toBe(meta2.blobId);
  });

  it('different bytes produce different blob-ids', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes1 = new Uint8Array([1, 1, 1]);
    const bytes2 = new Uint8Array([2, 2, 2]);

    const meta1 = await store.write(bytes1, SAMPLE_META);
    const meta2 = await store.write(bytes2, SAMPLE_META);

    expect(meta1.blobId).not.toBe(meta2.blobId);
    expect(meta1.sha256).not.toBe(meta2.sha256);
  });

  it('sha256 and byteSize match across dedup writes', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([9, 8, 7, 6, 5]);
    const meta1 = await store.write(bytes, SAMPLE_META);
    const meta2 = await store.write(bytes, SAMPLE_META);

    expect(meta1.sha256).toBe(meta2.sha256);
    expect(meta1.byteSize).toBe(meta2.byteSize);
  });
});
