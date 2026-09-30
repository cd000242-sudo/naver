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
      status: 200,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain('http-200');
  });

  it('rejects fetch errors, timeouts, missing status and missing results', () => {
    expect(resolveServerSessionProbeVerdict({ error: 'timeout' })).toMatchObject({ ok: false, reason: 'timeout' });
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
  const start = code.indexOf('async ensureServerSession(');
  const body = code.slice(start, code.indexOf('isAccountLoggedIn(', start));

  it('routes the in-page probe result through resolveServerSessionProbeVerdict', () => {
    expect(body).toMatch(/resolveServerSessionProbeVerdict\(serverCheck\)/);
    // The old inline "not nidlogin ⇒ ok" rule must be gone from the probe itself.
    expect(body).not.toMatch(/ok:\s*!\/nidlogin/);
  });

  it('logs the probe reason on the success branch too (next report needs status+url)', () => {
    expect(body).toMatch(/if\s*\(verdict\.ok\)[\s\S]{0,400}?console\.log\([\s\S]{0,200}?verdict\.reason/);
  });

  // [2026-09-30] The bare PostWriteForm.naver route (no blogId) is 404 for a logged-out
  // client (measured 2026-09-29 and again 2026-09-30 with plain node fetch); nothing
  // ever showed it is 2xx for a logged-in one — v2.11.306 logged 0 passes / 2 fails on a
  // session that had published four posts hours earlier. GoBlogWrite.naver is the URL
  // the real editor navigation uses: logged out → 302 to nidlogin (measured), logged in
  // → editor 200 (hundreds of live runs). The probe must fetch the same thing.
  it('probes GoBlogWrite.naver — the same URL the editor navigation uses — not the bare 404 route', () => {
    // page.evaluate cannot see module constants — the URL must travel in as an argument.
    expect(body).toMatch(/page\.evaluate\(\s*async\s*\(probeUrl: string, timeoutMs: number\)/);
    expect(body).toMatch(/fetch\(probeUrl,/);
    expect(body).toMatch(/\},\s*SERVER_SESSION_PROBE_URL,\s*this\.SERVER_SESSION_CHECK_TIMEOUT_MS\)/);
    expect(body).not.toMatch(/fetch\('https:\/\/blog\.naver\.com\/PostWriteForm\.naver'/);
    expect(SERVER_SESSION_PROBE_URL).toBe('https://blog.naver.com/GoBlogWrite.naver');
  });
});
