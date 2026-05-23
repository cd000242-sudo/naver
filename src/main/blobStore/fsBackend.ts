// src/main/blobStore/fsBackend.ts
// Filesystem abstraction layer for blob store — injectable for testing.

import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

export interface FsBackend {
  readonly baseDir: string;
  readonly tempDir: string;
  ensureDir(path: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  copyFile(src: string, dest: string): Promise<void>;
}

export function createRealFsBackend(baseDir: string): FsBackend {
  return {
    baseDir,
    tempDir: tmpdir(),

    async ensureDir(path: string): Promise<void> {
      await mkdir(path, { recursive: true });
    },

    async readFile(path: string): Promise<Buffer> {
      return readFile(path);
    },

    async writeFile(path: string, data: Buffer): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },

    async exists(path: string): Promise<boolean> {
      try {
        await access(path, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },

    async copyFile(src: string, dest: string): Promise<void> {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
    },
  };
}
