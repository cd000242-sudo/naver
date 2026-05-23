// src/main/ipc/migrationHandlers.ts
// SPEC-IMAGE-MODEL-001 Phase 6 — IPC for image model migration.

import { ipcMain, app } from 'electron';
import { join } from 'node:path';
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
    return restoreFromBackup(backupPath);
  });
}
