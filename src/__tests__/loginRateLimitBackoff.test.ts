import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard: 프록시 미사용 다중계정 로그인 일시 차단("작동하지 않습니다") 백오프 (2026-06-23).
 *
 * Owner confirmed everyone runs WITHOUT a proxy (the shared bought proxy ran out fast). So the
 * multi-account login error "이 페이지가 작동하지 않습니다" is Naver temporarily blocking rapid
 * sequential logins from the same IP, NOT a proxy failure. A short 5s retry hits the same block;
 * the fix waits with a longer, jittered backoff so the temporary block clears, and adds one more
 * retry. Longer waits only affect the failing path — normal logins are unaffected.
 */
describe('login rate-limit backoff (no-proxy multi-account)', () => {
  const automation = read('naverBlogAutomation.ts');

  it('uses a long jittered backoff on the error page instead of a flat 5s', () => {
    expect(automation).toMatch(/const backoffSec = loginAttempt \* 12 \+ this\.randomInt\(0, 8\)/);
    // the old flat 5s-per-attempt error-page retry must be gone
    expect(automation).not.toContain('await this.delay(loginAttempt * 5 * 1000);');
  });

  it('raises the login retry ceiling to 4', () => {
    expect(automation).toContain('const LOGIN_MAX_RETRIES = 4;');
  });
});
