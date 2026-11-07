// @vitest-environment happy-dom
/**
 * Agent-first startup engine gate (split from startupEngineGate.test.ts to keep each file under 300 lines).
 * Pre-existing gate contracts stay in startupEngineGate.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../renderer/utils/settingsModal.js', () => ({
  restoreTextModelRadio: vi.fn((model: string) => {
    const radio = document.querySelector<HTMLInputElement>(
      `input[name="primaryGeminiTextModel"][value="${model}"]`,
    );
    if (radio) radio.checked = true;
  }),
}));

import {
  STARTUP_ENGINE_GATE_ID,
  showStartupEngineGate,
  initStartupEngineGate,
} from '../renderer/modules/startupEngineGate';

const card = (value: string, title: string, badge: string, desc: string, checked = false) => `
  <label class="gemini-model-card">
    <input type="radio" name="primaryGeminiTextModel" value="${value}" ${checked ? 'checked' : ''}>
    <div style="flex: 1;">
      <div><span>${title}</span><span>${badge}</span></div>
      <div>${desc}</div>
    </div>
  </label>`;

const flush = () => new Promise((r) => setTimeout(r, 0));
const overlay = () => document.getElementById(STARTUP_ENGINE_GATE_ID);
const confirmBtn = () =>
  document.getElementById(`${STARTUP_ENGINE_GATE_ID}-confirm`) as HTMLButtonElement | null;
const pick = (value: string) => {
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="startup-engine-choice"][value="${value}"]`,
  )!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
};

/**
 * [2026-11-03] 에이전트(구독 CLI)를 맨 위·미리 선택. 게이트는 그대로 매 기동 뜬다.
 * 준비 안 된 에이전트를 확정하면 창을 닫지 않고 그 자리에서 연결(설치→로그인→답 확인)을 돌린다.
 */
const READY = { installed: true, loggedIn: true, available: true };
const NOT_INSTALLED = { installed: false, loggedIn: false, available: false };
const NEEDS_LOGIN = { installed: true, loggedIn: false, available: false };

function mountAgentSettingsDom(): void {
  document.body.innerHTML = `
    <div id="settings">
      ${card('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', '저비용', '가장 싼 엔진', true)}
      ${card('agent-codex', 'Codex', '구독', 'Codex CLI 구독 엔진')}
      ${card('gemini-3.6-flash', 'Gemini 3.6 Flash', '추천', '균형형 엔진')}
      ${card('agent-claude', 'Claude Code', '구독', 'Claude 구독 엔진')}
      ${card('agent-gemini', 'Antigravity', '구독', 'Google 구독 엔진')}
      ${card('openai-gpt41', 'GPT-4.1', '', 'OpenAI 엔진')}
    </div>
    <input id="unified-generator" type="hidden" value="">
    <span id="nav-text-engine-status"></span>`;
}

function agentApi(states: Record<string, any>, extra: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn(async () => ({ primaryGeminiTextModel: '' })),
    saveConfig: vi.fn(async () => ({ success: true })),
    getAppInfo: vi.fn(async () => ({ isPackaged: true })),
    agentStatus: vi.fn(async (provider: string) => ({ success: true, status: states[provider] })),
    agentInstall: vi.fn(async () => ({ success: true })),
    agentLogin: vi.fn(async () => ({ success: true, status: READY })),
    agentGenerate: vi.fn(async (payload: { prompt: string }) => ({
      success: true,
      text: payload.prompt.match(/BLN-[A-Za-z0-9]{6}/)?.[0] ?? '',
    })),
    onAgentInstallProgress: vi.fn(() => () => undefined),
    ...extra,
  };
}

const chip = (value: string) => document.querySelector<HTMLElement>(`[data-engine-chip="${value}"]`)!;
const checkedValue = () =>
  document.querySelector<HTMLInputElement>('input[name="startup-engine-choice"]:checked')?.value;
const connectLog = () => document.getElementById(`${STARTUP_ENGINE_GATE_ID}-connect-log`)!;

describe('startupEngineGate — 에이전트 우선', () => {
  beforeEach(mountAgentSettingsDom);

  it('에이전트 카드가 맨 위, 나머지는 기존 순서', () => {
    (window as any).api = agentApi({ codex: READY, claude: READY, gemini: READY });
    void showStartupEngineGate('');
    const order = Array.from(document.querySelectorAll<HTMLElement>('[data-engine-option]')).map((el) => el.dataset.engineOption);
    expect(order).toEqual(['agent-codex', 'agent-claude', 'agent-gemini', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'openai-gpt41']);
  });

  it('저장값이 없으면 상태가 오기 전에도 Claude Code 가 미리 선택되고 확인은 활성', () => {
    (window as any).api = agentApi({ codex: READY });
    void showStartupEngineGate('');
    expect(checkedValue()).toBe('agent-claude'); // [2026-11-07] 기본 글 엔진 = Claude Code (카드 순서는 그대로)
    expect(confirmBtn()?.disabled).toBe(false);
    expect(chip('agent-claude').textContent).toBe('⏳ 확인 중');
  });

  it('칩이 상태별 문구로 채워지고 조회는 forceRefresh 없이 provider 별로 한 번씩 간다', async () => {
    const api = agentApi({ codex: NOT_INSTALLED, claude: NEEDS_LOGIN, gemini: { ...READY, available: false } });
    (window as any).api = api;
    void showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-gemini').textContent).toBe('사용 불가'));
    expect(chip('agent-codex').textContent).toBe('설치 필요');
    expect(chip('agent-claude').textContent).toBe('로그인 필요');
    expect(api.agentStatus.mock.calls).toEqual([['codex'], ['claude'], ['gemini']]);
  });

  it('Claude Code 가 준비 안 됐고 다른 에이전트가 준비됐으면 그쪽으로 미리 선택이 옮겨 간다', async () => {
    (window as any).api = agentApi({ codex: READY, claude: NEEDS_LOGIN, gemini: READY });
    void showStartupEngineGate('');
    await vi.waitFor(() => expect(checkedValue()).toBe('agent-codex'));
    expect(chip('agent-codex').textContent).toBe('준비됨');
    expect(confirmBtn()?.disabled).toBe(false);
  });

  it('모두 준비돼 있어도 Claude Code 가 그대로 선택돼 있다', async () => {
    (window as any).api = agentApi({ codex: READY, claude: READY, gemini: READY });
    void showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-gemini').textContent).toBe('준비됨'));
    expect(checkedValue()).toBe('agent-claude');
  });

  it('준비된 에이전트가 없으면 Claude Code 가 그대로 선택돼 있다', async () => {
    (window as any).api = agentApi({ codex: NOT_INSTALLED, claude: NEEDS_LOGIN, gemini: NOT_INSTALLED });
    void showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-gemini').textContent).toBe('설치 필요'));
    expect(checkedValue()).toBe('agent-claude');
  });

  it('저장값이 있으면 준비된 에이전트가 있어도 저장값을 바꾸지 않는다', async () => {
    (window as any).api = agentApi({ codex: READY, claude: READY, gemini: READY });
    void showStartupEngineGate('gemini-3.6-flash');
    expect(checkedValue()).toBe('gemini-3.6-flash');
    await vi.waitFor(() => expect(chip('agent-codex').textContent).toBe('준비됨'));
    expect(checkedValue()).toBe('gemini-3.6-flash');
  });

  it('사용자가 직접 고른 뒤 상태가 도착해도 선택을 덮어쓰지 않는다', async () => {
    const release: Array<() => void> = [];
    const api = agentApi({}, {
      agentStatus: vi.fn((provider: string) => new Promise((resolve) => {
        release.push(() => resolve({ success: true, status: provider === 'claude' ? READY : NEEDS_LOGIN }));
      })),
    });
    (window as any).api = api;
    void showStartupEngineGate('');
    pick('openai-gpt41');
    release.forEach((fn) => fn());
    await vi.waitFor(() => expect(chip('agent-claude').textContent).toBe('준비됨'));
    expect(checkedValue()).toBe('openai-gpt41');
  });

  it('준비된 에이전트는 연결 흐름 없이 바로 저장한다', async () => {
    const api = agentApi({ codex: READY, claude: READY, gemini: READY });
    (window as any).api = api;
    const done = showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-claude').textContent).toBe('준비됨'));
    confirmBtn()!.click();
    await expect(done).resolves.toBe('agent-claude');
    expect(api.saveConfig.mock.calls[0][0]).toMatchObject({ primaryGeminiTextModel: 'agent-claude', defaultAiProvider: 'agent-claude' });
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('비에이전트 엔진은 상태 조회 없이 지금처럼 바로 저장한다', async () => {
    const api = agentApi({ codex: NOT_INSTALLED, claude: NOT_INSTALLED, gemini: NOT_INSTALLED });
    (window as any).api = api;
    const done = showStartupEngineGate('');
    pick('gemini-3.6-flash');
    confirmBtn()!.click();
    await expect(done).resolves.toBe('gemini-3.6-flash');
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('준비 안 된 에이전트를 확정하면 창 안에서 연결 흐름을 돌리고, 성공하면 저장 후 닫는다', async () => {
    const states: Record<string, any> = { codex: NEEDS_LOGIN, claude: NOT_INSTALLED, gemini: NOT_INSTALLED };
    const api = agentApi(states, {
      agentInstall: vi.fn(async () => { states.claude = READY; return { success: true }; }),
    });
    (window as any).api = api;
    const done = showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-claude').textContent).toBe('설치 필요'));
    expect(checkedValue()).toBe('agent-claude');
    confirmBtn()!.click();
    await expect(done).resolves.toBe('agent-claude');
    expect(api.agentInstall).toHaveBeenCalledWith('claude');
    expect(api.agentGenerate).toHaveBeenCalledTimes(1);
    expect(api.saveConfig.mock.calls[0][0].primaryGeminiTextModel).toBe('agent-claude');
    expect(overlay()).toBeNull();
  });

  it('연결 중에는 선택과 확인이 잠기고, 진행 문구가 게이트 안에 보인다', async () => {
    let finishInstall!: () => void;
    const states: Record<string, any> = { codex: NOT_INSTALLED, claude: NOT_INSTALLED, gemini: NOT_INSTALLED };
    const api = agentApi(states, {
      agentInstall: vi.fn(() => new Promise((resolve) => {
        finishInstall = () => { states.claude = READY; resolve({ success: true }); };
      })),
    });
    (window as any).api = api;
    const done = showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-claude').textContent).toBe('설치 필요'));
    confirmBtn()!.click();
    await vi.waitFor(() => expect(connectLog().textContent).toContain('[2/4 설치]'));
    expect(confirmBtn()?.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="startup-engine-choice"][value="openai-gpt41"]')?.disabled).toBe(true);
    finishInstall();
    await expect(done).resolves.toBe('agent-claude');
  });

  it('연결이 실패하면 사유를 보여주고 창을 유지하며 다른 엔진을 고를 수 있다 (몰래 바꾸지 않음)', async () => {
    const api = agentApi(
      { codex: NOT_INSTALLED, claude: NOT_INSTALLED, gemini: NOT_INSTALLED },
      { agentInstall: vi.fn(async () => ({ success: false, message: '네트워크 오류로 보입니다' })) },
    );
    (window as any).api = api;
    const done = showStartupEngineGate('');
    await vi.waitFor(() => expect(chip('agent-claude').textContent).toBe('설치 필요'));
    confirmBtn()!.click();
    await vi.waitFor(() => expect(connectLog().textContent).toBe('❌ [2/4 설치]에서 멈춤: 네트워크 오류로 보입니다'));
    await vi.waitFor(() => expect(confirmBtn()?.disabled).toBe(false));
    expect(overlay()).not.toBeNull();
    expect(api.saveConfig).not.toHaveBeenCalled();
    expect(checkedValue()).toBe('agent-claude'); // the user's choice is never swapped silently
    expect(confirmBtn()?.textContent).toBe('이 엔진으로 시작');

    pick('openai-gpt41');
    confirmBtn()!.click();
    await expect(done).resolves.toBe('openai-gpt41');
    expect(api.saveConfig.mock.calls[0][0].defaultAiProvider).toBe('openai');
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  // [2026-11-03 review] Connect only for a missing install/login. A slow probe or a temporary quota
  // must not lock users out of their saved agent or re-run the paid answer check on every launch.
  it('상태 확인 중에 누르면 결과를 기다렸다가, 준비됨이면 연결 없이 저장한다', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const api = agentApi({ claude: READY, gemini: READY }, {
      agentStatus: vi.fn((provider: string) => provider === 'codex'
        ? new Promise((resolve) => { answer = resolve; })
        : Promise.resolve({ success: true, status: READY })),
    });
    (window as any).api = api;
    const done = showStartupEngineGate('agent-codex');
    confirmBtn()!.click();
    await flush();
    answer({ success: true, status: READY });
    await expect(done).resolves.toBe('agent-codex');
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it.each([
    ['확인 지연(조회 실패)', { success: false }],
    ['사용 불가(한도 소진)', { success: true, status: { ...READY, available: false, errorCode: 'rate_limited' } }],
  ])('%s 이면 연결 없이 저장된 선택을 그대로 쓴다', async (_label, codexStatus) => {
    const api = agentApi({ claude: READY, gemini: READY }, {
      agentStatus: vi.fn(async (provider: string) => provider === 'codex'
        ? codexStatus
        : { success: true, status: READY }),
    });
    (window as any).api = api;
    const done = showStartupEngineGate('agent-codex');
    confirmBtn()!.click();
    await expect(done).resolves.toBe('agent-codex');
    expect(api.agentInstall).not.toHaveBeenCalled();
    expect(api.agentLogin).not.toHaveBeenCalled();
    expect(api.agentGenerate).not.toHaveBeenCalled();
  });

  it('기동 진입점도 저장값이 없으면 Claude Code 를 미리 선택한 게이트를 띄운다', async () => {
    (window as any).api = agentApi({ codex: NEEDS_LOGIN, claude: NEEDS_LOGIN, gemini: NEEDS_LOGIN });
    const pending = initStartupEngineGate();
    await flush(); await flush();
    expect(overlay()).not.toBeNull();
    expect(checkedValue()).toBe('agent-claude');
    void pending;
  });
});
