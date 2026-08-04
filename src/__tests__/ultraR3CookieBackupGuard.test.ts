import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { saveCookies } from '../sessionPersistence';

/**
 * [2026-08-04] ULTRA 안정화 플랜 R3 — 세션 쿠키 백업 wipe P0.
 *
 * keep-alive는 about:blank 상태의 페이지에서 saveCookies를 호출할 수 있는데,
 * 인자 없는 page.cookies()는 현재 페이지 URL 기준이라 0개를 반환했다.
 * 그 0개가 그대로 cookies.json을 덮어써 복원할 세션이 사라졌다 —
 * "세션이 있는데 다시 로그인" 증상의 원인 중 하나.
 *
 * 계약: (1) 네이버 도메인을 명시해 쿠키를 획득한다.
 *       (2) 유효 쿠키 0개면 기존 백업을 덮어쓰지 않는다.
 *
 * 경로: vitest.config.ts가 electron을 src/__tests__/mocks/electron.ts로 alias
 * 하므로 app.getPath('userData')는 '/mock/userData'다.
 */
const USER_DATA = '/mock/userData';
const ACCOUNT = 'r3-cookie-guard-account';
const ACCOUNT_DIR = join(USER_DATA, 'sessions', ACCOUNT);
const COOKIE_FILE = join(ACCOUNT_DIR, 'cookies.json');

function makePage(cookies: unknown[], calls: unknown[][] = []) {
  return {
    cookies: async (...args: unknown[]) => {
      calls.push(args);
      return cookies;
    },
  } as any;
}

/** filterValidCookies가 만료로 거르지 않도록 충분히 미래인 epoch(초). */
const FUTURE_EXPIRY = Math.floor(new Date('2030-01-01T00:00:00Z').getTime() / 1000);

const REAL_COOKIE = {
  name: 'NID_AUT',
  value: 'r3-real-session-token',
  domain: '.naver.com',
  path: '/',
  expires: FUTURE_EXPIRY,
  httpOnly: true,
  secure: true,
};

function cleanup(): void {
  try { rmSync(ACCOUNT_DIR, { recursive: true, force: true }); } catch { /* noop */ }
}

describe('R3: keep-alive 빈 쿠키가 백업을 지우지 않는다', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('네이버 도메인을 명시해 쿠키를 획득한다 (about:blank에서 0개 반환 방지)', async () => {
    const calls: unknown[][] = [];
    await saveCookies(makePage([], calls), ACCOUNT);

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('https://nid.naver.com');
    expect(calls[0]).toContain('https://www.naver.com');
    expect(calls[0]).toContain('https://blog.naver.com');
  });

  it('유효 쿠키 0개면 기존 백업 파일을 그대로 보존한다', async () => {
    await saveCookies(makePage([REAL_COOKIE]), ACCOUNT);
    expect(existsSync(COOKIE_FILE), '백업 파일이 생성되어야 한다').toBe(true);
    const before = readFileSync(COOKIE_FILE, 'utf-8');
    expect(before).toContain('r3-real-session-token');

    // keep-alive가 about:blank에서 0개를 들고 오는 상황
    await saveCookies(makePage([]), ACCOUNT);

    const after = readFileSync(COOKIE_FILE, 'utf-8');
    expect(after).toBe(before);
    expect(after).toContain('r3-real-session-token');
  });

  it('백업이 없을 때는 빈 쿠키라도 파일을 생성한다 (최초 상태 기록 유지)', async () => {
    await saveCookies(makePage([]), ACCOUNT);
    expect(existsSync(COOKIE_FILE)).toBe(true);
    expect(JSON.parse(readFileSync(COOKIE_FILE, 'utf-8')).cookies).toEqual([]);
  });

  it('유효 쿠키가 있으면 정상적으로 덮어쓴다 (보존 가드가 갱신을 막지 않는다)', async () => {
    await saveCookies(makePage([REAL_COOKIE]), ACCOUNT);
    await saveCookies(
      makePage([{ ...REAL_COOKIE, value: 'r3-refreshed-token' }]),
      ACCOUNT,
    );
    const after = readFileSync(COOKIE_FILE, 'utf-8');
    expect(after).toContain('r3-refreshed-token');
    expect(after).not.toContain('r3-real-session-token');
  });
});
