/**
 * [2026-09-12] 인증 판정 구멍 — 실측으로 드러났다.
 *
 * GAS /exec 는 302 로 리다이렉트되고 그 왕복이 늦어지면 앱이 doPost 결과가 아니라 기본 응답
 * {"ok":true,"message":"License Management System API is running"} 을 받는다. 존재하지 않는
 * ID 로 3회 호출 중 1회가 이 응답이었다(36초). 예전 판정은 "(ok===false || valid===false)"
 * 만 실패로 봐서 이 응답이 성공으로 통과했고 — 없는 계정에도 프리미엄 라이선스가 저장됐다.
 *
 * 계약: 성공은 서버가 valid:true 로 명시한다. 침묵은 성공이 아니다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasPositiveAuthSignal, isServerPlaceholderResponse } from '../licenseManager';

const PLACEHOLDER = { ok: true, timestamp: 1789169307620, message: 'License Management System API is running' };
const REAL_SUCCESS = {
  ok: true, valid: true, expiresAt: null, licenseType: 'LIFE',
  licenseCode: 'XXXX-XXXX', sessionToken: 'abc123def456', phoneVerified: true,
};
const REAL_FAILURE = { ok: false, valid: false, code: 'INVALID_CREDENTIALS', error: '아이디 또는 비밀번호가 올바르지 않습니다.' };

describe('인증 판정 — 침묵은 성공이 아니다', () => {
  it('기본 응답("API is running")을 성공으로 세지 않는다', () => {
    expect(isServerPlaceholderResponse(PLACEHOLDER)).toBe(true);
    expect(hasPositiveAuthSignal(PLACEHOLDER)).toBe(false);
  });

  it('진짜 성공 응답은 통과시킨다', () => {
    expect(isServerPlaceholderResponse(REAL_SUCCESS)).toBe(false);
    expect(hasPositiveAuthSignal(REAL_SUCCESS)).toBe(true);
  });

  it('진짜 실패 응답은 성공 신호가 없다', () => {
    expect(hasPositiveAuthSignal(REAL_FAILURE)).toBe(false);
    expect(isServerPlaceholderResponse(REAL_FAILURE)).toBe(false);
  });

  it('valid 를 안 주는 구버전 응답은 계정 고유값이 있을 때만 성공으로 본다', () => {
    expect(hasPositiveAuthSignal({ ok: true, sessionToken: 'tok-1' })).toBe(true);
    expect(hasPositiveAuthSignal({ ok: true, licenseType: 'LIFE' })).toBe(true);
    expect(hasPositiveAuthSignal({ ok: true })).toBe(false);          // 아무 근거 없음
    expect(hasPositiveAuthSignal({ ok: true, sessionToken: '  ' })).toBe(false);
  });

  it('빈 응답·비객체는 판정 불가로 본다', () => {
    for (const bad of [null, undefined, '', 0, 'ok', {}]) {
      expect(isServerPlaceholderResponse(bad)).toBe(true);
      expect(hasPositiveAuthSignal(bad)).toBe(false);
    }
  });
});

describe('요청 타임아웃', () => {
  it('라이선스 요청 타임아웃은 20초다 — 60초는 로그인 창을 2분 넘게 붙잡았다', () => {
    const src = readFileSync(resolve(__dirname, '../licenseManager.ts'), 'utf8');
    expect(src).toMatch(/const LICENSE_REQUEST_TIMEOUT_MS = 20000;/);
    expect(src).not.toMatch(/controller\.abort\(\), 60000/);
  });
});
