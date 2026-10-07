import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveServerSessionProbeVerdict } from '../automation/serverSessionProbePolicy';
import {
  summarizeNaverSessionCookies,
  describeNaverSessionCookies,
  NAVER_COOKIE_PROBE_URLS,
} from '../automation/sessionCookieDiagnostics';

describe('summarizeNaverSessionCookies', () => {
  it('reports names only, never values', () => {
    const summary = summarizeNaverSessionCookies([
      { name: 'NID_AUT', domain: '.naver.com', value: 'SECRET-AUT' } as any,
      { name: 'NID_SES', domain: '.naver.com', value: 'SECRET-SES' } as any,
      { name: 'NNB', domain: '.naver.com', value: 'x' } as any,
    ]);
    expect(summary).toBe('total=3 NID_AUT=yes NID_SES=yes NID_JKL=no nid_inf=no');
    expect(summary).not.toContain('SECRET');
  });

  it('handles empty and missing lists', () => {
    expect(summarizeNaverSessionCookies([])).toBe('total=0 NID_AUT=no NID_SES=no NID_JKL=no nid_inf=no');
    expect(summarizeNaverSessionCookies(undefined)).toContain('total=0');
  });
});

describe('describeNaverSessionCookies', () => {
  it('queries the three Naver origins explicitly (about:blank pages return 0 otherwise)', async () => {
    const calls: string[][] = [];
    const page = {
      cookies: async (...urls: string[]) => { calls.push(urls); return [{ name: 'NID_SES' }]; },
    };
    const summary = await describeNaverSessionCookies(page);
    expect(calls[0]).toEqual([...NAVER_COOKIE_PROBE_URLS]);
    expect(summary).toContain('NID_SES=yes');
  });

  it('never throws: missing page or cookie failure becomes a marker string', async () => {
    expect(await describeNaverSessionCookies(null)).toBe('cookies=unavailable');
    const failing = { cookies: async () => { throw new Error('detached'); } };
    expect(await describeNaverSessionCookies(failing)).toBe('cookies=error:detached');
  });
});

describe('session diagnostics avoid raw authentication URLs and cookies', () => {
  it('does not log obsolete login success or redirect URL/cookie bundles', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../naverBlogAutomation.ts'), 'utf8');
    expect(/\[LoginVerdict\]|\[WriteRedirect\]/.test(code)).toBe(false);
  });
  it('returns a bounded reason without raw URLs or transport error secrets', () => {
    const verdict = resolveServerSessionProbeVerdict({
      finalUrl: 'https://blog.naver.com/GoBlogWrite.naver?token=SECRET-TOKEN',
      error: 'network failed with cookie SECRET-COOKIE',
    });
    expect(verdict).toEqual({ status: 'unavailable', ok: false, reason: 'network-error' });
    expect(JSON.stringify(verdict)).not.toContain('SECRET');
  });
});

describe('browser disconnect diagnostics wiring', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../browserSessionManager.ts'), 'utf-8');

  it('records the Chrome process exit state when the disconnected event fires', () => {
    expect(code).toMatch(/browser\.on\('disconnected'[\s\S]{0,600}?exitCode/);
  });
});
