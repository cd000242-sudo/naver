// src/main/ipc/migrationHandlers.ts
// SPEC-IMAGE-MODEL-001 Phase 6 — IPC for image model migration.

import { ipcMain, app } from 'electron';
import { join, resolve, normalize } from 'node:path';
import { getBlobStoreInstance } from '../blobStore/singleton.js';
import {
  dryRunImageModelV1,
  applyImageModelV1,
  restoreFromBackup,
  type MigrationInput,
} from '../migration/imageModelV1.js';

function backupBaseDir(): string {
  return join(app.getPath('userData'), 'backup', 'migrations');
}

export function registerMigrationHandlers(): void {
  ipcMain.handle('migration:imageModelV1:dryRun', async (_evt, input: MigrationInput) => {
    return dryRunImageModelV1(input, getBlobStoreInstance());
  });

  ipcMain.handle('migration:imageModelV1:apply', async (_evt, input: MigrationInput) => {
    return applyImageModelV1(input, getBlobStoreInstance(), { backupBaseDir: backupBaseDir() });
  });

  ipcMain.handle('migration:imageModelV1:restore', async (_evt, backupPath: string) => {
    // Security: confine restore reads to the app-owned backup directory.
    if (typeof backupPath !== 'string' || backupPath.length === 0) {
      throw new Error('migration:restore rejected — backupPath must be a non-empty string');
    }
    const allowedRoot = resolve(backupBaseDir());
    const resolved = resolve(normalize(backupPath));
    if (!resolved.startsWith(allowedRoot)) {
      throw new Error(`migration:restore rejected — backupPath outside allowed directory ${allowedRoot}`);
    }
    return restoreFromBackup(resolved);
  });
}
