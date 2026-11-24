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
const button = (box: HTMLElement, text: string) => Array.from(box.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const rows = (box: HTMLElement) => Array.from(box.querySelectorAll<HTMLElement>('[role="listitem"]'));
const rowButton = (row: HTMLElement, text: string) => Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
const inUse = (box: HTMLElement) => rows(box).map((row) => row.textContent?.includes('✓ 사용 중') === true);
const click = (target: HTMLElement | undefined) => { expect(target).toBeTruthy(); target!.click(); };

describe('settings: saved agent accounts', () => {
  it('lists the accounts as a plain list: one "✓ 사용 중" mark on the active row, a use button on the others', async () => {
    const box = await mount();
    const list = box.querySelector('[data-settings-agent-account-list]') as HTMLElement;
    expect(list.getAttribute('role')).toBe('list');
    expect(radios(box)).toHaveLength(0);
    expect(rows(box)).toHaveLength(2);
    expect(inUse(box)).toEqual([true, false]);
    expect(rows(box).map((row) => row.getAttribute('aria-current'))).toEqual(['true', null]);
    expect(rowButton(rows(box)[0], '이 계정 사용')).toBeUndefined();
    expect(rowButton(rows(box)[1], '이 계정 사용')).toBeTruthy();
    expect(Array.from(box.querySelectorAll('[data-settings-agent-account-active]')).every((node) => node.tagName !== 'BUTTON')).toBe(true);
  });

  it('shows the account in use with its email and plan, plus the saved ones and this app\'s usage', async () => {
    const box = await mount();
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

  it('does nothing when a row is merely clicked: only the use button switches', async () => {
    const box = await mount();
    rows(box)[1].click();
    await flush();
    expect(api.agentAccountSwitch).not.toHaveBeenCalled();
  });

  it('switches the clicked account only after "이 계정 사용", announces it, and moves the "✓ 사용 중" mark', async () => {
    const box = await mount();
    const changed = vi.fn();
    window.addEventListener('agent-account-changed', changed);
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount({ active: false }), savedAccount({ active: true })]));
    click(rowButton(rows(box)[1], '이 계정 사용'));
    await flush();
    expect(api.agentAccountSwitch).toHaveBeenCalledTimes(1);
    expect(api.agentAccountSwitch).toHaveBeenCalledWith('codex', ID_A);
    expect(changed).toHaveBeenCalledOnce();
    expect(inUse(box)).toEqual([false, true]);
    expect(rows(box).map((row) => row.getAttribute('aria-current'))).toEqual([null, 'true']);
    expect(rowButton(rows(box)[0], '이 계정 사용')).toBeTruthy();
    expect(box.textContent).toContain('계정을 바꿨습니다.');
    window.removeEventListener('agent-account-changed', changed);
  });

  it('locks every row button while a switch is running and ignores a second click', async () => {
    const box = await mount();
    let finish!: (value: unknown) => void;
    api.agentAccountSwitch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const use = rowButton(rows(box)[1], '이 계정 사용') as HTMLButtonElement;
    use.click();
    await flush();
    expect(Array.from(box.querySelectorAll('[role="listitem"] button')).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    use.click();
    expect(api.agentAccountSwitch).toHaveBeenCalledTimes(1);
    finish({ success: true });
    await flush();
    expect(Array.from(box.querySelectorAll('[role="listitem"] button')).some((b) => (b as HTMLButtonElement).disabled)).toBe(false);
  });

  it('keeps the previous account and explains when the switch fails', async () => {
    api.agentAccountSwitch.mockResolvedValue({ success: false, message: '계정을 바꾸지 못했습니다.' });
    const box = await mount();
    click(rowButton(rows(box)[1], '이 계정 사용'));
    await flush();
    expect(inUse(box)).toEqual([true, false]);
    expect(box.textContent).toContain('계정을 바꾸지 못했습니다.');
  });

  it('never shows an unsafe message from the main process when a switch fails', async () => {
    api.agentAccountSwitch.mockResolvedValue({ success: false, message: 'C:\\Users\\secret\\token=abc\nstack' });
    const box = await mount();
    click(rowButton(rows(box)[1], '이 계정 사용'));
    await flush();
    expect(box.textContent).toContain('계정을 바꾸지 못했습니다.');
    expect(box.textContent).not.toContain('secret');
  });

  it('ignores a late list answer that was overtaken by a newer one', async () => {
    const box = await mount();
    let late!: (value: unknown) => void;
    api.agentAccountList
      .mockReturnValueOnce(new Promise((resolve) => { late = resolve; }))
      .mockResolvedValueOnce(listing('codex', [defaultAccount({ active: false }), savedAccount({ active: true })]));
    const old = refreshSettingsAgentAccounts(['codex']);
    await refreshSettingsAgentAccounts(['codex']);
    late(listing('codex', [defaultAccount(), savedAccount()]));
    await old;
    expect(inUse(box)).toEqual([false, true]);
  });

  it('adds an account through the login window and switches to it right away when idle', async () => {
    const box = await mount();
    click(button(box, '계정 추가'));
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
      click(button(box, '계정 추가'));
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
    click(button(box, '계정 추가'));
    await flush(); await flush();
    expect(api.agentAccountRemove).toHaveBeenCalledWith('codex', ID_A);
    expect(box.textContent).toContain('로그인이 취소되었습니다.');
    expect(api.agentAccountSwitch).not.toHaveBeenCalled();
  });

  it('removes the account of the clicked row only after confirmation, and the default row has no remove button', async () => {
    const box = await mount();
    expect(rowButton(rows(box)[0], '빼기')).toBeUndefined();
    expect(button(box, '이 계정 빼기')).toBeUndefined();
    (confirm as any).mockReturnValueOnce(false);
    click(rowButton(rows(box)[1], '빼기')); await flush();
    expect(api.agentAccountRemove).not.toHaveBeenCalled();
    // The default account stays in use: the target is the clicked row, not the active one.
    click(rowButton(rows(box)[1], '빼기')); await flush();
    expect(api.agentAccountRemove).toHaveBeenCalledTimes(1);
    expect(api.agentAccountRemove).toHaveBeenCalledWith('codex', ID_A);
    expect(api.agentAccountSwitch).not.toHaveBeenCalled();
  });

  it('says the default account is back when the removed account was the one in use', async () => {
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount({ active: false }), savedAccount({ active: true })]));
    api.agentAccountRemove.mockResolvedValue({ success: true, removedActive: true });
    const box = await mount();
    const changed = vi.fn();
    window.addEventListener('agent-account-changed', changed);
    api.agentAccountList.mockResolvedValue(listing('codex', [defaultAccount()]));
    click(rowButton(rows(box)[1], '빼기')); await flush();
    expect(changed).toHaveBeenCalledOnce();
    expect(inUse(box)).toEqual([true]);
    expect(box.textContent).toContain('기본 계정으로 돌아갑니다');
    window.removeEventListener('agent-account-changed', changed);
  });

  it('Antigravity cannot keep several accounts: shows the current one and a re-login button', async () => {
    api.agentAccountList.mockResolvedValue(listing('gemini', [defaultAccount({ plan: undefined, email: 'g@example.com' })], false));
    const box = await mount('gemini');
    expect(radios(box)).toHaveLength(0);
    expect(rows(box)).toHaveLength(0);
    expect(box.querySelector('[data-settings-agent-account-list]')?.getAttribute('role')).toBe('group');
    expect(box.textContent).not.toContain('사용 중');
    expect(button(box, '이 계정 사용')).toBeUndefined();
    expect(button(box, '빼기')).toBeUndefined();
    expect(box.textContent).toContain('g@example.com');
    expect(box.textContent).toContain('한 번에 한 계정');
    click(button(box, '다른 계정으로 로그인'));
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

  it('hides the old "계정 전환" button for good once the card has its account box, without removing it', async () => {
    document.documentElement.innerHTML = readFileSync('public/index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    (window as any).api = api;
    const handler = vi.fn();
    for (const provider of ['codex', 'claude', 'gemini']) document.getElementById(`agent-${provider}-switch-btn`)!.addEventListener('click', handler);
    setupSettingsAgentOverview();
    for (const provider of ['codex', 'claude', 'gemini']) {
      const old = document.getElementById(`agent-${provider}-switch-btn`) as HTMLElement;
      expect(old, provider).not.toBeNull();
      expect(getComputedStyle(old).display, provider).toBe('none');
      // The status refresh shows it again for a logged-in agent: it must stay hidden anyway.
      old.style.display = 'inline-block';
      await flush();
      expect(getComputedStyle(old).display, provider).toBe('none');
      old.style.cssText = 'display: flex;';
      await flush();
      expect(getComputedStyle(old).display, provider).toBe('none');
      old.click();
    }
    expect(handler).toHaveBeenCalledTimes(3);
    setupSettingsAgentOverview();
    const rule = document.querySelector('style[data-settings-agent-acct-legacy-style]');
    expect(document.querySelectorAll('style[data-settings-agent-acct-legacy-style]')).toHaveLength(1);
    // The engine ranks an !important stylesheet rule above inline display, so the rule must name this button.
    expect(rule?.textContent).toMatch(/display:\s*none\s*!important/);
    expect(document.getElementById('agent-claude-switch-btn')!.matches('[data-settings-agent-acct-legacy]')).toBe(true);
  });

  it('leaves the old button alone when no account box was made for its card', () => {
    document.body.innerHTML = '<div id="host"></div><button id="agent-codex-switch-btn" style="display:none">전환</button>';
    setupSettingsAgentAccounts('claude', document.getElementById('host') as HTMLElement);
    const old = document.getElementById('agent-codex-switch-btn') as HTMLElement;
    old.style.display = 'inline-block';
    expect(getComputedStyle(old).display).toBe('inline-block');
  });
});
