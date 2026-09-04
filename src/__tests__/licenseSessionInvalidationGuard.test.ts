/**
 * [2026-09-04 실장애] GAS 백엔드 오타(`ReferenceError: phoneVerifiedColV is not defined`) 하나로
 * 전 고객이 "다른 기기에서 로그인하여 현재 세션이 종료되었습니다" 를 보고 강제 로그아웃됐다.
 * 서버는 코드 없이 예외 문자열만 돌려줬는데 앱이 그것을 세션 무효로 단정했다.
 * 서버가 사유를 분명히 밝힌 코드일 때만 로그아웃한다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '..', 'licenseManager.ts'), 'utf8');

describe('세션 무효 판정은 서버가 밝힌 코드로만', () => {
  it('강제 로그아웃 사유 코드가 목록으로 고정돼 있다', () => {
    for (const code of [
      'SESSION_EXPIRED_BY_OTHER_LOGIN', 'NO_SESSION', 'INVALID_CREDENTIALS',
      'LICENSE_EXPIRED', 'LICENSE_NOT_ACTIVATED', 'USER_BLOCKED', 'DEVICE_BLOCKED', 'PLATFORM_MISMATCH',
    ]) {
      expect(source).toContain(`'${code}',`);
    }
  });

  it('서버 예외 코드는 로그아웃 사유가 아니다', () => {
    const list = source.slice(source.indexOf('const SESSION_INVALIDATION_CODES'), source.indexOf(']);', source.indexOf('const SESSION_INVALIDATION_CODES')));
    for (const notReason of ['SERVER_ERROR', 'SERVER_BUSY', 'MISSING_APP_ID', 'MISSING_CREDENTIALS']) {
      expect(list).not.toContain(notReason);
    }
  });

  it('코드가 없거나 목록에 없으면 clearLicense 없이 로컬 세션을 유지한다', () => {
    expect(source).toContain('if (!SESSION_INVALIDATION_CODES.has(declaredCode)) {');
    expect(source).toContain('서버가 세션 무효 사유를 밝히지 않음 — 로컬 세션 유지');
    const guardAt = source.indexOf('if (!SESSION_INVALIDATION_CODES.has(declaredCode)) {');
    const clearAt = source.indexOf('await clearLicense();', guardAt);
    const returnValidAt = source.indexOf('return { valid: true };', guardAt);
    expect(returnValidAt).toBeGreaterThan(-1);
    expect(returnValidAt).toBeLessThan(clearAt);
  });
});
