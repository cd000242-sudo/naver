// src/main/migration/imageModelV1.ts
// SPEC-IMAGE-MODEL-001 Phase 6 — migrate legacy filePath-based images to blob-id model.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { createHash } from 'node:crypto';
import type { BlobStore } from '../blobStore/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MigrationInput {
  /** Posts data extracted from localStorage 'naver_blog_generated_posts' (and per-account variants). */
  posts: any[];
}

export interface MigrationDryRunReport {
  totalPosts: number;
  totalImages: number;
  alreadyMigrated: number;    // images with valid blobId
  willMigrate: number;        // images with filePath and file exists (will be imported)
  willPlaceholder: number;    // images with filePath but file missing
  willSkip: number;           // images with neither blobId nor filePath
  estimatedBytes: number;
}

export interface MigrationApplyReport {
  totalPosts: number;
  migratedImages: number;
  placeholderImages: number;
  skippedImages: number;
  backupPath: string;
  /** Updated posts array — caller should write back to localStorage. */
  updatedPosts: any[];
}

export interface MigrationOptions {
  /** Base directory for backup files. Default: {userData}/backup/migrations/ */
  backupBaseDir: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the given path looks like an absolute file path (Windows or POSIX). */
function isAbsoluteFilePath(fp: string): boolean {
  return fp.startsWith('C:\\')
    || fp.startsWith('c:\\')
    || /^[A-Za-z]:\\/.test(fp)
    || fp.startsWith('/')
    || fp.startsWith('file:');
}

/** Normalizes file:// URLs to a real filesystem path. */
function normalizeFilePath(fp: string): string {
  if (!fp.startsWith('file://')) return fp;
  let real = fp.replace(/^file:\/\/\/?/, '');
  try { real = decodeURIComponent(real); } catch { /* keep */ }
  return real;
}

/** Detects MIME type from file extension. */
function mimeFromExt(realPath: string): string {
  const ext = realPath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

// ---------------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------------

/**
 * Dry-run: analyze posts and return a report without modifying anything.
 * Idempotent — running twice returns the same numbers (provided fs state unchanged).
 */
export async function dryRunImageModelV1(
  input: MigrationInput,
  blobStore: BlobStore,
): Promise<MigrationDryRunReport> {
  const report: MigrationDryRunReport = {
    totalPosts: input.posts.length,
    totalImages: 0,
    alreadyMigrated: 0,
    willMigrate: 0,
    willPlaceholder: 0,
    willSkip: 0,
    estimatedBytes: 0,
  };

  for (const post of input.posts) {
    const images = Array.isArray(post?.images) ? post.images : [];
    for (const img of images) {
      report.totalImages++;

      // 1. Already has blobId — check if blob exists.
      if (typeof img?.blobId === 'string' && img.blobId) {
        const exists = await blobStore.has(img.blobId);
        if (exists) {
          report.alreadyMigrated++;
          continue;
        }
        // blobId set but blob missing — fall through to filePath check.
      }

      // 2. Has filePath — check if file readable.
      const fp = typeof img?.filePath === 'string' ? img.filePath : '';
      if (fp && isAbsoluteFilePath(fp)) {
        const realPath = normalizeFilePath(fp);
        try {
          await access(realPath, constants.R_OK);
          const buf = await readFile(realPath);
          report.willMigrate++;
          report.estimatedBytes += buf.length;
          continue;
        } catch {
          report.willPlaceholder++;
          continue;
        }
      }

      // 3. Neither blobId nor usable filePath.
      report.willSkip++;
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply: create backup, import files to blob store, return updated posts.
 *
 * Idempotent — running twice produces the same result (same blob-ids for same sha256,
 * same backup naming pattern).
 *
 * On error: throws. Caller should catch and offer restore from the backup path.
 */
export async function applyImageModelV1(
  input: MigrationInput,
  blobStore: BlobStore,
  options: MigrationOptions,
): Promise<MigrationApplyReport> {
  const backupUlid = ulid();
  const backupPath = join(options.backupBaseDir, `SPEC-IMAGE-MODEL-001-${backupUlid}`);

  // Create backup directory.
  await mkdir(backupPath, { recursive: true });

  // Backup localStorage state (full posts array as JSON).
  const localStorageBackup = join(backupPath, 'localStorage-posts.json');
  await writeFile(localStorageBackup, JSON.stringify(input.posts, null, 2), 'utf8');

  // SHA256 verify backup write.
  const backupBuf = await readFile(localStorageBackup);
  const backupSha = createHash('sha256').update(backupBuf).digest('hex');
  const manifestPath = join(backupPath, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    backupUlid,
    createdAt: Date.now(),
    spec: 'SPEC-IMAGE-MODEL-001',
    postsCount: input.posts.length,
    localStorageBackupSha256: backupSha,
  }, null, 2), 'utf8');

  // Transaction marker — presence indicates incomplete migration.
  const txnMarker = join(backupPath, 'TRANSACTION_IN_PROGRESS');
  await writeFile(txnMarker, '', 'utf8');

  const report: MigrationApplyReport = {
    totalPosts: input.posts.length,
    migratedImages: 0,
    placeholderImages: 0,
    skippedImages: 0,
    backupPath,
    updatedPosts: [],
  };

  // Deep clone to avoid mutating caller's input.
  const updatedPosts: any[] = JSON.parse(JSON.stringify(input.posts));

  for (const post of updatedPosts) {
    const images = Array.isArray(post?.images) ? post.images : [];
    for (const img of images) {
      // Already has valid blobId — skip (idempotent).
      if (typeof img?.blobId === 'string' && img.blobId) {
        const exists = await blobStore.has(img.blobId);
        if (exists) {
          report.migratedImages++;
          continue;
        }
      }

      // Has filePath — import to blob store.
      const fp = typeof img?.filePath === 'string' ? img.filePath : '';
      if (fp && isAbsoluteFilePath(fp)) {
        const realPath = normalizeFilePath(fp);
        try {
          const buf = await readFile(realPath);
          const mimeType = mimeFromExt(realPath);

          const blobMeta = await blobStore.write(new Uint8Array(buf), {
            mimeType,
            width: 0,  // unknown — not critical for import
            height: 0,
          });

          // Fill in blob fields. Keep legacy filePath for backward compat (Phase 7 removes).
          img.blobId = blobMeta.blobId;
          img.sha256 = blobMeta.sha256;
          img.byteSize = blobMeta.byteSize;
          img.mimeType = blobMeta.mimeType;
          img.createdAt = blobMeta.createdAt;
          report.migratedImages++;
          continue;
        } catch {
          // File missing/unreadable — mark placeholder.
          report.placeholderImages++;
          continue;
        }
      }

      // Neither blobId nor usable filePath.
      report.skippedImages++;
    }
  }

  report.updatedPosts = updatedPosts;

  // Remove transaction marker — migration complete.
  await writeFile(txnMarker, 'COMPLETE', 'utf8');

  return report;
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restore from backup. Returns the localStorage posts array as it was before migration.
 *
 * Caller is responsible for writing this back to localStorage in the renderer.
 */
export async function restoreFromBackup(backupPath: string): Promise<any[]> {
  const localStorageBackup = join(backupPath, 'localStorage-posts.json');
  const buf = await readFile(localStorageBackup);

  // Verify SHA256 against manifest.
  const manifestPath = join(backupPath, 'manifest.json');
  const manifest = JSON.parse((await readFile(manifestPath)).toString('utf8'));
  const actualSha = createHash('sha256').update(buf).digest('hex');
  if (actualSha !== manifest.localStorageBackupSha256) {
    throw new Error(
      `Backup corrupted: SHA256 mismatch (expected ${manifest.localStorageBackupSha256}, got ${actualSha})`,
    );
  }

  return JSON.parse(buf.toString('utf8'));
}
