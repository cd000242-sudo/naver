// "네이버 계정 연결" — the main-process side: status mapping, busy refusal, no pause/resume side effects,
// the login watch (read-only peek) and the saved-login expiry reader (never returns or logs cookie values).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONNECT_WATCH_INTERVAL_MS, CONNECT_WATCH_MAX_MS, clearConnectionsForTest, connectWatchTick, connectionCheck,
  getConnection, isWatchingLoginForConnect, mapVerdictToConnection, readSavedLogin, stopLoginConnectWatch,
  watchLoginForConnect, type ConnectWatchDeps, type ConnectionCheckDeps,
} from '../main/accountConnection';

const ID = 'leader_248';
const NOW = 1_700_000_000_000;

function deps(over: Partial<ConnectWatchDeps> = {}) {
  const base = {
    status: vi.fn(() => ({ paused: false, busy: false })),
    ensureSession: vi.fn(async () => {}),
    verify: vi.fn(async () => ({ status: 'ready', blogId: 'my_blog' })),
    openWindow: vi.fn(async () => {}),
    peek: vi.fn(async () => ({ open: true, onLoginPage: false, fingerprint: 'https://www.naver.com/|aaa' })),
    now: () => NOW,
  };
  return { ...base, ...over } as typeof base & ConnectWatchDeps;
}

beforeEach(() => { clearConnectionsForTest(); stopLoginConnectWatch(); });
afterEach(() => { stopLoginConnectWatch(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('mapVerdictToConnection', () => {
  it.each([
    [{ status: 'ready', blogId: 'b1' }, 'connected'],
    [{ status: 'login-required' }, 'login-required'],
    [{ status: 'challenge' }, 'challenge'],
    [{ status: 'protected' }, 'protected'],
    [{ status: 'unknown', reason: 'account-identity-unverified' }, 'mismatch'],
    [{ status: 'unknown', reason: 'account-identity-unverified', identityMismatch: true }, 'mismatch'],
    [{ status: 'unknown', reason: 'session-unavailable' }, 'unavailable'],
    [{ status: 'unavailable', reason: 'editor-unavailable' }, 'unavailable'],
  ])('%j -> %s', (verdict, expected) => {
    expect(mapVerdictToConnection(verdict as never)).toBe(expected);
  });
});

describe('connectionCheck', () => {
  it('refuses while the account is busy and touches nothing', async () => {
    const d = deps({ status: vi.fn(() => ({ paused: false, busy: true })) });
    const reply = await connectionCheck(ID, d);
    expect(reply.success).toBe(false);
    expect(reply.message).toContain('작업이 끝난 뒤');
    expect(d.ensureSession).not.toHaveBeenCalled();
    expect(d.verify).not.toHaveBeenCalled();
    expect(d.openWindow).not.toHaveBeenCalled();
    expect(getConnection(ID)).toBeUndefined();
  });

  it('records a connected result with the blog and the check time, and does not open a window', async () => {
    const d = deps();
    const reply = await connectionCheck(ID, d);
    expect(reply).toMatchObject({ success: true, result: { state: 'connected', blogId: 'my_blog', checkedAt: NOW } });
    expect(getConnection(ID)).toEqual({ state: 'connected', blogId: 'my_blog', checkedAt: NOW });
    expect(d.openWindow).not.toHaveBeenCalled();
  });

  it('brings the window forward when a person has to act (login / challenge / protection / other account)', async () => {
    for (const verdict of [{ status: 'login-required' }, { status: 'challenge' }, { status: 'protected' }, { status: 'unknown', reason: 'account-identity-unverified' }]) {
      const d = deps({ verify: vi.fn(async () => verdict) as never });
      const reply = await connectionCheck(ID, d);
      expect(reply.success).toBe(true);
      expect(d.openWindow).toHaveBeenCalledTimes(1);
    }
  });

  it('does not open a window for an unavailable result or when told not to', async () => {
    const unavailable = deps({ verify: vi.fn(async () => ({ status: 'unavailable' })) as never });
    await connectionCheck(ID, unavailable);
    expect(unavailable.openWindow).not.toHaveBeenCalled();
    const quiet = deps({ verify: vi.fn(async () => ({ status: 'login-required' })) as never });
    await connectionCheck(ID, quiet, { bringWindow: false });
    expect(quiet.openWindow).not.toHaveBeenCalled();
  });

  it('a failed window open does not fail the check', async () => {
    const d = deps({ verify: vi.fn(async () => ({ status: 'login-required' })) as never, openWindow: vi.fn(async () => { throw new Error('x'); }) });
    expect((await connectionCheck(ID, d)).success).toBe(true);
  });

  it('records unavailable when the browser cannot be prepared and never verifies', async () => {
    const d = deps({ ensureSession: vi.fn(async () => { throw new Error('chrome missing'); }) });
    const reply = await connectionCheck(ID, d);
    expect(reply.success).toBe(false);
    expect(reply.result?.state).toBe('unavailable');
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('a verify that throws is recorded as unavailable', async () => {
    const d = deps({ verify: vi.fn(async () => { throw new Error('boom'); }) });
    expect((await connectionCheck(ID, d)).result?.state).toBe('unavailable');
  });

  it('passes allowRelearn through (default true for a click, false when asked)', async () => {
    const click = deps(); await connectionCheck(ID, click);
    expect(click.verify).toHaveBeenCalledWith(ID, { allowRelearn: true });
    const watcher = deps(); await connectionCheck(ID, watcher, { allowRelearn: false });
    expect(watcher.verify).toHaveBeenCalledWith(ID, { allowRelearn: false });
  });

  it('never changes the stop state: it only reads status, and says so when the account is still stopped', async () => {
    const status = vi.fn(() => ({ paused: true, code: 'LOGIN_REQUIRED', busy: false }));
    const d = deps({ status });
    const reply = await connectionCheck(ID, d);
    expect(status).toHaveBeenCalled();
    expect(reply.result?.state).toBe('connected');
    expect(reply.message).toContain('멈춤');
  });
});

describe('connectWatchTick', () => {
  const watch = () => ({ startedAt: NOW, lastChecked: '' });

  it('waits on the login page without checking', async () => {
    const d = deps({ peek: vi.fn(async () => ({ open: true, onLoginPage: true, fingerprint: 'login|none' })) });
    expect(await connectWatchTick(ID, d, watch())).toBe('continue');
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('waits when the window is unchanged since the last check', async () => {
    const d = deps();
    expect(await connectWatchTick(ID, d, { startedAt: NOW, lastChecked: 'https://www.naver.com/|aaa' })).toBe('continue');
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('waits (without even peeking) while the account is busy', async () => {
    const d = deps({ status: vi.fn(() => ({ paused: false, busy: true })) });
    expect(await connectWatchTick(ID, d, watch())).toBe('continue');
    expect(d.peek).not.toHaveBeenCalled();
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('stops when the window was closed', async () => {
    const d = deps({ peek: vi.fn(async () => ({ open: false, onLoginPage: false, fingerprint: '' })) });
    expect(await connectWatchTick(ID, d, watch())).toBe('stop');
  });

  it('checks once after the login page is left, quietly (no window move, no relearn), and ends on connected', async () => {
    const d = deps();
    const w = watch();
    expect(await connectWatchTick(ID, d, w)).toBe('connected');
    expect(d.verify).toHaveBeenCalledTimes(1);
    expect(d.verify).toHaveBeenCalledWith(ID, { allowRelearn: false });
    expect(d.openWindow).not.toHaveBeenCalled();
    expect(getConnection(ID)?.state).toBe('connected');
  });

  it('keeps watching after a failed check and does not recheck the same window', async () => {
    const d = deps({ verify: vi.fn(async () => ({ status: 'challenge' })) as never });
    const w = watch();
    expect(await connectWatchTick(ID, d, w)).toBe('continue');
    expect(await connectWatchTick(ID, d, w)).toBe('continue');
    expect(d.verify).toHaveBeenCalledTimes(1);
    expect(d.openWindow).not.toHaveBeenCalled();
  });

  it('stops after the time limit', async () => {
    const d = deps({ now: () => NOW + CONNECT_WATCH_MAX_MS + 1 });
    expect(await connectWatchTick(ID, d, watch())).toBe('stop');
    expect(d.peek).not.toHaveBeenCalled();
  });

  it('leaves a LOGIN_REQUIRED / ACCOUNT_MISMATCH stop to the auto-resume watcher', async () => {
    for (const code of ['LOGIN_REQUIRED', 'ACCOUNT_MISMATCH']) {
      const d = deps({ status: vi.fn(() => ({ paused: true, code, busy: false })) });
      expect(await connectWatchTick(ID, d, watch())).toBe('stop');
      expect(d.peek).not.toHaveBeenCalled();
    }
  });

  it('still watches an account stopped for another reason (the stop itself is not touched)', async () => {
    const d = deps({ status: vi.fn(() => ({ paused: true, code: 'LOGIN_CHALLENGE', busy: false })) });
    expect(await connectWatchTick(ID, d, watch())).toBe('connected');
  });
});

describe('watchLoginForConnect', () => {
  it('does not start for an account the auto-resume watcher owns', () => {
    const d = deps({ status: vi.fn(() => ({ paused: true, code: 'LOGIN_REQUIRED', busy: false })) });
    watchLoginForConnect(ID, d);
    expect(isWatchingLoginForConnect(ID)).toBe(false);
  });

  it('polls every few seconds read-only, ends on connected, and never starts twice', async () => {
    vi.useFakeTimers();
    const d = deps();
    watchLoginForConnect(ID, d); watchLoginForConnect(ID, d);
    expect(isWatchingLoginForConnect(ID)).toBe(true);
    expect(d.peek).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CONNECT_WATCH_INTERVAL_MS);
    expect(d.peek).toHaveBeenCalledTimes(1);
    expect(d.verify).toHaveBeenCalledTimes(1);
    expect(isWatchingLoginForConnect(ID)).toBe(false);
  });

  it('ends when the window is closed', async () => {
    vi.useFakeTimers();
    const d = deps({ peek: vi.fn(async () => ({ open: false, onLoginPage: false, fingerprint: '' })) });
    watchLoginForConnect(ID, d);
    await vi.advanceTimersByTimeAsync(CONNECT_WATCH_INTERVAL_MS);
    expect(isWatchingLoginForConnect(ID)).toBe(false);
  });
});

describe('readSavedLogin', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const secret = 'SECRET-COOKIE-VALUE-123';
  function cookieFile(cookies: unknown[]): () => string {
    const dir = mkdtempSync(join(tmpdir(), 'saved-login-')); dirs.push(dir);
    const file = join(dir, 'cookies.json');
    writeFileSync(file, JSON.stringify({ cookies, savedAt: 'x', accountId: ID }));
    return () => file;
  }
  const cookie = (name: string, expires: number) => ({ name, value: secret, domain: '.naver.com', path: '/', expires });
  const future = (days: number) => Date.now() / 1000 + days * 86_400;

  it('reports the earliest login-cookie expiry only, never a value', async () => {
    const soon = future(10); const later = future(300);
    const path = cookieFile([cookie('NID_AUT', later), cookie('NID_SES', soon), cookie('other', future(1))]);
    const log = vi.spyOn(console, 'log'); const warn = vi.spyOn(console, 'warn'); const error = vi.spyOn(console, 'error');
    const result = await readSavedLogin(ID, path);
    expect(result).toEqual({ saved: true, expiresAt: Math.round(soon * 1000) });
    expect(JSON.stringify(result)).not.toContain(secret);
    for (const spy of [log, warn, error]) expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
  });

  it('treats login cookies without an expiry as saved without a date', async () => {
    const result = await readSavedLogin(ID, cookieFile([cookie('NID_AUT', -1), cookie('NID_SES', -1)]));
    expect(result).toEqual({ saved: true });
  });

  it.each([
    ['expired', [cookie('NID_AUT', 5), cookie('NID_SES', 5)]],
    ['only one of the two', [cookie('NID_AUT', future(5))]],
    ['no login cookie', [cookie('other', future(5))]],
    ['no cookies', []],
  ])('is not saved when %s', async (_name, cookies) => {
    expect(await readSavedLogin(ID, cookieFile(cookies as unknown[]))).toEqual({ saved: false });
  });

  it('is not saved for a missing or broken file', async () => {
    expect(await readSavedLogin(ID, () => join(tmpdir(), 'no-such-dir-xyz', 'cookies.json'))).toEqual({ saved: false });
    const dir = mkdtempSync(join(tmpdir(), 'saved-login-')); dirs.push(dir);
    writeFileSync(join(dir, 'cookies.json'), '{not json');
    expect(await readSavedLogin(ID, () => join(dir, 'cookies.json'))).toEqual({ saved: false });
  });

  it('never builds a path from an unsafe id', async () => {
    const resolver = vi.fn(() => 'x');
    for (const bad of ['../evil', 'a/b', 'a\\b', '', 'x'.repeat(101)]) expect(await readSavedLogin(bad, resolver)).toEqual({ saved: false });
    expect(resolver).not.toHaveBeenCalled();
  });
});

// Type-level guard: the check deps carry no way to pause or resume an account.
const _noPause: ConnectionCheckDeps extends { pause: unknown } ? never : true = true;
void _noPause;
