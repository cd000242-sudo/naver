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

    const helperBlock = source.slice(helperIndex, source.indexOf('/**', helperIndex + 1));
    expect(helperBlock).toContain('keeping login window open');
    expect(helperBlock).toContain('return false;');
  });

  it('does not treat a closed login window as a successful saved session', () => {
    const earlyFailureIndex = source.indexOf('if (!detected) {');
    const headlessCacheIndex = source.indexOf('const hctx: any = await launchBrowser(profileDir, true);');

    expect(earlyFailureIndex).toBeGreaterThan(-1);
    expect(headlessCacheIndex).toBeGreaterThan(-1);
    expect(earlyFailureIndex).toBeLessThan(headlessCacheIndex);

    expect(source).toContain('pages.length === 0');
    const earlyFailureBlock = source.slice(earlyFailureIndex, headlessCacheIndex);
    expect(earlyFailureBlock).toContain('userClosed');
    expect(earlyFailureBlock).toContain('clearCached();');
    expect(earlyFailureBlock).toContain('loggedIn: false');
    expect(earlyFailureBlock).toContain('로그인 창이 닫혔지만 로그인 완료 신호가 감지되지 않았습니다');
  });

  it('closes any cached browser context during a login status check', () => {
    const checkIndex = source.indexOf('export async function checkDropshotLogin');
    const loginIndex = source.indexOf('export async function dropshotLogin', checkIndex);

    expect(checkIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeGreaterThan(checkIndex);

    const checkBlock = source.slice(checkIndex, loginIndex);
    expect(checkBlock).toContain('const cachedPage = getCachedPage();');
    expect(checkBlock).toContain('await closeBrowserCache();');
    expect(checkBlock).not.toContain('setCached(');
  });

  it('closes the final headless verification browser after interactive login succeeds', () => {
    const finalCheckIndex = source.indexOf('const finalLoggedIn = await isLoggedIn(hpage);');
    const closeSuccessIndex = source.indexOf('await closeLoginVerificationContext(hctx);', finalCheckIndex);
    const successReturnIndex = source.indexOf('return { loggedIn: true', finalCheckIndex);

    expect(finalCheckIndex).toBeGreaterThan(-1);
    expect(closeSuccessIndex).toBeGreaterThan(finalCheckIndex);
    expect(successReturnIndex).toBeGreaterThan(closeSuccessIndex);

    const finalCheckBlock = source.slice(finalCheckIndex, successReturnIndex);
    expect(finalCheckBlock).toContain('if (!finalLoggedIn)');
    expect(finalCheckBlock).toContain('await hctx.close();');
    expect(finalCheckBlock).toContain('clearCached();');
    expect(finalCheckBlock).toContain('loggedIn: false');
    expect(source).not.toContain('setCached(hctx, hpage);');
  });
});
