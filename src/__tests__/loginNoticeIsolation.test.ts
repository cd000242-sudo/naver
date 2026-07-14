import { readFileSync } from 'node:fs';
import { resolveAuthenticationFailureMessage } from '../auth/authFailureMessagePolicy.js';
import { describe, expect, it } from 'vitest';

const ANNOUNCEMENT = [
  '우측 버튼에 사용법 유튜브영상 반드시 참고해주세요!!',
  '에이전트 모드도 사용이 가능합니다',
  '코덱스/클로드 코드를 사용하시는분들이시라면 한번 사용해보시는걸 추천드립니다.',
  '반드시 우측상단에 비용표를 참고해주시고 모르시는건 반드시 물어보세요!!',
].join('\n');

function loadRendererPolicy(): {
  resolveLoginAuthenticationResultError: (
    result: Record<string, unknown> | null,
    rawResponse: Record<string, unknown> | null,
    fallback: string,
  ) => string;
} {
  const loginHtml = readFileSync('public/login.html', 'utf8');
  const start = loginHtml.indexOf('const AUTHENTICATION_FAILURE_PATTERNS');
  const end = loginHtml.indexOf('let deviceId', start);
  if (start < 0 || end < 0) throw new Error('login authentication policy block not found');

  return new Function(
    `${loginHtml.slice(start, end)}; return { resolveLoginAuthenticationResultError };`,
  )() as ReturnType<typeof loadRendererPolicy>;
}

describe('login notice isolation', () => {
  it('never renders a server announcement as an authentication error', () => {
    const fallback = '아이디 또는 비밀번호가 올바르지 않습니다.';

    expect(resolveAuthenticationFailureMessage({ ok: false, message: ANNOUNCEMENT }, fallback)).toBe(fallback);
    expect(resolveAuthenticationFailureMessage({ ok: false, error: ANNOUNCEMENT }, fallback)).toBe(fallback);
  });

  it('preserves genuine authentication failures', () => {
    expect(resolveAuthenticationFailureMessage(
      { ok: false, error: 'Invalid credentials' },
      '인증에 실패했습니다.',
    )).toBe('Invalid credentials');

    expect(resolveAuthenticationFailureMessage(
      { ok: false, message: '라이선스가 만료되었습니다.' },
      '인증에 실패했습니다.',
    )).toBe('라이선스가 만료되었습니다.');
  });

  it.each([
    '이미 사용된 코드입니다.',
    '이미 사용 중인 아이디입니다.',
    '유효하지 않은 라이선스 코드입니다.',
  ])('preserves registration business errors: %s', (message) => {
    const { resolveLoginAuthenticationResultError } = loadRendererPolicy();
    expect(resolveAuthenticationFailureMessage(
      { ok: false, message },
      '라이선스 등록에 실패했습니다.',
    )).toBe(message);
    expect(resolveLoginAuthenticationResultError(
      { valid: false, message },
      { ok: false, message },
      '라이선스 등록에 실패했습니다.',
    )).toBe(message);
  });

  it('uses a fixed maintenance message instead of placing notice copy in the login form', () => {
    const fallback = '인증에 실패했습니다.';
    const expected = '현재 서비스 점검 중입니다. 잠시 후 다시 시도해주세요.';

    expect(resolveAuthenticationFailureMessage(
      { ok: false, code: 'SERVICE_DISABLED', notice: ANNOUNCEMENT, message: ANNOUNCEMENT },
      fallback,
    )).toBe(expected);
    expect(resolveAuthenticationFailureMessage(
      { ok: false, error: 'SERVICE_DISABLED', notice: ANNOUNCEMENT, message: ANNOUNCEMENT },
      fallback,
    )).toBe(expected);
    expect(resolveAuthenticationFailureMessage(
      { ok: false, serviceEnabled: false, notice: ANNOUNCEMENT, message: ANNOUNCEMENT },
      fallback,
    )).toBe(expected);
  });

  it('prefers the sanitized main-process message over raw renderer debug data', () => {
    const { resolveLoginAuthenticationResultError } = loadRendererPolicy();
    const maintenance = '현재 서비스 점검 중입니다. 잠시 후 다시 시도해주세요.';

    expect(resolveLoginAuthenticationResultError(
      { valid: false, message: maintenance },
      { ok: false, code: 'SERVICE_DISABLED', message: ANNOUNCEMENT },
      '인증에 실패했습니다.',
    )).toBe(maintenance);

    expect(resolveLoginAuthenticationResultError(
      { valid: false, message: ANNOUNCEMENT },
      { ok: false, message: ANNOUNCEMENT },
      '아이디 또는 비밀번호가 올바르지 않습니다.',
    )).toBe('아이디 또는 비밀번호가 올바르지 않습니다.');
  });

  it('keeps a second renderer-side guard and authoritative result contract', () => {
    const loginHtml = readFileSync('public/login.html', 'utf8');
    const licenseManager = readFileSync('src/licenseManager.ts', 'utf8');

    expect(loginHtml).toContain('resolveServerAuthenticationError');
    expect(loginHtml).toContain('resolveLoginAuthenticationResultError');
    expect(loginHtml).toContain('result?.valid === true');
    expect(loginHtml).not.toContain("verifyResponse.error || verifyResponse.message || '서버에서 인증을 거부했습니다.'");
    expect(loginHtml).not.toContain("verifyResponse.message || verifyResponse.error || '인증에 실패했습니다.'");
    expect(licenseManager).toContain('result.ok === false || result.valid === false');
  });
});
