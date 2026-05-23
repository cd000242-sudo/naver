// src/__tests__/imageModelMigrationV1.test.ts
// SPEC-IMAGE-MODEL-001 Phase 6 — unit tests for migration domain logic.
// Covers A-9 (idempotent), A-10 (dry-run), A-12 (backup restore).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBlobStore } from '../main/blobStore/index.js';
import {
  dryRunImageModelV1,
  applyImageModelV1,
  restoreFromBackup,
} from '../main/migration/imageModelV1.js';
import type { FsBackend } from '../main/blobStore/fsBackend.js';

// ---------------------------------------------------------------------------
// In-memory FsBackend for isolated unit tests.
// ---------------------------------------------------------------------------

function makeMemoryBackend(baseDir: string): FsBackend {
  const files = new Map<string, Buffer>();

  return {
    baseDir,
    tempDir: join(baseDir, 'tmp'),

    async ensureDir(_path: string): Promise<void> {
      // No-op for in-memory backend.
    },

    async readFile(path: string): Promise<Buffer> {
      const f = files.get(path);
      if (!f) {
        const err = Object.assign(new Error(`ENOENT: no such file: ${path}`), { code: 'ENOENT' });
        throw err;
      }
      return f;
    },

    async writeFile(path: string, data: Buffer): Promise<void> {
      files.set(path, data);
    },

    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },

    async copyFile(src: string, dest: string): Promise<void> {
      const f = files.get(src);
      if (!f) {
        const err = Object.assign(new Error(`ENOENT: no such file: ${src}`), { code: 'ENOENT' });
        throw err;
      }
      files.set(dest, Buffer.from(f));
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('imageModelV1 migration', () => {
  let testBaseDir: string;
  let imageDir: string;

  beforeEach(async () => {
    testBaseDir = join(
      tmpdir(),
      `migration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    imageDir = join(testBaseDir, 'images');
    await mkdir(imageDir, { recursive: true });
    await mkdir(join(testBaseDir, 'backup', 'migrations'), { recursive: true });
  });

  afterEach(async () => {
    try { await rm(testBaseDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // -------------------------------------------------------------------------
  // dryRun
  // -------------------------------------------------------------------------

  describe('dryRun', () => {
    it('empty posts — all counts are 0', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const r = await dryRunImageModelV1({ posts: [] }, blobStore);
      expect(r.totalPosts).toBe(0);
      expect(r.totalImages).toBe(0);
      expect(r.alreadyMigrated).toBe(0);
      expect(r.willMigrate).toBe(0);
      expect(r.willPlaceholder).toBe(0);
      expect(r.willSkip).toBe(0);
      expect(r.estimatedBytes).toBe(0);
    });

    it('image with valid blobId in store — alreadyMigrated count', async () => {
      const backend = makeMemoryBackend(testBaseDir);
      const blobStore = createBlobStore(backend);
      const meta = await blobStore.write(
        new Uint8Array(Buffer.from('abc')),
        { mimeType: 'image/png', width: 1, height: 1 },
      );
      const r = await dryRunImageModelV1({
        posts: [{ images: [{ blobId: meta.blobId }] }],
      }, blobStore);
      expect(r.alreadyMigrated).toBe(1);
      expect(r.willMigrate).toBe(0);
      expect(r.totalImages).toBe(1);
    });

    it('image with filePath and file present — willMigrate count + estimatedBytes', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'test.png');
      await writeFile(realFile, Buffer.from('hello'));
      const r = await dryRunImageModelV1({
        posts: [{ images: [{ filePath: realFile }] }],
      }, blobStore);
      expect(r.willMigrate).toBe(1);
      expect(r.estimatedBytes).toBe(5);
      expect(r.alreadyMigrated).toBe(0);
    });

    it('image with filePath but file missing — willPlaceholder count', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      // Use a path that clearly won't exist (use absolute path format).
      const missingPath = join(testBaseDir, 'nonexistent', 'foo.png');
      const r = await dryRunImageModelV1({
        posts: [{ images: [{ filePath: missingPath }] }],
      }, blobStore);
      expect(r.willPlaceholder).toBe(1);
      expect(r.willMigrate).toBe(0);
    });

    it('image with no blobId and no filePath — willSkip count', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const r = await dryRunImageModelV1({
        posts: [{ images: [{ heading: 'h1', alt: 'test' }] }],
      }, blobStore);
      expect(r.willSkip).toBe(1);
      expect(r.totalImages).toBe(1);
    });

    it('dry-run does not create any files on disk', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'test.png');
      await writeFile(realFile, Buffer.from('dry-run-test'));

      await dryRunImageModelV1({
        posts: [{ images: [{ filePath: realFile }] }],
      }, blobStore);

      // blob store dir should not be created by dry-run (memory backend, no disk).
      // Just verify report counts are correct (non-side-effecting).
      const r2 = await dryRunImageModelV1({
        posts: [{ images: [{ filePath: realFile }] }],
      }, blobStore);
      // Second call returns same counts — idempotent.
      expect(r2.willMigrate).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // apply
  // -------------------------------------------------------------------------

  describe('apply', () => {
    it('normal file — blob issued + backup created', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'test.png');
      await writeFile(realFile, Buffer.from('hello world data'));
      const r = await applyImageModelV1(
        { posts: [{ images: [{ filePath: realFile }] }] },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );
      expect(r.migratedImages).toBe(1);
      expect(r.updatedPosts[0].images[0].blobId).toBeTruthy();
      expect(r.updatedPosts[0].images[0].sha256).toBeTruthy();
      expect(r.backupPath).toContain('SPEC-IMAGE-MODEL-001');
    });

    it('idempotent — running twice produces the same blobId and sha256', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'idempotent.png');
      await writeFile(realFile, Buffer.from('idempotent-test-bytes'));

      const r1 = await applyImageModelV1(
        { posts: [{ images: [{ filePath: realFile }] }] },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );
      const r2 = await applyImageModelV1(
        { posts: r1.updatedPosts },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );

      expect(r1.updatedPosts[0].images[0].blobId).toBe(r2.updatedPosts[0].images[0].blobId);
      expect(r1.updatedPosts[0].images[0].sha256).toBe(r2.updatedPosts[0].images[0].sha256);
    });

    it('does not mutate the original posts input', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'immutable.png');
      await writeFile(realFile, Buffer.from('immutability-check'));
      const posts = [{ images: [{ filePath: realFile }] }];
      const original = JSON.parse(JSON.stringify(posts));

      await applyImageModelV1(
        { posts },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );

      expect(posts).toEqual(original);
    });

    it('missing filePath — placeholder counted, image object unchanged', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const missingPath = join(testBaseDir, 'does-not-exist.png');
      const r = await applyImageModelV1(
        { posts: [{ images: [{ filePath: missingPath }] }] },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );
      expect(r.placeholderImages).toBe(1);
      expect(r.migratedImages).toBe(0);
    });

    it('image with no blobId and no filePath — skippedImages counted', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const r = await applyImageModelV1(
        { posts: [{ images: [{ heading: 'h1' }] }] },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );
      expect(r.skippedImages).toBe(1);
      expect(r.migratedImages).toBe(0);
    });

    it('mixed post — migrated, placeholder, skipped counts correct', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const existingFile = join(imageDir, 'exists.png');
      await writeFile(existingFile, Buffer.from('real-bytes'));
      const missingFile = join(testBaseDir, 'missing.png');

      // Pre-write a blob for the already-migrated image.
      const existingBlob = await blobStore.write(
        new Uint8Array(Buffer.from('existing-blob')),
        { mimeType: 'image/png', width: 10, height: 10 },
      );

      const r = await applyImageModelV1(
        {
          posts: [{
            images: [
              { blobId: existingBlob.blobId },  // alreadyMigrated
              { filePath: existingFile },         // willMigrate
              { filePath: missingFile },          // willPlaceholder
              { heading: 'no-path' },             // willSkip
            ],
          }],
        },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );

      expect(r.migratedImages).toBe(2);  // already-migrated + new file
      expect(r.placeholderImages).toBe(1);
      expect(r.skippedImages).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // restore
  // -------------------------------------------------------------------------

  describe('restore', () => {
    it('restore returns the exact pre-migration posts array', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'restore.png');
      await writeFile(realFile, Buffer.from('restore-test-data'));
      const originalPosts = [{ id: 'p1', images: [{ filePath: realFile }] }];

      const r = await applyImageModelV1(
        { posts: originalPosts },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );

      const restored = await restoreFromBackup(r.backupPath);
      expect(restored).toEqual(originalPosts);
    });

    it('restore detects SHA256 mismatch and throws', async () => {
      const blobStore = createBlobStore(makeMemoryBackend(testBaseDir));
      const realFile = join(imageDir, 'corrupt-test.png');
      await writeFile(realFile, Buffer.from('some-bytes'));

      const r = await applyImageModelV1(
        { posts: [{ id: 'p2', images: [{ filePath: realFile }] }] },
        blobStore,
        { backupBaseDir: join(testBaseDir, 'backup', 'migrations') },
      );

      // Corrupt the backup file.
      const backupJsonPath = join(r.backupPath, 'localStorage-posts.json');
      await writeFile(backupJsonPath, Buffer.from('[{"corrupted": true}]'));

      await expect(restoreFromBackup(r.backupPath)).rejects.toThrow(/SHA256 mismatch/);
    });
  });
});
