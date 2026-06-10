import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * R7 — keep-alive must skip a session ONLY while a publish is actually running
 * on it, not for the whole lifetime of activeAccountId. The old check
 * (`accountId === this.activeAccountId`) stuck after publishing finished, so a
 * single account never got pinged again → server session expired → re-login →
 * CAPTCHA. Session persistence is also the multi-account CAPTCHA-avoidance lever.
 */
describe('keep-alive publish gate (R7)', () => {
  const mgr = read('browserSessionManager.ts');

  it('keep-alive skips on publishInProgress, not on activeAccountId', () => {
    const loop = mgr.slice(
      mgr.indexOf('for (const accountId of accountIds)'),
      mgr.indexOf('private async pingSingleSession')
    );
    expect(loop).toMatch(/if \(session\.publishInProgress\)/);
    expect(loop).not.toMatch(/if \(accountId === this\.activeAccountId\)/);
  });

  it('exposes markPublishing and tracks the flag on the session', () => {
    expect(mgr).toMatch(/markPublishing\(accountId: string, inProgress: boolean\): void/);
    expect(mgr).toContain('publishInProgress');
  });

  it('automation marks publishing true on session setup and false in both finally blocks', () => {
    const code = read('naverBlogAutomation.ts');
    expect(code).toMatch(/markPublishing\(this\.options\.naverId, true\)/);
    const falses = code.match(/markPublishing\(this\.options\.naverId, false\)/g) || [];
    // run() and runPostOnly() finally blocks
    expect(falses.length).toBeGreaterThanOrEqual(2);
  });
});
