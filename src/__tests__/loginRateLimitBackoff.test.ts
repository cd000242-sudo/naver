import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveServerSessionProbeVerdict } from '../automation/serverSessionProbePolicy';
import { AccountExecutionGuardError } from '../automation/accountExecutionGuard';
import { classifyPublishFailure } from '../automation/publishFailureClassifier';

// A rate limit is not evidence that credentials expired. Stop rather than repeat login.
describe('login rate-limit handling requires explicit recovery', () => {
  it.each([429, 500, 503])('HTTP %s remains unavailable, not login-required', (status) => {
    expect(resolveServerSessionProbeVerdict({ finalUrl: 'https://blog.naver.com/GoBlogWrite.naver', status }))
      .toMatchObject({ status: 'unavailable', ok: false });
  });
  it.each(['NETWORK_WAIT', 'LOGIN_REQUIRED', 'ACCOUNT_PROTECTED'] as const)('%s cannot be retried after IPC serialization', (code) => {
    const error = new AccountExecutionGuardError(code, 'timeout');
    expect(classifyPublishFailure(error)).toMatchObject({ code, retryable: false });
    expect(classifyPublishFailure(new Error(error.message))).toMatchObject({ code, retryable: false });
  });
  it('does not retain credential retry loops or convert session exceptions into false', () => {
    const source = readFileSync('src/naverBlogAutomation.ts', 'utf8');
    expect(/LOGIN_MAX_RETRIES|loginAttempt \* 12/.test(source)).toBe(false);
    expect(/ensureServerSession\([^)]*\)\s*\.catch\(\(\)\s*=>\s*false/.test(source)).toBe(false);
    expect(source.includes('if (!classifyPublishFailure(error).retryable) throw error;')).toBe(true);
  });
});
