/**
 * sessionGateTimeout.test.ts
 *
 * 발행 직전 서버 세션 gate가 네트워크/프록시/네이버 응답 지연 때문에
 * 무기한 멈추지 않도록 정적 회귀 가드로 박제한다.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../browserSessionManager.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('발행 직전 ensureServerSession timeout guard', () => {
  it('서버 세션 확인 전용 timeout 상수가 8초로 존재한다', () => {
    expect(code).toMatch(/SERVER_SESSION_CHECK_TIMEOUT_MS\s*=\s*8\s*\*\s*1000/);
  });

  it('page.evaluate 내부 fetch가 AbortController signal을 사용한다', () => {
    expect(code).toMatch(/new\s+AbortController\(\)/);
    expect(code).toMatch(/signal:\s*controller\.signal/);
    expect(code).toMatch(/controller\.abort\(\)/);
  });

  it('timeout 값을 evaluate로 전달해 브라우저 내부 fetch에 적용한다', () => {
    expect(code).toMatch(/page\.evaluate\(async\s*\(timeoutMs:\s*number\)/);
    expect(code).toMatch(/},\s*this\.SERVER_SESSION_CHECK_TIMEOUT_MS\)/);
  });

  it('실패/timeout 결과는 로그인 상태를 false로 전이시킨다', () => {
    expect(code).toMatch(/serverCheck\.ok/);
    expect(code).toMatch(/session\.loginVerifiedAt\s*=\s*0/);
    expect(code).toMatch(/session\.isLoggedIn\s*=\s*false/);
  });
});
