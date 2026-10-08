/**
 * [2026-10-08 사장님] "직접 누르면 자동 확인". Live case: two accounts stayed stopped — one by a transient
 * NETWORK_WAIT from v2.11.326, one by an expired login — and every semi-auto press answered only
 * "계정 관리에서 상태 확인 후 직접 재개해 주세요".
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AccountExecutionGuardError } from '../automation/accountExecutionGuard';
import {
  CHALLENGE_WINDOW_MESSAGE,
  EDITOR_UNAVAILABLE_MESSAGE,
  LOGIN_WINDOW_MESSAGE,
  MISMATCH_MESSAGE,
  OUTCOME_UNKNOWN_MESSAGE,
  STATE_CHANGED_MESSAGE,
  explainUserRunStop,
  resumePausedAccountForUserRun,
  type UserRunResumeDeps,
} from '../automation/userRunResume';

type Over = Partial<UserRunResumeDeps> & { verdict?: string; reason?: string };

function deps(over: Over = {}) {
  const calls: string[] = [];
  const base: UserRunResumeDeps = {
    status: () => ({ paused: true, code: 'LOGIN_REQUIRED', busy: false }),
    hasUnconfirmedPublication: () => false,
    openSession: async () => { calls.push('open'); },
    resume: async (verify) => { calls.push('resume'); return verify(); },
    verify: async () => { calls.push('verify'); return { status: over.verdict ?? 'ready', reason: over.reason }; },
    showLogin: async () => { calls.push('login-window'); },
    pause: (code) => { calls.push(`pause:${code}`); },
    log: () => undefined,
  };
  return { d: { ...base, ...over } as UserRunResumeDeps, calls };
}

const stopped = (code: string) => () => ({ paused: true, code, busy: false });

describe('resumePausedAccountForUserRun', () => {
  it('a live login clears a LOGIN_REQUIRED or NETWORK_WAIT stop and lets the publish continue', async () => {
    for (const code of ['LOGIN_REQUIRED', 'NETWORK_WAIT']) {
      const { d, calls } = deps({ status: stopped(code) });
      await expect(resumePausedAccountForUserRun(d)).resolves.toBeUndefined();
      expect(calls).toEqual(['open', 'resume', 'verify']);
    }
  });

  it('an expired login brings the Naver login window forward and says exactly what to do', async () => {
    const { d, calls } = deps({ verdict: 'login-required' });
    const error = await resumePausedAccountForUserRun(d).catch((e) => e);
    expect(error).toBeInstanceOf(AccountExecutionGuardError);
    expect(error.code).toBe('LOGIN_REQUIRED');
    expect(error.message).toContain(LOGIN_WINDOW_MESSAGE);
    expect(calls).toContain('login-window');
  });

  it('a challenge or protection screen is recorded as such and left to the user', async () => {
    for (const [verdict, code] of [['challenge', 'LOGIN_CHALLENGE'], ['protected', 'ACCOUNT_PROTECTED']]) {
      const { d, calls } = deps({ verdict });
      const error = await resumePausedAccountForUserRun(d).catch((e) => e);
      expect(error.code).toBe(code);
      expect(error.message).toContain(CHALLENGE_WINDOW_MESSAGE);
      expect(calls).toContain(`pause:${code}`);
      expect(calls).toContain('login-window');
    }
  });

  it('a different Naver account logged in is recorded as a mismatch, not a network problem', async () => {
    const { d, calls } = deps({ verdict: 'unknown', reason: 'account-identity-unverified' });
    const error = await resumePausedAccountForUserRun(d).catch((e) => e);
    expect(error.code).toBe('ACCOUNT_MISMATCH');
    expect(error.message).toContain(MISMATCH_MESSAGE);
    expect(calls).toContain('pause:ACCOUNT_MISMATCH');
  });

  it('a passed check whose resume was refused (state changed meanwhile) asks for a retry', async () => {
    const { d } = deps({ resume: async (verify) => { await verify(); return false; } });
    const error = await resumePausedAccountForUserRun(d).catch((e) => e);
    expect(error.code).toBe('LOGIN_REQUIRED');
    expect(error.message).toContain(STATE_CHANGED_MESSAGE);
  });

  it('an unreachable editor keeps the stop and asks to retry later — no login window', async () => {
    const { d, calls } = deps({ status: stopped('NETWORK_WAIT'), verdict: 'unavailable' });
    const error = await resumePausedAccountForUserRun(d).catch((e) => e);
    expect(error.code).toBe('NETWORK_WAIT');
    expect(error.message).toContain(EDITOR_UNAVAILABLE_MESSAGE);
    expect(calls).not.toContain('login-window');
  });

  it('a running or unstopped account is left alone', async () => {
    for (const { d, calls } of [deps({ status: () => ({ paused: false, busy: false }) }), deps({ status: () => ({ paused: true, code: 'LOGIN_REQUIRED', busy: true }) })]) {
      await resumePausedAccountForUserRun(d);
      expect(calls).toEqual([]);
    }
  });

  it("stops that are the user's own decision are never cleared, but name the exact button", async () => {
    const cases: Array<[Over, string, string]> = [
      [{ status: stopped('LOGIN_CHALLENGE') }, 'LOGIN_CHALLENGE', CHALLENGE_WINDOW_MESSAGE],
      [{ status: stopped('ACCOUNT_PROTECTED') }, 'ACCOUNT_PROTECTED', CHALLENGE_WINDOW_MESSAGE],
      [{ status: stopped('ACCOUNT_MISMATCH') }, 'ACCOUNT_MISMATCH', MISMATCH_MESSAGE],
      [{ status: stopped('PUBLISH_OUTCOME_UNKNOWN') }, 'PUBLISH_OUTCOME_UNKNOWN', OUTCOME_UNKNOWN_MESSAGE],
      [{ hasUnconfirmedPublication: () => true }, 'PUBLISH_OUTCOME_UNKNOWN', OUTCOME_UNKNOWN_MESSAGE],
    ];
    for (const [over, code, message] of cases) {
      const { d, calls } = deps(over);
      const error = await resumePausedAccountForUserRun(d).catch((e) => e);
      expect(error.code).toBe(code);
      expect(error.message).toContain(message);
      expect(calls).not.toContain('resume');
      expect(calls.some((c) => c.startsWith('pause:'))).toBe(false);
    }
  });
});

describe('explainUserRunStop', () => {
  it('a login found expired mid-run opens the login window with the same guidance, keeping the cause', async () => {
    const showLogin = vi.fn(async () => undefined);
    const out = await explainUserRunStop(new AccountExecutionGuardError('LOGIN_REQUIRED'), { showLogin }) as Error & { cause?: unknown };
    expect(out.message).toContain(LOGIN_WINDOW_MESSAGE);
    expect(out.cause).toBeInstanceOf(AccountExecutionGuardError);
    expect(showLogin).toHaveBeenCalledTimes(1);
  });

  it('any other error passes through untouched', async () => {
    const showLogin = vi.fn(async () => undefined);
    const original = new AccountExecutionGuardError('LOGIN_CHALLENGE');
    expect(await explainUserRunStop(original, { showLogin })).toBe(original);
    const plain = new Error('x');
    expect(await explainUserRunStop(plain, { showLogin })).toBe(plain);
    expect(showLogin).not.toHaveBeenCalled();
  });
});

describe('wiring: only a pressed semi-auto publish re-checks', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8').replace(/\r\n/g, '\n');

  it('BlogExecutor needs the semi-auto flow AND the press mark, never an app schedule', () => {
    const src = read('main/services/BlogExecutor.ts');
    expect(src).toContain("resumeOnUserRun: (payload as any)._publishFlow === 'semi_auto'\n                && (payload as any)._userPressedPublish === true\n                && !(payload.publishMode === 'schedule' && (payload as any).scheduleType === 'app-schedule'),");
  });

  it('the renderer marks a pressed semi-auto publish, never the continuous queue', () => {
    expect(read('renderer/modules/fullAutoFlow.ts')).toContain('_userPressedPublish: formData._semiAutoMode === true && window.isContinuousMode !== true,');
  });

  it('run() re-checks before the guarded run, registers stealth before the check navigates, and never types credentials', () => {
    const src = read('naverBlogAutomation.ts');
    expect(src).toMatch(/if \(runOptions\.resumeOnUserRun !== true\) return this\.withAccountExecution\(\(\) => this\.runAccountInternal\(runOptions\)\);\s*const deps = this\.userRunResumeDeps\(\);\s*await resumePausedAccountForUserRun\(deps\);/);
    expect(src).toContain('throw await explainUserRunStop(error, deps);');
    expect(src).toMatch(/this\.page = session\.page;\s*await this\.setupStealthSupplements\(\)/);
    expect(src).toContain('showLogin: () => browserSessionManager.openForUser(id),');
    expect(src).toContain('verify: () => browserSessionManager.verifyAccountForUser(id),');
  });
});
