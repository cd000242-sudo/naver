// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LOGIN_SELECTORS } from '../automation/selectors/loginSelectors';
import { getAllSelectors } from '../automation/selectors/selectorUtils';
import { shouldAwaitPostLoginNavigation } from '../automation/loginPageNavigationPolicy';
import { shouldSkipBlogWriteWarmup } from '../automation/editorNavigationUrlPolicy';

function read(rel: string): string {
  // happy-dom rewrites `new URL(..., import.meta.url)`; resolve from cwd instead.
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

/**
 * [2026-09-30 사장님] "로그인에서 타이핑까지 너무 오래걸리는데 의도한거니?"
 * 10:24 로그 실측: 로그인 시작 → 제목 타이핑 100초. 그중 봇 회피 설계가 아닌 세 구간을 잠근다.
 */
describe('로그인 → 타이핑 지연 — 설계가 아닌 세 구간', () => {
  // Markup copied from https://nid.naver.com/nidlogin.login (curl, 2026-09-30).
  // `#log.login` / `button[type="submit"]` are gone; the button is now type="button".
  const NID_LOGIN_FORM_2026_09 = `
    <form id="frmNIDLogin">
      <input id="id" name="id" type="text" class="input_text">
      <input id="pw" name="pw" type="password" class="input_text">
      <input id="loginStay" type="checkbox" name="nvlong" class="input_stay" value="off">
      <button type="button" class="btn_done" id="passkeyBtn_column">패스키로 로그인</button>
      <button type="button" class="btn_done" id="loginBtn_column">로그인</button>
      <button type="button" class="btn_done" id="passkeyBtn_row">패스키</button>
      <button type="button" class="btn_done" id="loginBtn_row">로그인</button>
    </form>`;

  it('버튼 탐색 8초: 현재 네이버 로그인 버튼이 셀렉터 목록으로 바로 잡힌다 (패스키 버튼은 제외)', () => {
    document.body.innerHTML = NID_LOGIN_FORM_2026_09;
    const selectors = getAllSelectors(LOGIN_SELECTORS.loginButton);
    const matched = selectors.map((s) => document.querySelector(s)).filter(Boolean) as Element[];
    expect(matched.length).toBeGreaterThan(0);
    for (const el of matched) {
      expect(el.id).toMatch(/^loginBtn_/);
      expect(el.id).not.toMatch(/passkey/i);
    }
    // The first selector in the list must already hit, so the 1.5s-per-selector fallback never runs.
    expect(document.querySelector(selectors[0])).not.toBeNull();
  });

  it('클릭 단계가 찾아둔 버튼 핸들을 쓰고 죽은 #log.login 문자열로 다시 클릭하지 않는다', () => {
    const src = read('naverBlogAutomation.ts');
    expect(src).not.toMatch(/cursor\.click\('#log\\\\\.login'/);
    expect(src).not.toMatch(/querySelector\('#log\\\\\.login'\)/);
  });

  it('클릭→판정 22초: 클릭 응답에서 이미 로그인 페이지를 벗어났으면 waitForNavigation 을 다시 기다리지 않는다', () => {
    expect(shouldAwaitPostLoginNavigation('success')).toBe(false);
    expect(shouldAwaitPostLoginNavigation('pending')).toBe(true);
    expect(shouldAwaitPostLoginNavigation('error')).toBe(true);
    expect(shouldAwaitPostLoginNavigation('challenge')).toBe(true);
    // Wiring guard: the automation consults the policy in front of the 20s navigation wait.
    const src = read('naverBlogAutomation.ts');
    expect(src).toMatch(/if \(shouldAwaitPostLoginNavigation\(clickResult\)\) \{[\s\S]{0,200}waitForNavigation/);
  });

  it('워밍업 중복 19초: 세션 워밍업이 세워둔 블로그 홈(section.blog.naver.com)도 블로그 도메인으로 본다', () => {
    expect(shouldSkipBlogWriteWarmup('https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1&groupId=0')).toBe(true);
    expect(shouldSkipBlogWriteWarmup('https://section.blog.naver.com/ThemePost.naver?directoryNo=0')).toBe(true);
    // Still not blog: main portal / login / blank.
    expect(shouldSkipBlogWriteWarmup('https://www.naver.com')).toBe(false);
    expect(shouldSkipBlogWriteWarmup('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(shouldSkipBlogWriteWarmup('about:blank')).toBe(false);
  });
});
