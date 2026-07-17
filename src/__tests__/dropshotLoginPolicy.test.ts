import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotLogin.ts'), 'utf8');
const headlessSource = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotHeadlessSession.ts'), 'utf8');

describe('Dropshot login success policy', () => {
  it('keeps the visible login browser open when the initial board navigation times out', () => {
    const helperIndex = source.indexOf('async function tryOpenDropshotBoard');
    const visibleLoginIndex = source.indexOf('ctx = await launchBrowser(profileDir, false);');
    const pollingIndex = source.indexOf('let userClosed = false;', visibleLoginIndex);

    expect(helperIndex).toBeGreaterThan(-1);
    expect(visibleLoginIndex).toBeGreaterThan(-1);
    expect(pollingIndex).toBeGreaterThan(visibleLoginIndex);

    const visibleStartupBlock = source.slice(visibleLoginIndex, pollingIndex);
    expect(visibleStartupBlock).toContain('await tryOpenDropshotBoard(page, onLog);');
    expect(visibleStartupBlock).not.toContain('await page.goto(BOARD_URL');
  });

  it('does not close a valid cached generation session during a status check', () => {
    const checkIndex = source.indexOf('async function checkCachedDropshotLogin');
    const loginIndex = source.indexOf('async function dropshotLoginInternal', checkIndex);
    const checkBlock = source.slice(checkIndex, loginIndex);
    const cachedSuccessIndex = checkBlock.indexOf('if (cachedLoggedIn)');
    const cachedWorkspaceIndex = checkBlock.indexOf('await openDropshotImageWorkspace(cachedPage, onLog)', cachedSuccessIndex);
    const cachedControlsIndex = checkBlock.indexOf('await ensureDropshotControls(cachedPage, onLog)', cachedWorkspaceIndex);
    const cachedReturnIndex = checkBlock.indexOf('return authenticatedStatus(true', cachedControlsIndex);
    const cacheCloseIndex = checkBlock.indexOf('await closeBrowserCache();');

    expect(checkIndex).toBeGreaterThan(-1);
    expect(cachedSuccessIndex).toBeGreaterThan(-1);
    expect(cachedWorkspaceIndex).toBeGreaterThan(cachedSuccessIndex);
    expect(cachedControlsIndex).toBeGreaterThan(cachedWorkspaceIndex);
    expect(cachedReturnIndex).toBeGreaterThan(cachedControlsIndex);
    expect(cacheCloseIndex).toBeGreaterThan(cachedReturnIndex);
  });

  it('deduplicates repeated login and status-check requests', () => {
    expect(source).toContain('let _loginPromise: Promise<DropshotLoginStatus> | null = null;');
    expect(source).toContain('let _checkPromise: Promise<DropshotLoginStatus> | null = null;');
    expect(source).toContain('if (_loginPromise) return _loginPromise;');
    expect(source).toContain('if (_checkPromise) return _checkPromise;');
  });

  it('adopts and hides the authenticated visible context before optional workspace checks', () => {
    const tokenIndex = source.indexOf('if (tokenReady)');
    const minimizeIndex = source.indexOf('await minimizeDropshotWindow(page, onLog)', tokenIndex);
    const cacheIndex = source.indexOf('setCached(ctx, page)', minimizeIndex);
    const transferIndex = source.indexOf('ctx = null', cacheIndex);
    const workspaceIndex = source.indexOf('await openDropshotImageWorkspace(page, onLog)', transferIndex);

    expect(tokenIndex).toBeGreaterThan(-1);
    expect(minimizeIndex).toBeGreaterThan(tokenIndex);
    expect(cacheIndex).toBeGreaterThan(minimizeIndex);
    expect(transferIndex).toBeGreaterThan(cacheIndex);
    expect(workspaceIndex).toBeGreaterThan(transferIndex);
    expect(source).not.toContain('await reopenDropshotHeadlessGenerationContext');
    expect(headlessSource).toContain('launchBrowser(profileDir, true)');
    expect(headlessSource).toContain('setCached(context, page)');
  });

  it('recognizes a valid token before requiring workspace or unlimited controls', () => {
    const checkIndex = source.indexOf('async function checkCachedDropshotLogin');
    const loginIndex = source.indexOf('async function dropshotLoginInternal', checkIndex);
    const checkBlock = source.slice(checkIndex, loginIndex);
    const authIndex = checkBlock.indexOf('if (cachedLoggedIn)');
    const successIndex = checkBlock.indexOf("phase: 'authenticated'", authIndex);
    const controlsIndex = checkBlock.indexOf('ensureDropshotControls', authIndex);

    expect(authIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(authIndex);
    expect(successIndex).toBeLessThan(controlsIndex);
    expect(checkBlock).toContain('loggedIn: true');
  });

  it('releases operation ownership through finally blocks', () => {
    expect(source).toContain('tryBeginDropshotLogin()');
    expect(source).toContain('tryBeginDropshotCheck()');
    expect(source).toMatch(/_loginPromise\s*=\s*dropshotLoginInternal\(onLog\)\.finally\(\(\)\s*=>\s*\{[\s\S]*endDropshotLogin\(\)/);
    expect(source).toMatch(/_checkPromise\s*=\s*checkCachedDropshotLogin\(onLog\)\.finally\(\(\)\s*=>\s*\{[\s\S]*endDropshotCheck\(\)/);
  });
});
