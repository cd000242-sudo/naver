// src/main/blobStore/index.ts
// Main process blob store — persists image bytes keyed by ULID (blob-id).
// Renderer never touches the filesystem; it calls IPC handlers that delegate here.

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { FsBackend } from './fsBackend.js';
import { ulid } from 'ulid';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BlobMetaInput {
  mimeType: string;
  width: number;
  height: number;
}

export interface BlobMeta extends BlobMetaInput {
  blobId: string;
  sha256: string;
  byteSize: number;
  createdAt: number; // epoch ms
}

export type BlobReadResult =
  | { ok: true; bytes: Uint8Array; meta: BlobMeta }
  | { ok: false; reason: 'missing' | 'corrupt'; placeholder: string };

export interface BlobStore {
  write(bytes: Uint8Array, meta: BlobMetaInput): Promise<BlobMeta>;
  read(blobId: string): Promise<BlobReadResult>;
  has(blobId: string): Promise<boolean>;
  /** Batch existence check — pre-fetches rendering state for a list view. */
  hasMany(blobIds: string[]): Promise<boolean[]>;
  /** Copies blob bytes to os.tmpdir() and returns the temp path. Caller must unlink. */
  materializeTempFile(blobId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// 1x1 transparent PNG — returned as placeholder when a blob is missing/corrupt.
const PLACEHOLDER_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function extForMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? 'bin';
}

/** Returns the shard directory prefix (first 2 chars of blobId). */
function blobDir(baseDir: string, blobId: string): string {
  return join(baseDir, 'blobs', blobId.slice(0, 2));
}

function blobFilePath(baseDir: string, blobId: string, ext: string): string {
  return join(blobDir(baseDir, blobId), `${blobId}.${ext}`);
}

function metaFilePath(baseDir: string, blobId: string): string {
  return join(blobDir(baseDir, blobId), `${blobId}.meta.json`);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBlobStore(backend: FsBackend): BlobStore {
  const { baseDir, tempDir } = backend;

  // In-memory sha256 → blobId dedup index (populated lazily on write).
  const sha256Index = new Map<string, string>();

  async function loadMeta(blobId: string): Promise<BlobMeta | null> {
    const metaPath = metaFilePath(baseDir, blobId);
    if (!(await backend.exists(metaPath))) return null;
    try {
      const raw = await backend.readFile(metaPath);
      return JSON.parse(raw.toString('utf8')) as BlobMeta;
    } catch {
      return null;
    }
  }

  async function write(bytes: Uint8Array, meta: BlobMetaInput): Promise<BlobMeta> {
    const hash = sha256Hex(bytes);

    // Dedup: same sha256 → return existing blob without re-writing.
    if (sha256Index.has(hash)) {
      const existingId = sha256Index.get(hash)!;
      const existingMeta = await loadMeta(existingId);
      if (existingMeta) return existingMeta;
      // Cache stale — fall through to re-write.
      sha256Index.delete(hash);
    }

    const blobId = ulid();
    const ext = extForMime(meta.mimeType);
    const blobPath = blobFilePath(baseDir, blobId, ext);
    const fullMeta: BlobMeta = {
      ...meta,
      blobId,
      sha256: hash,
      byteSize: bytes.length,
      createdAt: Date.now(),
    };

    await backend.writeFile(blobPath, Buffer.from(bytes));
    await backend.writeFile(
      metaFilePath(baseDir, blobId),
      Buffer.from(JSON.stringify(fullMeta, null, 2), 'utf8'),
    );

    sha256Index.set(hash, blobId);
    return fullMeta;
  }

  async function read(blobId: string): Promise<BlobReadResult> {
    const meta = await loadMeta(blobId);
    if (!meta) {
      return { ok: false, reason: 'missing', placeholder: PLACEHOLDER_B64 };
    }

    const ext = extForMime(meta.mimeType);
    const blobPath = blobFilePath(baseDir, blobId, ext);

    if (!(await backend.exists(blobPath))) {
      return { ok: false, reason: 'missing', placeholder: PLACEHOLDER_B64 };
    }

    let buf: Buffer;
    try {
      buf = await backend.readFile(blobPath);
    } catch {
      return { ok: false, reason: 'corrupt', placeholder: PLACEHOLDER_B64 };
    }

    // Integrity check: sha256 must match stored meta.
    const actualHash = sha256Hex(new Uint8Array(buf));
    if (actualHash !== meta.sha256) {
      return { ok: false, reason: 'corrupt', placeholder: PLACEHOLDER_B64 };
    }

    return { ok: true, bytes: new Uint8Array(buf), meta };
  }

  async function has(blobId: string): Promise<boolean> {
    const meta = await loadMeta(blobId);
    if (!meta) return false;
    const ext = extForMime(meta.mimeType);
    return backend.exists(blobFilePath(baseDir, blobId, ext));
  }

  async function hasMany(blobIds: string[]): Promise<boolean[]> {
    return Promise.all(blobIds.map(has));
  }

  async function materializeTempFile(blobId: string): Promise<string | null> {
    const result = await read(blobId);
    if (!result.ok) return null;

    const { meta } = result;
    const ext = extForMime(meta.mimeType);
    const src = blobFilePath(baseDir, blobId, ext);
    const dest = join(tempDir, `blob-${blobId}.${ext}`);

    await backend.copyFile(src, dest);
    return dest;
  }

  return { write, read, has, hasMany, materializeTempFile };
}
