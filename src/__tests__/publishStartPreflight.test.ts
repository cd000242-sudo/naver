// @vitest-environment happy-dom
/**
 * [2026-11-07] 연속발행·다중계정 '시작' 직전 연결 확인.
 * 고른 글 엔진(에이전트)과 이미지 엔진(codex-image)이 준비되지 않았으면 시작하지 않고,
 * "⚡ 연결하기 (설치 → 로그인 → 확인)" 한 버튼 안내를 띄운다. 연결 흐름은 기동 게이트와 같은 agentConnectRun.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  PUBLISH_PREFLIGHT_ID,
  publishPreflightEnsureReady,
  publishPreflightNeeds,
  publishPreflightProbe,
} from '../renderer/modules/publishStartPreflight';

const READY = { installed: true, loggedIn: true, available: true };
const NOT_INSTALLED = { installed: false, loggedIn: false, available: false };
const NEEDS_LOGIN = { installed: true, loggedIn: false, available: false };
const OLD_VERSION = { installed: true, loggedIn: false, available: false, errorCode: 'update_required' };
const RATE_LIMITED = { installed: true, loggedIn: true, available: false, errorCode: 'rate_limited' };

function makeApi(states: Record<string, any>, extra: Record<string, unknown> = {}) {
  return {
    agentStatus: vi.fn(async (provider: string) => ({ success: true, status: states[provider] })),
    agentInstall: vi.fn(async () => ({ success: true })),
    agentLogin: vi.fn(async () => ({ success: true, status: READY })),
    agentGenerate: vi.fn(async (payload: { prompt: string }) => ({
      success: true,
      text: payload.prompt.match(/BLN-[A-Za-z0-9]{6}/)?.[0] ?? '',
    })),
    onAgentInstallProgress: vi.fn(() => () => undefined),
    ...extra,
  } as any;
}

const modal = () => document.getElementById(PUBLISH_PREFLIGHT_ID);
const connectBtn = () => document.getElementById(`${PUBLISH_PREFLIGHT_ID}-connect`) as HTMLButtonElement | null;
const closeBtn = () => document.getElementById(`${PUBLISH_PREFLIGHT_ID}-close`) as HTMLButtonElement | null;
const logText = () => document.getElementById(`${PUBLISH_PREFLIGHT_ID}-log`)?.textContent || '';

beforeEach(() => { document.body.innerHTML = ''; });

describe('publishPreflightNeeds — 무엇을 확인해야 하나', () => {
  it('에이전트 글 엔진과 codex-image 는 각각 필요한 CLI 로 모인다', () => {
    expect(publishPreflightNeeds('agent-claude', ['codex-image'])).toEqual([
      { provider: 'claude', roles: ['text'] },
      { provider: 'codex', roles: ['image'] },
    ]);
  });

  it('같은 CLI 를 글과 이미지가 같이 쓰면 한 번만 확인한다', () => {
    expect(publishPreflightNeeds('agent-codex', ['codex-image', 'codex-image'])).toEqual([
      { provider: 'codex', roles: ['text', 'image'] },
    ]);
  });

  it('API 엔진·다른 이미지 엔진·빈 값은 확인할 것이 없다', () => {
    expect(publishPreflightNeeds('gemini-3.6-flash', ['openai-image', 'flow', 'skip', ''])).toEqual([]);
    expect(publishPreflightNeeds('', [])).toEqual([]);
  });

  it('API 글 엔진 + codex-image 는 Codex 만 확인한다', () => {
    expect(publishPreflightNeeds('openai-gpt41', ['codex-image'])).toEqual([{ provider: 'codex', roles: ['image'] }]);
  });
});

describe('publishPreflightProbe — 상태 확인', () => {
  it('forceRefresh 로 조회하고 준비된 것은 문제 목록에 넣지 않는다', async () => {
    const api = makeApi({ claude: READY, codex: NEEDS_LOGIN });
    const problems = await publishPreflightProbe(api, publishPreflightNeeds('agent-claude', ['codex-image']));
    expect(problems.map((p) => [p.need.provider, p.kind])).toEqual([['codex', 'login']]);
    expect(api.agentStatus).toHaveBeenCalledWith('claude', { forceRefresh: true });
    expect(api.agentStatus).toHaveBeenCalledWith('codex', { forceRefresh: true });
  });

  it('조회 실패·예외는 설치 필요가 아니라 확인 지연으로 본다', async () => {
    const api = makeApi({}, { agentStatus: vi.fn(async () => { throw new Error('ipc down'); }) });
    const problems = await publishPreflightProbe(api, publishPreflightNeeds('agent-claude', []));
    expect(problems.map((p) => p.kind)).toEqual(['delayed']);
  });
});

describe('publishPreflightEnsureReady — 시작 버튼 앞 확인', () => {
  it('모두 준비돼 있으면 true, 안내 창 없음', async () => {
    const api = makeApi({ claude: READY, codex: READY });
    await expect(publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: ['codex-image'] }, api)).resolves.toBe(true);
    expect(modal()).toBeNull();
  });

  it('확인할 엔진이 없으면 상태를 조회하지 않고 true', async () => {
    const api = makeApi({});
    await expect(publishPreflightEnsureReady({ generator: 'gemini-3.6-flash', imageSources: ['flow'] }, api)).resolves.toBe(true);
    expect(api.agentStatus).not.toHaveBeenCalled();
  });

  it('설치가 안 된 에이전트면 시작하지 않고(false) 짧은 안내와 ⚡ 연결하기 한 버튼을 띄운다', async () => {
    const api = makeApi({ claude: NOT_INSTALLED });
    await expect(publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api)).resolves.toBe(false);
    expect(modal()).not.toBeNull();
    expect(modal()!.textContent).toContain('Claude Code');
    expect(modal()!.textContent).toContain('설치 필요');
    expect(connectBtn()?.textContent).toBe('⚡ 연결하기 (설치 → 로그인 → 확인)');
    expect(api.agentInstall).not.toHaveBeenCalled(); // nothing happens until the user presses the button
  });

  it('글 엔진은 준비됐고 Codex 이미지만 로그인이 필요하면 이미지 줄만 보인다', async () => {
    const api = makeApi({ claude: READY, codex: NEEDS_LOGIN });
    await expect(publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: ['codex-image'] }, api)).resolves.toBe(false);
    const lines = Array.from(modal()!.querySelectorAll('[data-preflight-line]')).map((el) => el.textContent);
    expect(lines).toEqual(['이미지 · Codex — 로그인 필요']);
  });

  it('버전이 낮으면 "업데이트 필요" 로 보이고 같은 연결 버튼이 쓰인다', async () => {
    const api = makeApi({ claude: OLD_VERSION });
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api);
    expect(modal()!.textContent).toContain('업데이트 필요');
    expect(connectBtn()).not.toBeNull();
  });

  it('한도 소진·구독 만료처럼 연결로 못 고치는 문제는 연결 버튼 없이 사유만 보여 준다', async () => {
    const api = makeApi({ claude: RATE_LIMITED });
    await expect(publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api)).resolves.toBe(false);
    expect(modal()!.textContent).toContain('사용 불가');
    expect(connectBtn()).toBeNull();
    expect(closeBtn()).not.toBeNull();
  });

  it('상태 확인이 지연되면 시작하지 않고 잠시 후 다시 누르라고 안내한다 (설치 필요로 오판하지 않음)', async () => {
    const api = makeApi({}, { agentStatus: vi.fn(async () => ({ success: false })) });
    await expect(publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api)).resolves.toBe(false);
    expect(modal()!.textContent).toContain('확인 지연');
    expect(modal()!.textContent).not.toContain('설치 필요');
    expect(connectBtn()).toBeNull();
  });

  it('연결하기를 누르면 설치 → 확인까지 돌리고, 끝나면 시작 버튼을 다시 누르라고 알린다 (자동 시작 없음)', async () => {
    const states: Record<string, any> = { claude: NOT_INSTALLED };
    const api = makeApi(states, { agentInstall: vi.fn(async () => { states.claude = READY; return { success: true }; }) });
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api);
    connectBtn()!.click();
    await vi.waitFor(() => expect(logText()).toContain('연결 완료'));
    expect(api.agentInstall).toHaveBeenCalledWith('claude');
    expect(api.agentGenerate).toHaveBeenCalledTimes(1);
    expect(logText()).toContain('시작');
    expect(connectBtn()?.hidden).toBe(true);
    expect(modal()).not.toBeNull(); // the user closes it; the run is not started on its own
  });

  it('글 엔진과 이미지 엔진이 둘 다 필요하면 한 번 눌러 차례로 연결한다', async () => {
    const states: Record<string, any> = { claude: NEEDS_LOGIN, codex: NOT_INSTALLED };
    const api = makeApi(states, {
      agentLogin: vi.fn(async () => { states.claude = READY; return { success: true, status: READY }; }),
      agentInstall: vi.fn(async () => { states.codex = READY; return { success: true }; }),
    });
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: ['codex-image'] }, api);
    expect(modal()!.querySelectorAll('[data-preflight-line]').length).toBe(2);
    connectBtn()!.click();
    await vi.waitFor(() => expect(logText()).toContain('연결 완료'));
    expect(api.agentLogin).toHaveBeenCalledWith('claude');
    expect(api.agentInstall).toHaveBeenCalledWith('codex');
    expect(api.agentInstall).not.toHaveBeenCalledWith('claude');
  });

  it('연결이 실패하면 사유를 보여 주고 창과 버튼을 유지해 다시 시도할 수 있다 (몰래 다른 엔진으로 바꾸지 않음)', async () => {
    const api = makeApi({ claude: NOT_INSTALLED }, { agentInstall: vi.fn(async () => ({ success: false, message: '네트워크 오류로 보입니다' })) });
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api);
    connectBtn()!.click();
    await vi.waitFor(() => expect(logText()).toContain('네트워크 오류로 보입니다'));
    await vi.waitFor(() => expect(connectBtn()?.disabled).toBe(false));
    expect(connectBtn()?.hidden).toBe(false);
    expect(modal()).not.toBeNull();
  });

  it('닫기를 누르면 안내 창이 사라진다', async () => {
    const api = makeApi({ claude: NOT_INSTALLED });
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api);
    closeBtn()!.click();
    expect(modal()).toBeNull();
  });

  it('안내 창이 이미 떠 있으면 하나만 유지한다', async () => {
    const api = makeApi({ claude: NOT_INSTALLED });
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api);
    await publishPreflightEnsureReady({ generator: 'agent-claude', imageSources: [] }, api);
    expect(document.querySelectorAll(`#${PUBLISH_PREFLIGHT_ID}`).length).toBe(1);
  });
});

describe('배선 소스 핀', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf-8').replace(/\r\n/g, '\n');

  it('copy-static 인라인 순서: 연결 흐름 뒤, 연속발행·발행 핸들러 앞. 지문 클로저에 등록', () => {
    const copyStatic = read('scripts/copy-static.mjs');
    const at = (name: string) => copyStatic.indexOf(`'${name}.js'`);
    expect(at('publishStartPreflight')).toBeGreaterThan(at('agentConnectGate'));
    expect(at('publishStartPreflight')).toBeLessThan(at('continuousPublishing'));
    expect(at('publishStartPreflight')).toBeLessThan(at('publishingHandlers'));
    expect(read('src/contentQualityV3/candidateRuntimeFingerprint.ts')).toContain("'src/renderer/modules/publishStartPreflight.ts'");
  });

  it('연속발행과 다중계정 시작 지점이 이미지 가드보다 먼저 이 확인을 부른다', () => {
    const continuous = read('src/renderer/modules/continuousPublishing.ts');
    const start = continuous.indexOf('async function startContinuousPublishingV2');
    const preflight = continuous.indexOf('publishPreflightEnsureReady(', start);
    expect(preflight).toBeGreaterThan(start);
    expect(preflight).toBeLessThan(continuous.indexOf('runOpenAIImageGuard(guardImageSource)', start));
    expect(preflight).toBeLessThan(continuous.indexOf('setContinuousModeState(true);', start));

    const handlers = read('src/renderer/modules/publishingHandlers.ts');
    const multi = handlers.indexOf('export async function handleMultiAccountPublish');
    const multiPreflight = handlers.indexOf('publishPreflightEnsureReady(', multi);
    expect(multiPreflight).toBeGreaterThan(multi);
    expect(multiPreflight).toBeLessThan(handlers.indexOf('runOpenAIImageGuard(commonImageSource)', multi));
  });

  it('새 파일은 300줄 이하', () => {
    expect(read('src/renderer/modules/publishStartPreflight.ts').split('\n').length).toBeLessThanOrEqual(300);
  });
});
