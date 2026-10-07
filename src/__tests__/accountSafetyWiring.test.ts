import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
describe('production account safety boundaries', () => {
  it('does not submit credentials from the automatic login entry point', () => {
    const method = source.slice(source.indexOf('  async loginToNaver('), source.indexOf('  async navigateToBlogWrite('));
    expect(method).not.toMatch(/safeType\(|page\.type\(|naverPassword|warmupSession\(/);
    expect(method).toContain('ensureServerSession');
  });
  it('serializes both production publishing entry points per account', () => {
    expect(source).toContain('return this.withAccountExecution(() => this.runAccountInternal(runOptions));');
    expect(source).toContain('return this.withAccountExecution(() => this.runPostOnlyInternal(runOptions, keepBrowserOpen));');
  });
  it('never converts a session inspection exception to automatic login', () => {
    const run = source.slice(source.indexOf('  private async runAccountInternal('));
    expect(run).not.toContain('.catch(() => false)');
  });
  it('honors persistent stop state at cancellation checkpoints and commit', () => {
    const checkpoint = source.slice(source.indexOf('  private ensureNotCancelled('), source.indexOf('  private async normalizeSpacingAfterLastImage('));
    expect(checkpoint).toContain('getAccountExecutionGuard().assertAllowed');
    const commit = source.slice(source.indexOf('const beforeIrreversibleCommit = async'), source.indexOf('// ✅ [2026-02-07 FIX]'));
    expect(commit).toContain('this.ensureNotCancelled()');
  });
});
it('rejects overlapping dispatch before interpreting an active commit as abandoned', () => {
  const wrapper = source.slice(source.indexOf('  private async withAccountExecution'), source.indexOf('  private async runAccountInternal'));
  expect(wrapper.indexOf("guard.getStatus(this.options.naverId).busy")).toBeGreaterThan(-1);
  expect(wrapper.indexOf("guard.getStatus(this.options.naverId).busy")).toBeLessThan(wrapper.indexOf('journal.hasUnconfirmed'));
});
it('renderer blocks serialized account stops before any browser recovery or network retry', () => {
  const renderer = readFileSync(new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url), 'utf8');
  const block = renderer.slice(renderer.indexOf('function blockPostContentAppliedPublishRetry'), renderer.indexOf('function isRecoverablePublishAutomationError'));
  expect(block.includes('classifyPublishFailure(errorMsg)')).toBe(true);
  expect(block.includes('failure.retryable')).toBe(true);
});

it('rechecks the selected session before recording any irreversible commit', () => {
  const commit = source.slice(source.indexOf('const beforeIrreversibleCommit = async'), source.indexOf('// ✅ [2026-02-07 FIX]'));
  expect(commit.includes('await browserSessionManager.ensureServerSession(this.options.naverId)')).toBe(true);
  expect(commit.indexOf('ensureServerSession')).toBeLessThan(commit.indexOf('markSubmitting'));
});

it('leaves passkeys, second-factor trust and device enrollment to the user', () => {
 const manager = readFileSync(new URL('../browserSessionManager.ts', import.meta.url), 'utf8');
 expect(manager.includes('disablePlatformWebAuthn(page)')).toBe(false);
 expect(source.includes('private async handleDeviceConfirmPage')).toBe(false);
 expect(source.includes('private async handleTwoFactorAuthPage')).toBe(false);
});
