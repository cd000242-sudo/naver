// src/main/ipc/blobHandlers.ts
// IPC handler registration for blob store — main process side.
// Renderer calls window.api.blobs.* which proxies through these handlers.

import { ipcMain } from 'electron';
import type { BlobMetaInput } from '../blobStore/index.js';
import { getBlobStoreInstance } from '../blobStore/singleton.js';

export function registerBlobHandlers(): void {
  ipcMain.handle('blob:read', (_evt, blobId: string) =>
    getBlobStoreInstance().read(blobId),
  );

  ipcMain.handle('blob:has', (_evt, blobId: string) =>
    getBlobStoreInstance().has(blobId),
  );

  ipcMain.handle('blob:hasMany', (_evt, blobIds: string[]) =>
    getBlobStoreInstance().hasMany(blobIds),
  );

  ipcMain.handle('blob:write', (_evt, bytes: Uint8Array, meta: BlobMetaInput) =>
    getBlobStoreInstance().write(bytes, meta),
  );

  ipcMain.handle('blob:materializeTempFile', (_evt, blobId: string) =>
    getBlobStoreInstance().materializeTempFile(blobId),
  );
}
