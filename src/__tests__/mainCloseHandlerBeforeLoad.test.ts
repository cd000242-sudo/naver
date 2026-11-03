/**
 * [2026-11-03] The main window's close handler (confirmation dialog / tray choice) must be wired before index.html is
 * loaded. It used to be wired after `await loadFile`, so a close during a slow start found no handler: the window closed
 * without the confirmation and the aborted load showed "앱 초기화 오류 · HTML 로드 실패 · Object has been destroyed"
 * (release-gate E2E quit-confirm-twice closes at DOMContentLoaded and failed 3 runs in a row).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const main = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('main window close handler is wired before the page loads', () => {
  it('on("close") comes before loadFile(index.html) inside createWindow', () => {
    const closeAt = main.indexOf("mainWindow.on('close', (event) => {");
    const loadAt = main.indexOf('await mainWindow.loadFile(htmlPath);');
    expect(closeAt).toBeGreaterThan(-1);
    expect(loadAt).toBeGreaterThan(-1);
    expect(closeAt).toBeLessThan(loadAt);
    expect(main.indexOf('let isConfirmDialogOpen = false;')).toBeLessThan(closeAt);
  });
});
