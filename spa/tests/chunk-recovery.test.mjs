// [2026-11-08 사장님] "사이트를 오래 가만히 두면 파란 배경에 아무 창도 안 뜨는 경우가 가끔 있다."
//   Cause: pages are lazy-loaded chunks; after a new deploy the old chunk files are gone, so an idle tab that
//   navigates later fails the dynamic import, and with no error boundary React unmounts → only the body
//   background is left. Recovery: reload once (guarded) on chunk errors; show a friendly screen otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isChunkLoadError, shouldAutoReload, RELOAD_GUARD_MS } from '../src/lib/chunkRecovery.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', 'src', p), 'utf8');

test('recognises the dynamic-import failures browsers actually throw', () => {
    assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/LoginPage-1.js')), true);
    assert.equal(isChunkLoadError(new Error('error loading dynamically imported module')), true);
    assert.equal(isChunkLoadError(new Error('Importing a module script failed.')), true);
    assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 3 failed' }), true);
    assert.equal(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css')), true);
    assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
    assert.equal(isChunkLoadError(null), false);
});

test('auto reload at most once per guard window (no reload loop)', () => {
    const now = 1_000_000;
    assert.equal(shouldAutoReload(now, null), true);
    assert.equal(shouldAutoReload(now, now - 1000), false);
    assert.equal(shouldAutoReload(now, now - RELOAD_GUARD_MS - 1), true);
    assert.ok(RELOAD_GUARD_MS >= 10_000);
});

test('entry installs the recovery hooks and wraps the app in an error boundary', () => {
    const main = read('main.tsx');
    assert.match(main, /installChunkRecovery\(\)/);
    assert.match(main, /<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/);
    const lib = read('lib/chunkRecovery.mjs');
    assert.match(lib, /'vite:preloadError'/);
    assert.match(lib, /'unhandledrejection'/);
});

test('error boundary reloads on chunk errors and otherwise shows a visible screen with a reload button', () => {
    const boundary = read('components/AppErrorBoundary.tsx');
    assert.match(boundary, /componentDidCatch|getDerivedStateFromError/);
    assert.match(boundary, /recoverFromChunkError/);
    assert.match(boundary, /새로고침/);
});
