/**
 * Regression guard for the 2026-09-29 login loop: the pre-publish probe passed a
 * dead session because Naver answers PostWriteForm.naver with 404 (no login
 * redirect) when logged out. A valid verdict needs no-redirect AND 2xx.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveServerSessionProbeVerdict,
  isServerSessionLoginRedirect,
  SERVER_SESSION_PROBE_URL,
} from '../automation/serverSessionProbePolicy';

describe('resolveServerSessionProbeVerdict', () => {
  it('rejects the logged-out 404 measured live (final URL stays on blog.naver.com)', () => {
    const verdict = resolveServerSessionProbeVerdict({
      finalUrl: 'https://blog.naver.com/PostWriteForm.naver',
      status: 404,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('http-404');
  });

  it('rejects a login redirect even when the status is 200', () => {
    const verdict = resolveServerSessionProbeVerdict({
      finalUrl: 'https://nid.naver.com/nidlogin.login?mode=form&url=https://blog.naver.com/GoBlogWrite.naver',
      status: 200,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('login-redirect');
  });

  it('accepts a 2xx editor response without login redirect', () => {
    const verdict = resolveServerSessionProbeVerdict({
      finalUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test&Redirect=Write',
      status: 200, hasEditor: true,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain('http-200');
  });

  it('rejects fetch errors, timeouts, missing status and missing results', () => {
    expect(resolveServerSessionProbeVerdict({ error: 'timeout' })).toMatchObject({ ok: false, status: 'unavailable', reason: 'network-error' });
    expect(resolveServerSessionProbeVerdict({ error: 'Failed to fetch' }).ok).toBe(false);
    expect(resolveServerSessionProbeVerdict({ finalUrl: 'https://blog.naver.com/x' }).ok).toBe(false);
    expect(resolveServerSessionProbeVerdict({ finalUrl: 'https://blog.naver.com/x', status: 302 }).ok).toBe(false);
    expect(resolveServerSessionProbeVerdict(null).ok).toBe(false);
  });

  it('isServerSessionLoginRedirect matches both nidlogin URL shapes', () => {
    expect(isServerSessionLoginRedirect('https://nid.naver.com/nidlogin.login?mode=form')).toBe(true);
    expect(isServerSessionLoginRedirect('https://blog.naver.com/PostWriteForm.naver')).toBe(false);
    expect(isServerSessionLoginRedirect(undefined)).toBe(false);
  });
});

describe('ensureServerSession wiring', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../browserSessionManager.ts'), 'utf-8');
  const start = code.indexOf('private async probeServerSessionState(');
  const body = code.slice(start, code.indexOf('isAccountLoggedIn(', start));

  it('routes the in-page probe result through resolveServerSessionProbeVerdict', () => {
    expect(body).toMatch(/resolveServerSessionProbeVerdict\(serverCheck\)/);
    // The old inline "not nidlogin ⇒ ok" rule must be gone from the probe itself.
    expect(body).not.toMatch(/ok:\s*!\/nidlogin/);
  });

  it('does not log raw probe URLs or transport errors', () => {
    expect(body.includes("console.log(")).toBe(false);
  });

  // [2026-09-30] The bare PostWriteForm.naver route (no blogId) is 404 for a logged-out
  // client (measured 2026-09-29 and again 2026-09-30 with plain node fetch); nothing
  // ever showed it is 2xx for a logged-in one — v2.11.306 logged 0 passes / 2 fails on a
  // session that had published four posts hours earlier. GoBlogWrite.naver is the URL
  // the real editor navigation uses: logged out → 302 to nidlogin (measured), logged in
  // → editor 200 (hundreds of live runs). The probe must fetch the same thing.
  it('probes GoBlogWrite.naver — the same URL the editor navigation uses — not the bare 404 route', () => {
    // page.evaluate cannot see module constants — the URL must travel in as an argument.
    expect(body).toMatch(/page\.evaluate\(\s*async\s*\(probeUrl: string, timeoutMs: number, editorBodySelector: string\)/);
    expect(body).toMatch(/fetch\(probeUrl,/);
    expect(body).toMatch(/\},\s*SERVER_SESSION_PROBE_URL,\s*this\.SERVER_SESSION_CHECK_TIMEOUT_MS,\s*EDITOR_BODY_SELECTOR\)/);
    expect(body).not.toMatch(/fetch\('https:\/\/blog\.naver\.com\/PostWriteForm\.naver'/);
    expect(SERVER_SESSION_PROBE_URL).toBe('https://blog.naver.com/GoBlogWrite.naver');
  });
});


describe('typed session verdict and fail-closed evidence', () => {
  it.each([429, 500, 502, 503, 504])('HTTP %s is unavailable and never requests a fresh login', status => {
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status })).toMatchObject({ status: 'unavailable', ok: false });
  });
  it('does not infer an authenticated session from HTTP200 or an editor-looking URL alone', () => {
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200 })).toMatchObject({ status: 'unknown', ok: false });
    expect(resolveServerSessionProbeVerdict({ finalUrl: 'https://www.naver.com', status: 200, hasEditor: true })).toMatchObject({ status: 'unknown', ok: false });
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200, hasEditor: true })).toMatchObject({ status: 'ready', ok: true });
  });
  it.each([
    'https://nid.naver.com/user2/help/idSafetyRelease?token_help=private',
    'https://nid.naver.com/user2/protect',
  ])('recognizes a protection page at 200: %s', finalUrl => {
    expect(resolveServerSessionProbeVerdict({ finalUrl, status: 200, hasEditor: true })).toMatchObject({ status: 'protected', ok: false });
  });
  it('checks challenge and login DOM evidence before editor evidence', () => {
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200, hasEditor: true, hasChallenge: true })).toMatchObject({ status: 'challenge', ok: false });
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200, hasEditor: true, hasLoginForm: true })).toMatchObject({ status: 'login-required', ok: false });
    expect(resolveServerSessionProbeVerdict({ finalUrl: 'https://nid.naver.com/login/ext/verification', status: 200 })).toMatchObject({ status: 'challenge', ok: false });
  });
  it('recognizes bounded protection instructions without mistaking editor article text for a challenge', () => {
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200, bodyText: '회원님의 아이디가 보호조치되었습니다. 본인확인 후 이용해 주세요.' })).toMatchObject({ status: 'protected', ok: false });
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200, bodyText: '본인 인증을 완료해 주세요.' })).toMatchObject({ status: 'challenge', ok: false });
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL, status: 200, hasEditor: true, bodyText: '본인 인증을 완료해 주세요. 문구에 대한 블로그 안내글' })).toMatchObject({ status: 'ready', ok: true });
  });
  it.each([
    'https://blog.naver.com.evil.example/GoBlogWrite.naver',
    'https://evil.example/?next=https://blog.naver.com/GoBlogWrite.naver',
    'https://blog.naver.com@evil.example/GoBlogWrite.naver',
    'http://blog.naver.com/GoBlogWrite.naver',
    'https://blog.naver.com:8443/GoBlogWrite.naver',
    'https://user:password@blog.naver.com/GoBlogWrite.naver',
    'not-a-url',
  ])('does not trust lookalike or unexpected origins: %s', finalUrl => {
    expect(resolveServerSessionProbeVerdict({ finalUrl, status: 200, hasEditor: true, hasLoginForm: true })).toMatchObject({ status: 'unknown', ok: false });
    expect(isServerSessionLoginRedirect(finalUrl)).toBe(false);
  });
  it('does not detect login or challenge markers inside redirect query values', () => {
    expect(isServerSessionLoginRedirect('https://example.com/?next=https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(resolveServerSessionProbeVerdict({ finalUrl: SERVER_SESSION_PROBE_URL + '?next=nidlogin.login', status: 200, hasEditor: true })).toMatchObject({ status: 'ready', ok: true });
  });
  it('keeps diagnostics independent of raw URLs and transport messages', () => {
    for (const input of [
      { finalUrl: 'https://nid.naver.com/nidlogin.login?token=secret-value', status: 200 },
      { finalUrl: 'https://nid.naver.com/user2/protect?token=secret-value', status: 200 },
      { error: 'timeout at https://example.com/?token=secret-value' },
      { finalUrl: 'https://blog.naver.com/GoBlogWrite.naver?token=secret-value', status: 403 },
    ]) {
      expect(JSON.stringify(resolveServerSessionProbeVerdict(input))).not.toMatch(/secret-value|https?:/);
    }
  });
});
