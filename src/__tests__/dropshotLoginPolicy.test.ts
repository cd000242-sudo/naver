import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotLogin.ts'), 'utf8');

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
    const checkIndex = source.indexOf('async function checkDropshotLoginInternal');
    const loginIndex = source.indexOf('async function dropshotLoginInternal', checkIndex);
    const checkBlock = source.slice(checkIndex, loginIndex);
    const cachedSuccessIndex = checkBlock.indexOf('if (cachedLoggedIn)');
    const cachedWorkspaceIndex = checkBlock.indexOf('await openDropshotImageWorkspace(cachedPage, onLog)', cachedSuccessIndex);
    const cachedControlsIndex = checkBlock.indexOf('await ensureDropshotControls(cachedPage, onLog)', cachedWorkspaceIndex);
    const cachedReturnIndex = checkBlock.indexOf('return { loggedIn: true', cachedControlsIndex);
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

  it('reuses the exact visible context that confirmed zero-cost unlimited mode', () => {
    const detectedIndex = source.indexOf('if (!detected)');
    const successIndex = source.indexOf('return { loggedIn: true', detectedIndex);
    const successBlock = source.slice(detectedIndex, successIndex);
    const minimizeIndex = successBlock.indexOf('await minimizeDropshotWindow(page, onLog)');
    const cacheIndex = successBlock.indexOf('setCached(ctx, page)');
    const closeIndex = successBlock.lastIndexOf('closeLoginVerificationContext(ctx)');

    expect(minimizeIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeGreaterThan(minimizeIndex);
    expect(successBlock).not.toContain('launchBrowser(profileDir, true)');
    expect(closeIndex).toBeLessThan(minimizeIndex);
  });

  it('releases operation ownership through finally blocks', () => {
    expect(source).toContain('tryBeginDropshotLogin()');
    expect(source).toContain('tryBeginDropshotCheck()');
    expect(source).toMatch(/_loginPromise\s*=\s*dropshotLoginInternal[\s\S]*finally[\s\S]*endDropshotLogin\(\)/);
    expect(source).toMatch(/_checkPromise\s*=\s*checkDropshotLoginInternal[\s\S]*finally[\s\S]*endDropshotCheck\(\)/);
  });
});
