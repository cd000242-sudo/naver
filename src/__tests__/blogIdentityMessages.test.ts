/**
 * [2026-10-09] User-facing side of the blog-identity fix: the mismatch text names both blogs, the stop texts point to the
 * on-screen notice first (main-screen users have no "계정 관리"), and the account-safety controller passes the
 * configured/fallback distinction and the user's re-learn intent to the session manager.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountExecutionGuard, AccountExecutionGuardError } from '../automation/accountExecutionGuard';
import { PublicationCommitJournal } from '../automation/publicationCommitJournal';
import { describeBlogMismatch } from '../automation/expectedBlogIdentity';
import {
  CHALLENGE_WINDOW_MESSAGE, MISMATCH_MESSAGE, OUTCOME_UNKNOWN_MESSAGE, resumePausedAccountForUserRun, type UserRunResumeDeps,
} from '../automation/userRunResume';
import { createAccountSafetyController } from '../main/accountSafetyController';

const GUIDANCE = '화면의 안내 창(또는 계정 관리)의 [확인 후 재개]';

describe('stop texts do not point only to 계정 관리', () => {
  it('mismatch, challenge and outcome texts name the on-screen notice first', () => {
    expect(MISMATCH_MESSAGE).toContain(GUIDANCE);
    expect(CHALLENGE_WINDOW_MESSAGE).toContain(GUIDANCE);
    expect(OUTCOME_UNKNOWN_MESSAGE).toContain('화면의 안내 창(또는 계정 관리)');
    for (const text of [MISMATCH_MESSAGE, CHALLENGE_WINDOW_MESSAGE, OUTCOME_UNKNOWN_MESSAGE]) expect(text).not.toMatch(/(^|[^)])계정 관리(의|에서) \[/);
  });

  it('the default guard stop message names the on-screen notice too', () => {
    expect(new AccountExecutionGuardError('NETWORK_WAIT').message).toContain('화면의 안내 창(또는 계정 관리)');
    expect(new AccountExecutionGuardError('NETWORK_WAIT').message).not.toContain('계정 관리에서 상태 확인');
  });

  it('the login stops in the publish engine name the on-screen notice', () => {
    const engine = readFileSync(join(process.cwd(), 'src', 'naverBlogAutomation.ts'), 'utf8');
    expect(engine).not.toContain("'계정 관리에서 네이버에 로그인한 뒤 확인 후 재개를 눌러주세요.'");
    expect(engine).not.toContain('계정 관리에서 네이버 확인 후 재개해주세요.');
    expect(engine).toContain('화면의 안내 창(또는 계정 관리)');
  });
});

describe('a user-pressed run on a mismatch stop', () => {
  const deps = (): UserRunResumeDeps => ({
    status: () => ({ paused: true, code: 'NETWORK_WAIT', busy: false }), hasUnconfirmedPublication: () => false,
    openSession: async () => undefined, resume: async verify => verify(),
    verify: async () => ({ status: 'unknown', reason: 'account-identity-unverified', identityMismatch: true, observedBlogId: 'xxx', expectedBlogId: 'yyy' } as never),
    showLogin: async () => undefined, pause: () => undefined, log: () => undefined,
  });
  it('names both blogs and the on-screen [확인 후 재개]', async () => {
    const error = await resumePausedAccountForUserRun(deps()).catch(e => e);
    expect(error.code).toBe('ACCOUNT_MISMATCH');
    expect(error.message).toContain(describeBlogMismatch('xxx', 'yyy'));
    expect(error.message).toContain(GUIDANCE);
  });
  it('a stored ACCOUNT_MISMATCH stop (no fresh verdict) keeps the generic mismatch text', async () => {
    const error = await resumePausedAccountForUserRun({ ...deps(), status: () => ({ paused: true, code: 'ACCOUNT_MISMATCH', busy: false }) }).catch(e => e);
    expect(error.message).toContain(MISMATCH_MESSAGE);
  });
});

describe('account safety controller', () => {
  const roots: string[] = [];
  afterEach(() => { for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true }); });
  function setup(accounts: Array<{ id: string; naverId?: string; blogId: string }> = [], known?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'blog-identity-controller-')); roots.push(dir);
    const guard = new AccountExecutionGuard({ storageDir: join(dir, 'guard') });
    const journal = new PublicationCommitJournal({ storageDir: join(dir, 'journal') });
    const sessions = {
      setExpectedBlogId: vi.fn(), getKnownBlogId: vi.fn(() => known), openForUser: vi.fn(async () => undefined), ensureSessionForUser: vi.fn(async () => undefined),
      openPostListForUser: vi.fn(async () => undefined), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })),
      verifyAccountForUser: vi.fn(async (): Promise<Record<string, unknown>> => ({ status: 'ready', blogId: 'leader_248' })),
    };
    return { controller: createAccountSafetyController(() => accounts, sessions, guard, journal), guard, journal, sessions };
  }

  it('a confirmed other blog names both blogs and the guidance', async () => {
    const { controller, guard, sessions } = setup();
    guard.pause('main-id', 'ACCOUNT_MISMATCH');
    sessions.verifyAccountForUser.mockResolvedValue({ status: 'unknown', reason: 'account-identity-unverified', identityMismatch: true, observedBlogId: 'xxx', expectedBlogId: 'yyy' });
    const state = controller.status('main-id', 'naver-id');
    const reply = await controller.act('main-id', 'resume', state.version, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(false);
    expect(reply.message).toContain(describeBlogMismatch('xxx', 'yyy'));
    expect(reply.message).toContain('[확인 후 재개]');
    expect(sessions.openForUser).toHaveBeenCalledWith('main-id');
  });

});
