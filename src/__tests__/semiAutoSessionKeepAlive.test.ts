import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard: 반자동(semi-auto) 발행 후 세션/인스턴스 유지 (2026-06-30).
 *
 * User report: after a semi-auto publish, the next post logs in again — the session isn't kept.
 * Root cause found by code trace: endAutomationRun() used `if (!payload.keepBrowserOpen)` (falsy),
 * while BlogExecutor's close path uses `=== false`. Semi-auto does NOT send keepBrowserOpen, so it
 * arrives as undefined → falsy → endAutomationRun deleted the automation instance and cleared the
 * current instance every publish, so the next publish started from scratch (re-login). The policy
 * is "undefined = keep-alive 우선", so only an explicit false should tear down.
 *
 * Fix: gate the teardown on `=== false` (consistent with BlogExecutor) so undefined keeps the session.
 */
describe('semi-auto session keep-alive', () => {
  const blogHandlers = read('main/ipc/blogHandlers.ts');
  const blogExecutor = read('main/services/BlogExecutor.ts');

  it('endAutomationRun tears down only on explicit keepBrowserOpen === false', () => {
    expect(blogHandlers).toContain('if (payload.keepBrowserOpen === false)');
    // the old falsy check must be gone
    expect(blogHandlers).not.toMatch(/if \(!payload\.keepBrowserOpen\)\s*\{/);
  });

  it('matches BlogExecutor close-gate (both use === false, not falsy)', () => {
    expect(blogExecutor).toContain('payload.keepBrowserOpen === false');
  });
});
