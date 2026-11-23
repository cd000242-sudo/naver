// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSettingsAgentAccounts, refreshSettingsAgentAccounts } from '../renderer/utils/settingsAgentAccounts';
import { setupSettingsAgentOverview } from '../renderer/utils/settingsAgentOverview';
import { releasePipelineRun, tryAcquirePipelineRun } from '../renderer/utils/pipelineRunCoordinator';

const ID_A = 'acct-0123456789ab';
const usage = (callsInWindow = 0) => ({ callsInWindow });
const listing = (provider: string, accounts: unknown[], separable = true) => ({ success: true, listing: { provider, separable, accounts } });
const defaultAccount = (extra: object = {}) => ({ id: 'default', isDefault: true, active: true, state: 'ok', email: 'main@example.com', plan: 'Plus', usage: usage(2), ...extra });
const savedAccount = (extra: object = {}) => ({ id: ID_A, isDefault: false, active: false, state: 'ok', email: 'work@example.com', plan: 'Pro', usage: usage(0), ...extra });

let api: Record<string, any>;
let host: HTMLElement;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host') as HTMLElement;
  api = {
    agentAccountList: vi.fn().mockResolvedValue(listing('codex', [defaultAccount(), savedAccount()])),
    agentAccountSwitch: vi.fn().mockResolvedValue({ success: true }),
    agentAccountCreate: vi.fn().mockResolvedValue({ success: true, accountId: ID_A }),
    agentAccountRemove: vi.fn().mockResolvedValue({ success: true, removedActive: false }),
    agentLogin: vi.fn().mockResolvedValue({ success: true }),
    agentLogout: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as any).api = api;
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
});
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

async function mount(provider: 'codex' | 'claude' | 'gemini' = 'codex') {
  setupSettingsAgentAccounts(provider, host);
  await refreshSettingsAgentAccounts([provider]);
  return host.querySelector(`[data-settings-agent-accounts="${provider}"]`) as HTMLElement;
}
const radios = (box: HTMLElement) => Array.from(box.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
const button = (box: HTMLElement, text: string) => Array.from(box.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe('settings: saved agent accounts', () => {
  it('shows the account in use with its email and plan, plus the saved ones and this app\'s usage', async () => {
    const box = await mount();
    expect(radios(box).map((r) => [r.value, r.checked])).toEqual([['default', true], [ID_A, false]]);
    expect(box.textContent).toContain('기본 계정');
    expect(box.textContent).toContain('main@example.com');
    expect(box.textContent).toContain('Plus');
    expect(box.textContent).toContain('work@example.com');
    expect(box.textContent).toContain('2회');
  });

  it('says "확인 불가" instead of guessing when email or plan cannot be read', async () => {
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount({ state: 'unknown', email: undefined, plan: undefined })]));
    const box = await mount();
    expect(box.textContent).toContain('확인 불가');
  });

  it('shows a logged-out account as logged out', async () => {
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount({ state: 'not_logged_in', email: undefined, plan: undefined })]));
    expect((await mount()).textContent).toContain('로그인 안 됨');
  });

  it('switches immediately when another account is picked, and announces it', async () => {
    const box = await mount();
    const changed = vi.fn();
    window.addEventListener('agent-account-changed', changed);
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount({ active: false }), savedAccount({ active: true })]));
    const target = radios(box)[1];
    target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(api.agentAccountSwitch).toHaveBeenCalledWith('codex', ID_A);
    expect(changed).toHaveBeenCalledOnce();
    expect(radios(box)[1].checked).toBe(true);
    window.removeEventListener('agent-account-changed', changed);
  });

  it('keeps the previous account and explains when the switch fails', async () => {
    api.agentAccountSwitch.mockResolvedValue({ success: false, message: '계정을 바꾸지 못했습니다.' });
    const box = await mount();
    const target = radios(box)[1];
    target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(radios(box)[0].checked).toBe(true);
    expect(box.textContent).toContain('계정을 바꾸지 못했습니다.');
  });

  it('adds an account through the login window and switches to it right away when idle', async () => {
    const box = await mount();
    button(box, '계정 추가').click();
    await flush(); await flush();
    expect(api.agentAccountCreate).toHaveBeenCalledWith('codex');
    expect(api.agentLogin).toHaveBeenCalledWith('codex', { accountId: ID_A });
    expect(api.agentAccountSwitch).toHaveBeenCalledWith('codex', ID_A);
    expect(api.agentAccountRemove).not.toHaveBeenCalled();
    expect(api.agentAccountList.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps the current account while a generation or publishing run is going, and says so', async () => {
    const lease = tryAcquirePipelineRun('unified');
    try {
      const box = await mount();
      button(box, '계정 추가').click();
      await flush(); await flush();
      expect(api.agentAccountSwitch).not.toHaveBeenCalled();
      expect(api.agentAccountRemove).not.toHaveBeenCalled();
      expect(box.textContent).toContain('작업이 끝나면');
    } finally {
      releasePipelineRun(lease);
    }
  });

  it('cleans up the empty account when the login fails or is cancelled', async () => {
    api.agentLogin.mockResolvedValue({ success: false, message: '로그인이 취소되었습니다.' });
    const box = await mount();
    button(box, '계정 추가').click();
    await flush(); await flush();
    expect(api.agentAccountRemove).toHaveBeenCalledWith('codex', ID_A);
    expect(box.textContent).toContain('로그인이 취소되었습니다.');
    expect(api.agentAccountSwitch).not.toHaveBeenCalled();
  });

  it('removes the selected saved account only after confirmation, never the default', async () => {
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount({ active: false }), savedAccount({ active: true })]));
    const box = await mount();
    (confirm as any).mockReturnValueOnce(false);
    button(box, '계정 빼기').click(); await flush();
    expect(api.agentAccountRemove).not.toHaveBeenCalled();
    button(box, '계정 빼기').click(); await flush();
    expect(api.agentAccountRemove).toHaveBeenCalledWith('codex', ID_A);

    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount(), savedAccount()]));
    await refreshSettingsAgentAccounts(['codex']);
    expect(button(box, '계정 빼기').disabled).toBe(true);
  });

  it('Antigravity cannot keep several accounts: shows the current one and a re-login button', async () => {
    api.agentAccountList.mockResolvedValue(listing('gemini', [defaultAccount({ plan: undefined, email: 'g@example.com' })], false));
    const box = await mount('gemini');
    expect(radios(box)).toHaveLength(0);
    expect(box.textContent).toContain('g@example.com');
    expect(box.textContent).toContain('한 번에 한 계정');
    button(box, '다른 계정으로 로그인').click();
    await flush(); await flush();
    expect(api.agentLogout).toHaveBeenCalledWith('gemini');
    expect(api.agentLogin).toHaveBeenCalledWith('gemini');
  });

  it('survives a missing bridge and never renders raw error text', async () => {
    (window as any).api = undefined;
    const box = await mount();
    expect(box.textContent).toContain('확인 불가');
    (window as any).api = { agentAccountList: vi.fn().mockRejectedValue(new Error('private-token-must-not-render')) };
    await refreshSettingsAgentAccounts(['codex']);
    expect(box.textContent).not.toContain('private-token');
  });
});

describe('settings overview puts account controls inside each agent card', () => {
  it('adds an account area to Codex and Claude Code, and the single-login note to Antigravity', () => {
    document.documentElement.innerHTML = readFileSync('public/index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    (window as any).api = api;
    setupSettingsAgentOverview();
    for (const provider of ['codex', 'claude', 'gemini']) {
      expect(document.querySelectorAll(`#settings-agent-overview [data-settings-agent-accounts="${provider}"]`)).toHaveLength(1);
    }
  });
});
