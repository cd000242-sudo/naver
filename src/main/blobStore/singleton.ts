// src/main/blobStore/singleton.ts
// Singleton accessor for the blob store — shared by blobHandlers and writeImageFile.
// Avoids duplicate instantiation and decouples callers from Electron's app.getPath.

import { app } from 'electron';
import { createBlobStore } from './index.js';
import { createRealFsBackend } from './fsBackend.js';
import type { BlobStore } from './index.js';

let _instance: BlobStore | null = null;

/**
 * Returns the singleton BlobStore, lazily initializing it after Electron app is ready.
 * Must only be called from the main process (after app:ready).
 */
export function getBlobStoreInstance(): BlobStore {
  if (!_instance) {
    const baseDir = app.getPath('userData');
    _instance = createBlobStore(createRealFsBackend(baseDir));
  }
  return _instance;
}

/**
 * Injects a custom BlobStore instance.
 * FOR TESTS ONLY — never call this in production code.
 */
export function _setBlobStoreInstanceForTesting(instance: BlobStore | null): void {
  _instance = instance;
}
