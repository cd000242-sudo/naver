/**
 * [2026-10-09 사장님] "한 번 로그인하면 세션 쿠키가 유지되게."
 * "로그인 상태 유지" 없이 로그인한 계정은 네이버 로그인 쿠키가 세션 쿠키라 크롬을 닫으면 지워졌다.
 * 실측(자동화 크롬, 127.0.0.1): 크롬 "이전 세션 계속하기" 설정으로는 남지 않았고, 같은 쿠키에 만료일을 붙이면 남았다.
 * 사이트가 쿠키를 갱신하면 다시 세션 쿠키가 되므로 확인 시점·글 끝·크롬 닫기 직전에 다시 붙인다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPersistentLoginCookies, KEEP_LOGIN_DAYS } from '../automation/cookieRestorePolicy';

const now = 1_800_000_000;
const base = { domain: '.naver.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const };

describe('로그인 쿠키에 만료일 붙이기', () => {
  it('세션 쿠키인 NID_AUT·NID_SES·NID_JKL 만 30일 만료로 바꾸고 속성은 그대로 둔다', () => {
    const out = buildPersistentLoginCookies([
      { ...base, name: 'NID_AUT', value: 'a', expires: -1, session: true },
      { ...base, name: 'NID_SES', value: 's', expires: -1, session: true },
      { ...base, name: 'NID_JKL', value: 'j', expires: -1, session: true },
      { ...base, name: 'nid_inf', value: 'i', expires: -1, session: true },
      { ...base, name: 'NNB', value: 'n', expires: -1, session: true },
    ], now);
    expect(KEEP_LOGIN_DAYS).toBe(30);
    expect(out.map((c) => c.name)).toEqual(['NID_AUT', 'NID_SES', 'NID_JKL']);
    for (const c of out) {
      expect(c.expires).toBe(now + 30 * 24 * 3600);
      expect(c).toMatchObject({ domain: '.naver.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
    }
  });

  it('이미 만료일이 있는(로그인 상태 유지) 쿠키·빈 값은 건드리지 않는다', () => {
    expect(buildPersistentLoginCookies([
      { ...base, name: 'NID_AUT', value: 'a', expires: now + 999, session: false },
      { ...base, name: 'NID_SES', value: '', expires: -1, session: true },
    ], now)).toEqual([]);
  });
});

describe('연결: 세 시점에 다시 붙인다', () => {
  const manager = readFileSync(resolve('src/browserSessionManager.ts'), 'utf8').replace(/\r\n/g, '\n');
  const engine = readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
  it('서버가 로그인을 확인해 쿠키를 저장할 때', () => {
    const persist = manager.slice(manager.indexOf('private async persistVerifiedCookies('), manager.indexOf('async ensureServerSession('));
    expect(persist).toContain('keepLoginCookies(page)');
  });
  it('앱이 크롬을 닫기 직전에(닫기보다 먼저)', () => {
    const close = manager.slice(manager.indexOf('async closeSession('), manager.indexOf('startKeepalive(): void'));
    expect(close.indexOf('keepLoginCookies(session.page)')).toBeGreaterThan(-1);
    expect(close.indexOf('keepLoginCookies(session.page)')).toBeLessThan(close.indexOf('session.browser.close()'));
  });
  it('글 한 편을 마칠 때(두 발행 경로의 finally)', () => {
    expect((engine.match(/browserSessionManager\.keepLoginAfterRun\(this\.options\.naverId\)/g) || []).length).toBe(2);
  });
});
