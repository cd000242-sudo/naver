import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Dropshot unlimited mode safety', () => {
  const browserCode = read('image/dropshotBrowser.ts');
  const captureCode = read('image/dropshotCapture.ts');
  const sessionCode = read('image/dropshotSession.ts');
  const coreCode = read('image/dropshotCore.ts');

  it('reads unlimited switch state and zero-cost generate button state', () => {
    expect(browserCode).toMatch(/readDropshotControlState/);
    expect(browserCode).toMatch(/unlimitedModeOn/);
    expect(browserCode).toMatch(/zeroCost/);
    expect(browserCode).toMatch(/generateButtonText/);
    expect(browserCode).toMatch(/\\uBB34\\uC81C\\uD55C/);
  });

  it('refuses generation when zero-cost mode is not confirmed', () => {
    expect(browserCode).toMatch(/refusing to generate to avoid coin spend/);
    expect(browserCode).toMatch(/throw new Error/);
    expect(browserCode).not.toContain('controls 설정 오류 (무시)');
  });

  it('checks controls again after prompt input and before clicking generate', () => {
    const promptCheck = captureCode.indexOf('const actualPrompt =');
    const controlsCheck = captureCode.indexOf('await ensureDropshotControls(page, onLog);', promptCheck);
    const settledBaseline = captureCode.indexOf('await collectStableDropshotCandidateKeys(page)', controlsCheck);
    const generateClick = captureCode.indexOf('await clickGenerate(page)', settledBaseline);
    expect(promptCheck).toBeGreaterThan(-1);
    expect(controlsCheck).toBeGreaterThan(promptCheck);
    expect(settledBaseline).toBeGreaterThan(controlsCheck);
    expect(generateClick).toBeGreaterThan(settledBaseline);
  });

  it('can close cached Dropshot browser contexts after sequential tests', () => {
    expect(sessionCode).toMatch(/closeBrowserCache/);
    expect(sessionCode).toMatch(/withCleanupTimeout/);
    expect(sessionCode).toMatch(/closeTrackedDropshotContext/);
    expect(sessionCode).toMatch(/Keep ownership so a later shutdown\/abort pass/);
  });

  it('does not treat workspace text as a valid login session without auth tokens', () => {
    expect(browserCode).toMatch(/CognitoIdentityServiceProvider/);
    // 로그인 신호 = idToken/accessToken(JWT, signOut 시 제거)만.
    // refreshToken은 opaque 문자열 + 로그아웃 후 쿠키에 잔존 → "로그아웃인데 로그인됨"
    // false positive를 유발하므로 로그인 신호에서 제외한다(2ed04e1e 회귀 잠금).
    expect(browserCode).toMatch(/\(idToken\|accessToken\)\$/);
    expect(browserCode).not.toMatch(/idToken\|accessToken\|refreshToken/);
    expect(browserCode).toMatch(/document\.cookie/);
    expect(browserCode).toMatch(/expiresAtSeconds \* 1000 > nowMs/);
    expect(browserCode).not.toMatch(/val\.length\s*>\s*20/);
    expect(browserCode).not.toMatch(/hasAccountChrome/);
    expect(browserCode).not.toMatch(/hasWorkspaceNav/);
  });

  it('rechecks cached and headless Dropshot pages before marking the session ready', () => {
    const cachedAuth = coreCode.indexOf('if (!(await isLoggedIn(page)))');
    const cachedWorkspace = coreCode.indexOf('if (!(await openDropshotImageWorkspace(page, onLog)))', cachedAuth);
    const cachedReturn = coreCode.indexOf('return page;', cachedWorkspace);
    expect(cachedAuth).toBeGreaterThan(-1);
    expect(cachedWorkspace).toBeGreaterThan(cachedAuth);
    expect(cachedReturn).toBeGreaterThan(cachedWorkspace);

    const initialBoard = coreCode.indexOf('await navigateToDropshotBoard(headlessProbePage, onLog)');
    const initialAuth = coreCode.indexOf('await isLoggedIn(headlessProbePage)', initialBoard);
    const initialWorkspace = coreCode.indexOf('await openDropshotImageWorkspace(headlessProbePage, onLog)', initialBoard);
    const initialControls = coreCode.indexOf('await ensureDropshotControls(headlessProbePage, onLog)', initialWorkspace);
    const initialCache = coreCode.indexOf('setCached(context, headlessProbePage);', initialControls);
    expect(initialBoard).toBeGreaterThan(-1);
    expect(initialAuth).toBeGreaterThan(initialBoard);
    expect(initialWorkspace).toBeGreaterThan(initialBoard);
    expect(initialControls).toBeGreaterThan(initialWorkspace);
    expect(initialCache).toBeGreaterThan(initialControls);

    const visibleControls = coreCode.lastIndexOf('await ensureDropshotControls(page, onLog)');
    const visibleMinimize = coreCode.indexOf('await minimizeDropshotWindow(page, onLog)', visibleControls);
    const visibleCache = coreCode.indexOf('setCached(context, page);', visibleMinimize);
    expect(visibleControls).toBeGreaterThan(initialCache);
    expect(visibleMinimize).toBeGreaterThan(visibleControls);
    expect(visibleCache).toBeGreaterThan(visibleMinimize);
    expect(coreCode.slice(visibleControls)).not.toContain('launchBrowser(profileDir, true)');
    expect(coreCode).toMatch(/clearCached\(\)/);
  });
});
