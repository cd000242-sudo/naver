// src/main/ipc/blobHandlers.ts
// IPC handler registration for blob store — main process side.
// Renderer calls window.api.blobs.* which proxies through these handlers.

import { ipcMain } from 'electron';
import type { BlobMetaInput } from '../blobStore/index.js';
import { getBlobStoreInstance } from '../blobStore/singleton.js';

// Security: hard cap untrusted renderer payloads.
const MAX_BLOB_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

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

  ipcMain.handle('blob:write', (_evt, bytes: Uint8Array, meta: BlobMetaInput) => {
    if (!bytes || typeof bytes.length !== 'number') {
      throw new Error('blob:write rejected — bytes must be a TypedArray');
    }
    if (bytes.length > MAX_BLOB_BYTES) {
      throw new Error(`blob:write rejected — payload ${bytes.length} bytes exceeds limit ${MAX_BLOB_BYTES}`);
    }
    if (!meta || typeof meta.mimeType !== 'string' || !ALLOWED_MIMES.has(meta.mimeType)) {
      throw new Error(`blob:write rejected — mimeType must be one of: ${[...ALLOWED_MIMES].join(', ')}`);
    }
    return getBlobStoreInstance().write(bytes, meta);
  });

  ipcMain.handle('blob:materializeTempFile', (_evt, blobId: string) =>
    getBlobStoreInstance().materializeTempFile(blobId),
  );
}
