import { afterEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock('../renderer/utils/uiManagers', () => ({
  toastManager: {
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
  },
}));

vi.mock('../renderer/utils/geminiPlanMemo', () => ({ rememberPlan: vi.fn() }));
vi.mock('../runtime/modelRegistry', () => ({
  normalizeGeminiTextModelId: (value: string) => value,
}));

import { refreshAgentStatusBadges } from '../renderer/modules/priceInfoModal';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

interface FakeElement {
  textContent: string;
  disabled: boolean;
  onclick: ((event: { preventDefault(): void; stopPropagation(): void }) => Promise<void>) | null;
  style: { display: string; color: string };
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return Object.freeze({ promise, resolve });
}

function fakeElement(): FakeElement {
  return {
    textContent: '',
    disabled: false,
    onclick: null,
    style: { display: '', color: '' },
  };
}

function installFakeDom(agentStatus: ReturnType<typeof vi.fn>): Map<string, FakeElement> {
  const elements = new Map<string, FakeElement>([
    ['agent-codex-status', fakeElement()],
    ['agent-codex-actions', fakeElement()],
    ['agent-codex-install-btn', fakeElement()],
    ['agent-codex-login-btn', fakeElement()],
    ['agent-codex-switch-btn', fakeElement()],
  ]);

  vi.stubGlobal('document', {
    getElementById: (id: string) => elements.get(id) ?? null,
  });
  vi.stubGlobal('window', { api: { agentStatus } });
  return elements;
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
});

describe('agent status badge refresh ordering', () => {
  it('never renders multiline internal logs from a legacy version field', async () => {
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: {
        provider: 'codex',
        installed: true,
        loggedIn: false,
        available: false,
        errorCode: 'not_logged_in',
        version: '[Startup-Async] exposurePoller\nhttps://alice:secret@example.test/?token=secret',
      },
    });
    const elements = installFakeDom(agentStatus);

    await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });

    const rendered = elements.get('agent-codex-status')?.textContent || '';
    expect(rendered).toContain('Codex CLI');
    expect(rendered).not.toContain('Startup-Async');
    expect(rendered).not.toContain('secret');
    expect(rendered).not.toContain('\n');
  });

  it('renders an uninstalled Claude Code CLI with install action and an enabled selector', async () => {
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: {
        provider: 'claude',
        installed: false,
        loggedIn: false,
        available: false,
        errorCode: 'not_installed',
      },
    });
    const elements = new Map<string, FakeElement>([
      ['agent-claude-status', fakeElement()],
      ['agent-claude-actions', fakeElement()],
      ['agent-claude-install-btn', fakeElement()],
      ['agent-claude-login-btn', fakeElement()],
      ['agent-claude-switch-btn', fakeElement()],
    ]);
    const cardAttributes = new Map<string, string>();
    const card = Object.assign(fakeElement(), {
      setAttribute: (name: string, value: string) => cardAttributes.set(name, value),
      removeAttribute: (name: string) => cardAttributes.delete(name),
    });
    const agentRadio = Object.assign(fakeElement(), {
      value: 'agent-claude',
      checked: true,
      disabled: false,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      closest: () => card,
    });
    const claudeFallback = Object.assign(fakeElement(), {
      value: 'claude-haiku',
      checked: false,
    });
    const claudeApiKey = Object.assign(fakeElement(), { value: 'sk-ant-api-key' });
    const unifiedGenerator = Object.assign(fakeElement(), { value: 'agent-claude' });
    vi.stubGlobal('document', {
      getElementById: (id: string) => elements.get(id) ?? null,
      querySelector: (selector: string) => ({
        'input[name="primaryGeminiTextModel"][value="agent-claude"]': agentRadio,
        'input[name="primaryGeminiTextModel"][value="claude-haiku"]': claudeFallback,
      } as Record<string, unknown>)[selector] ?? null,
    });
    elements.set('claude-api-key', claudeApiKey);
    elements.set('unified-generator', unifiedGenerator);
    vi.stubGlobal('window', { api: { agentStatus } });

    await refreshAgentStatusBadges({ providers: ['claude'], forceRefresh: true });

    expect(elements.get('agent-claude-status')?.textContent).toContain('미설치');
    expect(elements.get('agent-claude-actions')?.style.display).toBe('flex');
    expect(elements.get('agent-claude-install-btn')?.style.display).toBe('inline-block');
    expect(elements.get('agent-claude-login-btn')?.style.display).toBe('none');
    expect(elements.get('agent-claude-switch-btn')?.style.display).toBe('none');
    expect(agentRadio.disabled).toBe(false);
    expect(agentRadio.checked).toBe(true);
    expect(claudeFallback.checked).toBe(false);
    expect(cardAttributes.has('aria-disabled')).toBe(false);
    expect(unifiedGenerator.value).toBe('agent-claude');
  });

  it('re-enables the Claude subscription selector when development status allows it', async () => {
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: {
        provider: 'claude',
        installed: true,
        loggedIn: true,
        available: true,
      },
    });
    const elements = new Map<string, FakeElement>([
      ['agent-claude-status', fakeElement()],
      ['agent-claude-actions', fakeElement()],
      ['agent-claude-install-btn', fakeElement()],
      ['agent-claude-login-btn', fakeElement()],
      ['agent-claude-switch-btn', fakeElement()],
    ]);
    const cardAttributes = new Map<string, string>([['aria-disabled', 'true']]);
    const card = Object.assign(fakeElement(), {
      setAttribute: (name: string, value: string) => cardAttributes.set(name, value),
      removeAttribute: (name: string) => cardAttributes.delete(name),
    });
    const agentRadio = Object.assign(fakeElement(), {
      disabled: true,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      closest: () => card,
    });
    vi.stubGlobal('document', {
      getElementById: (id: string) => elements.get(id) ?? null,
      querySelector: (selector: string) => selector.includes('agent-claude') ? agentRadio : null,
    });
    vi.stubGlobal('window', { api: { agentStatus } });

    await refreshAgentStatusBadges({ providers: ['claude'], forceRefresh: true });

    expect(agentRadio.disabled).toBe(false);
    expect(agentRadio.removeAttribute).toHaveBeenCalledWith('aria-disabled');
    expect(cardAttributes.has('aria-disabled')).toBe(false);
  });

  it('does not let a stale logged-out response replace a newer verified login', async () => {
    const stale = deferred<any>();
    const current = deferred<any>();
    const agentStatus = vi.fn()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise);
    const elements = installFakeDom(agentStatus);

    const staleRefresh = refreshAgentStatusBadges({ providers: ['codex'] });
    const currentRefresh = refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });

    current.resolve({
      success: true,
      status: {
        installed: true,
        version: '0.141.0',
        loggedIn: true,
        available: true,
        detail: 'Logged in using ChatGPT',
      },
    });
    await currentRefresh;

    stale.resolve({
      success: true,
      status: {
        installed: true,
        version: '0.141.0',
        loggedIn: false,
        available: false,
        errorCode: 'not_logged_in',
      },
    });
    await staleRefresh;

    expect(agentStatus).toHaveBeenNthCalledWith(1, 'codex', { forceRefresh: false });
    expect(agentStatus).toHaveBeenNthCalledWith(2, 'codex', { forceRefresh: true });
    expect(elements.get('agent-codex-status')?.textContent).toContain('\uC900\uBE44\uB428');
    expect(elements.get('agent-codex-login-btn')?.style.display).toBe('none');
    expect(elements.get('agent-codex-switch-btn')?.style.display).toBe('inline-block');
  });

  it.each(['codex', 'claude'] as const)(
    'never shows the ordinary login button for authenticated-but-unavailable %s status',
    async (provider) => {
      const prefix = `agent-${provider}`;
      const agentStatus = vi.fn().mockResolvedValue({
        success: true,
        status: {
          installed: true,
          version: 'test-version',
          loggedIn: true,
          available: false,
          errorCode: 'subscription_inactive',
          detail: 'The current subscription is not usable.',
        },
      });
      const elements = new Map<string, FakeElement>([
        [`${prefix}-status`, fakeElement()],
        [`${prefix}-actions`, fakeElement()],
        [`${prefix}-install-btn`, fakeElement()],
        [`${prefix}-login-btn`, fakeElement()],
        [`${prefix}-switch-btn`, fakeElement()],
      ]);
      vi.stubGlobal('document', {
        getElementById: (id: string) => elements.get(id) ?? null,
      });
      vi.stubGlobal('window', { api: { agentStatus } });

      await refreshAgentStatusBadges({ providers: [provider], forceRefresh: true });

      expect(elements.get(`${prefix}-login-btn`)?.style.display).toBe('none');
      expect(elements.get(`${prefix}-switch-btn`)?.style.display).toBe('inline-block');
      expect(elements.get(`${prefix}-status`)?.textContent.toLowerCase()).toContain(provider);
    },
  );

  it('labels Codex authentication-only status without claiming live readiness', async () => {
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: {
        installed: true,
        version: '0.144.1',
        loggedIn: true,
        available: true,
        availabilityCheck: 'authentication',
        detail: 'Logged in using ChatGPT',
      },
    });
    const elements = installFakeDom(agentStatus);

    await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });

    expect(elements.get('agent-codex-status')?.textContent).toContain('로그인 확인됨');
    expect(elements.get('agent-codex-status')?.textContent).not.toContain('준비됨');
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('로그인 자동 인식'));

    await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('uses the verified post-login cache and reports authenticated-but-unavailable honestly', async () => {
    const unavailableStatus = {
      installed: true,
      version: '0.141.0',
      loggedIn: true,
      available: false,
      errorCode: 'rate_limited',
      detail: '5-hour usage limit reached',
    };
    const agentStatus = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        status: {
          installed: true,
          version: '0.141.0',
          loggedIn: false,
          available: false,
          errorCode: 'not_logged_in',
        },
      })
      .mockResolvedValueOnce({ success: true, status: unavailableStatus });
    const agentLogin = vi.fn().mockResolvedValue({ success: true, status: unavailableStatus });
    const elements = installFakeDom(agentStatus);
    (window as any).api.agentLogin = agentLogin;

    await refreshAgentStatusBadges({ providers: ['codex'] });
    const loginButton = elements.get('agent-codex-login-btn')!;

    await loginButton.onclick!({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(agentLogin).toHaveBeenCalledWith('codex');
    expect(agentStatus).toHaveBeenNthCalledWith(2, 'codex', { forceRefresh: false });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledOnce();
    expect(loginButton.style.display).toBe('none');
  });
});
