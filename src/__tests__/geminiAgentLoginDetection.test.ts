/**
 * [v2.11.138] Gemini 에이전트 로그인 감지 회귀 잠금.
 *
 * 라이브 버그: 설치만 하고 OAuth 로그인을 한 적이 없는데 "로그인 확인됨"이
 * 떴다. 원인 — probeGeminiLogin이 process.env.GEMINI_API_KEY(앱이 콘텐츠
 * 생성용으로 설정)를 로그인 근거로 삼았는데, 에이전트 러너
 * (buildGeminiSubscriptionEnv)는 그 키를 STRIP해 OAuth 구독만 쓴다.
 * → 감지는 "됨"인데 실제 생성은 OAuth 없어 실패하는 false positive.
 * 수정: 감지를 OAuth creds 파일 존재로만 판정(러너와 일치).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: (...args: unknown[]) => existsSyncMock(...args) };
});

import { clearAgentDetectionCache, detectAgent } from '../agentCli/detect';

const originalKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  spawnMock.mockReset();
  existsSyncMock.mockReset();
  clearAgentDetectionCache('gemini');
  // gemini --version 성공 → 설치됨.
  spawnMock.mockResolvedValue({ code: 0, stdout: 'gemini 0.51.0', stderr: '' });
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  clearAgentDetectionCache('gemini');
});

describe('Gemini 에이전트 로그인 감지', () => {
  it('OAuth creds 없이 GEMINI_API_KEY만 있으면 로그인 아님 (false positive 회귀 잠금)', async () => {
    process.env.GEMINI_API_KEY = 'AIzaSy-content-gen-key';
    existsSyncMock.mockReturnValue(false); // ~/.gemini/oauth_creds.json 없음

    const status = await detectAgent('gemini', { forceRefresh: true });
    expect(status.installed).toBe(true);
    expect(status.loggedIn).toBe(false);
    expect(status.errorCode).toBe('not_logged_in');
  });

  it('OAuth creds 파일이 있으면 로그인됨 (구독 경로)', async () => {
    delete process.env.GEMINI_API_KEY;
    existsSyncMock.mockImplementation((p: string) => String(p).includes('oauth_creds.json'));

    const status = await detectAgent('gemini', { forceRefresh: true });
    expect(status.installed).toBe(true);
    expect(status.loggedIn).toBe(true);
  });

  it('감지 소스가 GEMINI_API_KEY를 로그인 근거로 쓰지 않는다', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../agentCli/detect.ts'),
      'utf-8',
    );
    const fn = src.slice(src.indexOf('async function probeGeminiLogin'), src.indexOf('async function probeGeminiLogin') + 600);
    expect(fn).not.toMatch(/GEMINI_API_KEY/);
    expect(fn).toContain('oauth_creds.json');
  });
});
