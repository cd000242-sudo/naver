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
  });

  it('checks controls again after prompt input and before clicking generate', () => {
    expect(captureCode).toMatch(/await ensureDropshotControls\(page, onLog\);\s*[\r\n]+\s*\/\/ 5\. Click generate/);
  });

  it('can close cached Dropshot browser contexts after sequential tests', () => {
    expect(sessionCode).toMatch(/closeBrowserCache/);
    expect(sessionCode).toMatch(/await .*\.close\(\)/);
  });

  it('does not treat workspace text as a valid login session without auth tokens', () => {
    expect(browserCode).toMatch(/CognitoIdentityServiceProvider/);
    // 로그인 신호 = idToken/accessToken(JWT, signOut 시 제거)만.
    // refreshToken은 opaque 문자열 + 로그아웃 후 쿠키에 잔존 → "로그아웃인데 로그인됨"
    // false positive를 유발하므로 로그인 신호에서 제외한다(2ed04e1e 회귀 잠금).
    expect(browserCode).toMatch(/\(idToken\|accessToken\)\$/);
    expect(browserCode).not.toMatch(/idToken\|accessToken\|refreshToken/);
    expect(browserCode).toMatch(/document\.cookie/);
    expect(browserCode).not.toMatch(/hasAccountChrome/);
    expect(browserCode).not.toMatch(/hasWorkspaceNav/);
  });

  it('rechecks cached and headless Dropshot pages before marking the session ready', () => {
    expect(coreCode).toMatch(/if\s*\(await isLoggedIn\(cachedPage\)\)\s*{\s*return cachedPage;\s*}/);
    expect(coreCode).toMatch(/로그인 세션 저장 확인 실패/);
    expect(coreCode).toMatch(/if\s*\(!\(await isLoggedIn\(hpage\)\)\)\s*{/);
    expect(coreCode).toMatch(/clearCached\(\)/);
  });
});
