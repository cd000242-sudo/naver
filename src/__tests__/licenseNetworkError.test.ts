import { describe, it, expect } from 'vitest';
import {
  classifyLicenseNetworkFailure,
  describeLicenseNetworkFailure,
} from '../licenseNetworkError';

/**
 * [2026-08-26 사장님 실측] 인증 화면에 "인터넷 연결을 확인하세요"가 떴는데 인터넷은 멀쩡했다.
 *   google.com 200 / script.google.com 200 / GAS 배포 URL 무응답(15초 타임아웃)
 * 서버가 응답하지 않은 것을 사용자 탓으로 표시하고 있었다.
 */
describe('인증 실패 원인 구분', () => {
  it('타임아웃(AbortError)을 인터넷 문제로 말하지 않는다', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(classifyLicenseNetworkFailure(abort)).toBe('timeout');
    const msg = describeLicenseNetworkFailure('인증', abort);
    expect(msg).toMatch(/인증 서버가 응답하지 않습니다/);
    expect(msg).toMatch(/인터넷 문제가 아닙니다/);
    expect(msg).not.toMatch(/인터넷 연결을 확인하세요/);
  });

  it('실제 연결 불가만 인터넷 확인을 안내한다', () => {
    for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN']) {
      const err = Object.assign(new Error('fetch failed'), { cause: { code } });
      expect(classifyLicenseNetworkFailure(err)).toBe('offline');
      expect(describeLicenseNetworkFailure('인증', err)).toMatch(/인터넷 연결을 확인하세요/);
    }
  });

  it('원인을 모르면 원인을 지목하지 않는다', () => {
    const msg = describeLicenseNetworkFailure('인증', new Error('무슨 일인지 모를 오류'));
    expect(classifyLicenseNetworkFailure(new Error('x'))).toBe('unknown');
    expect(msg).not.toMatch(/인터넷/);
    expect(msg).toMatch(/잠시 후 다시 시도/);
  });

  it('무엇이 실패했는지 문장 앞에 넣는다', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(describeLicenseNetworkFailure('인증번호 발송', abort)).toMatch(/^인증번호 발송에 실패했습니다/);
  });
});

describe('main.ts 가 이 분류를 쓴다', () => {
  it('"인터넷 연결을 확인하세요"를 무조건 띄우지 않는다', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf-8');
    expect(main).not.toMatch(/인증에 실패했습니다\. 인터넷 연결을 확인하세요/);
    expect(main).not.toMatch(/인증번호 발송에 실패했습니다\. 인터넷 연결을 확인하세요/);
    expect(main).toMatch(/describeLicenseNetworkFailure\('인증'/);
    expect(main).toMatch(/describeLicenseNetworkFailure\('인증번호 발송'/);
  });
});

describe('인증 서버 제한시간 (2026-08-26 실측)', () => {
  it('10초가 아니라 30초를 준다', async () => {
    const { LICENSE_SERVER_TIMEOUT_MS, LICENSE_SERVER_READ_RETRIES } = await import('../licenseNetworkError');
    // 같은 배포 URL 실측: 3.7초(정상) ~ 25초+(무응답).
    // 10초로 잡으면 서버가 멀쩡해도 앱이 먼저 끊어 "인증 실패"가 된다.
    expect(LICENSE_SERVER_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(LICENSE_SERVER_READ_RETRIES).toBeGreaterThanOrEqual(1);
  });

  it('main.ts에 10초 하드코딩이 남아 있지 않다', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf-8');
    expect(main).not.toMatch(/controller\.abort\(\), 10000\)/);
    expect(main).toMatch(/controller\.abort\(\), LICENSE_SERVER_TIMEOUT_MS\)/);
  });

  it('타임아웃에만 재시도한다 — 연결 불가는 반복해도 같다', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf-8');
    expect(main).toMatch(/classifyLicenseNetworkFailure\(err\) !== 'timeout'/);
  });
});
