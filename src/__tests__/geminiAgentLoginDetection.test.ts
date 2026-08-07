/**
 * [v2.11.138] Gemini 에이전트 로그인 감지 회귀 잠금.
 *
 * 라이브 버그: 설치만 하고 로그인을 한 적이 없는데 "로그인 확인됨"이 떴다.
 * 원인 — 로그인 판정이 process.env.GEMINI_API_KEY(앱이 콘텐츠 생성용으로 설정)를
 * 근거로 삼았는데, 에이전트 러너(buildGeminiSubscriptionEnv)는 그 키를 STRIP한다.
 * → 감지는 "됨"인데 실제 생성은 실패하는 false positive.
 *
 * [v2.11.145] 판정 수단만 교체. 구글이 2026-06-18부로 개인 계정의 Gemini CLI 요청을
 * 중단해 provider가 agy(Antigravity CLI)로 이관됐고, agy는 자격증명을 OS 키링에 두어
 * stat할 파일(oauth_creds.json)이 존재하지 않는다. 판정은 `agy models`(생성 할당량을
 * 쓰지 않으면서 같은 auth 체인을 타는 최저비용 명령)로 바뀌었다.
 * 위 v2.11.138의 방어 의도 자체는 그대로 유지된다 — API 키는 여전히 로그인 근거가 아니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { clearAgentDetectionCache, detectAgent } from '../agentCli/detect';

const originalKey = process.env.GEMINI_API_KEY;

/** agy --version은 항상 성공(설치됨)시키고, models 응답만 테스트별로 바꾼다. */
function mockAgy(modelsResult: { code: number; stdout: string; stderr: string }): void {
  spawnMock.mockImplementation((opts: { args?: string[] }) => {
    const args = opts?.args ?? [];
    if (args.includes('--version')) {
      return Promise.resolve({ code: 0, stdout: '1.1.5', stderr: '' });
    }
    if (args.includes('models')) return Promise.resolve(modelsResult);
    return Promise.resolve({ code: 0, stdout: '', stderr: '' });
  });
}

beforeEach(() => {
  spawnMock.mockReset();
  clearAgentDetectionCache('gemini');
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  clearAgentDetectionCache('gemini');
});

describe('Gemini(agy) 에이전트 로그인 감지', () => {
  it('인증 실패 상태에서 GEMINI_API_KEY만 있으면 로그인 아님 (false positive 회귀 잠금)', async () => {
    process.env.GEMINI_API_KEY = 'AIzaSy-content-gen-key';
    mockAgy({ code: 1, stdout: '', stderr: 'not authenticated' });

    const status = await detectAgent('gemini', { forceRefresh: true });
    expect(status.installed).toBe(true);
    expect(status.loggedIn).toBe(false);
    expect(status.errorCode).toBe('not_logged_in');
  });

  it('models 목록이 비어 있으면 로그인 아님 (exit 0이어도 근거로 인정하지 않음)', async () => {
    process.env.GEMINI_API_KEY = 'AIzaSy-content-gen-key';
    mockAgy({ code: 0, stdout: '   \n  \n', stderr: '' });

    const status = await detectAgent('gemini', { forceRefresh: true });
    expect(status.loggedIn).toBe(false);
    expect(status.errorCode).toBe('not_logged_in');
  });

  it('models 목록이 반환되면 로그인됨 (구독 경로)', async () => {
    delete process.env.GEMINI_API_KEY;
    mockAgy({
      code: 0,
      stdout: 'gemini-3.6-flash-high\ngemini-3.1-pro-high\nclaude-sonnet-4-6\n',
      stderr: '',
    });

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
    const start = src.indexOf('async function probeAgyLogin');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, start + 900);
    expect(fn).not.toMatch(/GEMINI_API_KEY/);
    // 죽은 판정 수단으로의 회귀 차단: 키링 기반이라 stat할 creds 파일이 없다.
    expect(fn).not.toMatch(/oauth_creds\.json/);
  });
});
