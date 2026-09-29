import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
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

describe('login diagnostics wiring in naverBlogAutomation', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../naverBlogAutomation.ts'), 'utf-8');

  it('logs URL + cookie summary right after every "로그인이 성공적으로 완료" verdict', () => {
    const hits = code.split('✅ 네이버 로그인이 성공적으로 완료되었습니다.').length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
    const wired = code.match(/로그인이 성공적으로 완료되었습니다\.'\);\s*\n\s*this\.log\(`\s*\[LoginVerdict\] url=/g) || [];
    expect(wired.length).toBe(hits);
  });

  it('logs the cookie summary when the write editor bounces to the login page', () => {
    expect(code).toMatch(/로그인 페이지로 리다이렉트됨\. 로그인 세션이 만료되었습니다\.`\);\s*\n\s*this\.log\(`\s*\[WriteRedirect\] cookies=/);
  });
});

describe('browser disconnect diagnostics wiring', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../browserSessionManager.ts'), 'utf-8');

  it('records the Chrome process exit state when the disconnected event fires', () => {
    expect(code).toMatch(/browser\.on\('disconnected'[\s\S]{0,600}?exitCode/);
  });
});
