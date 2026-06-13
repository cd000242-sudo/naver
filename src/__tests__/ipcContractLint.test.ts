import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import * as path from 'path';
import {
  CRITICAL_PRELOAD_API_METHODS,
  extractPreloadChannels,
  extractPreloadApiMethods,
  extractMainChannels,
  findMissingCriticalApiMethods,
  findUnregisteredChannels,
  runIpcLint,
} from '../../scripts/lint-ipc.mjs';

/**
 * SPEC-STABILITY-2026 Phase 6.2 — IPC contract lint.
 * Acceptance: the scanner must catch the past real incident — blob/migration/
 * recovery channels exposed in preload but never registered in main
 * (13b29f9a's pre-fix state) → FAIL.
 */
describe('ipc contract lint (6.2)', () => {
  const preloadFixture = `
    blobHasMany: (keys) => ipcRenderer.invoke('blob:hasMany', keys),
    migrate: () => ipcRenderer.invoke('migration:imageModelV1'),
    track: (e) => ipcRenderer.send('telemetry:event', e),
  `;

  it('reproduces the blob:hasMany incident — unregistered channels FAIL', () => {
    // main side registered nothing (the dead-router state before 13b29f9a)
    const missing = findUnregisteredChannels(preloadFixture, ['// router only, no ipcMain.handle']);
    expect(missing).toEqual(['blob:hasMany', 'migration:imageModelV1', 'telemetry:event']);
  });

  it('passes when main registers via ipcMain.handle/on or the safeHandle wrapper', () => {
    const mainFixture = `
      ipcMain.handle('blob:hasMany', h);
      safeHandle('migration:imageModelV1', h);
      ipcMain.on('telemetry:event', h);
    `;
    expect(findUnregisteredChannels(preloadFixture, [mainFixture])).toEqual([]);
  });

  it('ignores dynamic (non-literal) channels instead of false-positives', () => {
    const dynamicPreload = `ipcRenderer.send(channel, payload); ipcRenderer.invoke(\`x:\${id}\`)`;
    expect(extractPreloadChannels(dynamicPreload).size).toBe(0);
  });

  it('the real codebase has zero unregistered channels (live contract)', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const result = runIpcLint(root);
    expect(result.preloadCount).toBeGreaterThan(200);
    expect(result.missing, `미등록 채널: ${result.missing.join(', ')}`).toEqual([]);
  });

  it('extractMainChannels reads every registration style', () => {
    const channels = extractMainChannels([
      `ipcMain.handle("a:b", h)`,
      `ipcMain.on('c:d', h)`,
      `safeHandle('e:f', h)`,
    ]);
    expect([...channels].sort()).toEqual(['a:b', 'c:d', 'e:f']);
  });

  it('catches missing critical preload API methods before renderer runtime', () => {
    const preloadFixture = `
      generateStructuredContent: () => ipcRenderer.invoke('automation:generateStructuredContent'),
      matchImagesToHeadings: () => ipcRenderer.invoke('image:matchToHeadings'),
      collectImagesFromShopping: () => ipcRenderer.invoke('image:collectFromShopping'),
    `;

    expect([...extractPreloadApiMethods(preloadFixture)].sort()).toEqual([
      'collectImagesFromShopping',
      'generateStructuredContent',
      'matchImagesToHeadings',
    ]);
    expect(findMissingCriticalApiMethods(preloadFixture, [
      'generateStructuredContent',
      'matchImages',
    ])).toEqual(['matchImages']);
  });

  it('the real preload exposes all critical renderer API methods', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const result = runIpcLint(root);

    expect(CRITICAL_PRELOAD_API_METHODS).toContain('matchImages');
    expect(result.missingCriticalApiMethods).toEqual([]);
  });
});
