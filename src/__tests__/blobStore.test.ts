// src/__tests__/blobStore.test.ts
// Unit tests for blob store — write/read round-trip, has, missing, hasMany, materializeTempFile.
// Uses an in-memory FsBackend to avoid real disk I/O.

import { describe, it, expect, beforeEach } from 'vitest';
import { createBlobStore } from '../main/blobStore/index';
import type { FsBackend } from '../main/blobStore/fsBackend';
import type { BlobMetaInput } from '../main/blobStore/index';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// In-memory FsBackend for unit tests
// ---------------------------------------------------------------------------

function createMemBackend(baseDir = '/mem-base', tempDir = '/mem-temp'): FsBackend & { _files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();

  return {
    baseDir,
    tempDir,
    _files: files,

    async ensureDir(_path: string): Promise<void> {
      // no-op for in-memory backend
    },

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

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const SAMPLE_META: BlobMetaInput = { mimeType: 'image/png', width: 100, height: 100 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('blobStore — write/read round-trip', () => {
  it('write returns BlobMeta with correct sha256 and byteSize', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const meta = await store.write(bytes, SAMPLE_META);

    expect(meta.blobId).toBeTruthy();
    expect(meta.sha256).toBe(sha256Hex(bytes));
    expect(meta.byteSize).toBe(5);
    expect(meta.mimeType).toBe('image/png');
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
    expect(typeof meta.createdAt).toBe('number');
  });

  it('read returns ok:true with matching bytes and sha256', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([10, 20, 30]);
    const writeMeta = await store.write(bytes, SAMPLE_META);
    const result = await store.read(writeMeta.blobId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(sha256Hex(result.bytes)).toBe(writeMeta.sha256);
    expect(result.meta.blobId).toBe(writeMeta.blobId);
    expect(result.meta.sha256).toBe(writeMeta.sha256);
  });

  it('read returns stored bytes that exactly match the written bytes', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const original = new Uint8Array(256).map((_, i) => i);
    const writeMeta = await store.write(original, { mimeType: 'image/jpeg', width: 16, height: 16 });
    const result = await store.read(writeMeta.blobId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.bytes)).toEqual(Array.from(original));
  });
});

describe('blobStore — has()', () => {
  it('has returns true for an existing blob', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([7, 8, 9]);
    const { blobId } = await store.write(bytes, SAMPLE_META);

    expect(await store.has(blobId)).toBe(true);
  });

  it('has returns false for a missing blob-id', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    expect(await store.has('01HZNONEXISTENTBLOBID000001')).toBe(false);
  });
});

describe('blobStore — read missing', () => {
  it('read on missing blob-id returns ok:false reason:missing with non-empty placeholder', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const result = await store.read('01HZNONEXISTENTBLOBID000002');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing');
    expect(result.placeholder.length).toBeGreaterThan(0);
    expect(result.placeholder).toMatch(/^data:image\//);
  });
});

describe('blobStore — hasMany()', () => {
  it('hasMany returns correct boolean array for mixed existing/missing blobs', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const b1 = await store.write(new Uint8Array([1]), SAMPLE_META);
    const b2 = await store.write(new Uint8Array([2]), SAMPLE_META);

    const results = await store.hasMany([
      b1.blobId,
      '01HZMISSING00000000000001',
      b2.blobId,
    ]);

    expect(results).toEqual([true, false, true]);
  });
});

describe('blobStore — materializeTempFile()', () => {
  it('materializeTempFile returns a path when blob exists', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([42, 43]);
    const { blobId } = await store.write(bytes, SAMPLE_META);

    const tempPath = await store.materializeTempFile(blobId);

    expect(tempPath).not.toBeNull();
    expect(typeof tempPath).toBe('string');
  });

  it('materializeTempFile copies bytes to temp path', async () => {
    const backend = createMemBackend('/base', '/tmp');
    const store = createBlobStore(backend);

    const bytes = new Uint8Array([55, 66, 77]);
    const { blobId } = await store.write(bytes, SAMPLE_META);

    const tempPath = await store.materializeTempFile(blobId);
    expect(tempPath).not.toBeNull();

    // Verify the copied file has the same content
    const tempBuf = await backend.readFile(tempPath!);
    expect(Array.from(tempBuf)).toEqual(Array.from(bytes));
  });

  it('materializeTempFile returns null for missing blob-id', async () => {
    const backend = createMemBackend();
    const store = createBlobStore(backend);

    const result = await store.materializeTempFile('01HZNONEXISTENTBLOBID000003');
    expect(result).toBeNull();
  });
});
