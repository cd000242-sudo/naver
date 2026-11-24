// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupSettingsAgentOverview, refreshSettingsAgentUsage, settingsAgentUsageText } from '../renderer/utils/settingsAgentOverview';
const fixture = readFileSync('public/index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

function mount() {
  document.documentElement.innerHTML = fixture;
  (window as any).api = { agentUsage: vi.fn().mockResolvedValue({ success: true, usage: { callsInWindow: 3 } }) };
  setupSettingsAgentOverview();
}

describe('settings agents and collapsed credentials', () => {
  it('moves existing agent controls to the top without losing values or handlers', () => {
    document.documentElement.innerHTML = fixture;
    const input = document.getElementById('agent-codex-model') as HTMLInputElement;
    input.value = 'custom-model';
    const handler = vi.fn(); input.addEventListener('change', handler);
    setupSettingsAgentOverview(); setupSettingsAgentOverview();
    expect(document.querySelector('.settings-content')?.firstElementChild?.id).toBe('settings-agent-overview');
    expect(document.querySelectorAll('#settings-agent-overview')).toHaveLength(1);
    for (const provider of ['codex','claude','gemini']) {
      expect(document.querySelector(`#settings-agent-overview input[value="agent-${provider}"]`)).not.toBeNull();
      expect(document.querySelector(`#settings-agent-overview #agent-${provider}-model`)).not.toBeNull();
    }
    expect(input.value).toBe('custom-model'); input.dispatchEvent(new Event('change'));
    expect(handler).toHaveBeenCalledOnce();
  });
  it('shows Claude Code first (the default writing engine) and keeps each usage box folded', () => {
    mount();
    const order = Array.from(document.querySelectorAll<HTMLInputElement>('#settings-agent-overview input[name="primaryGeminiTextModel"]')).map((input) => input.value);
    expect(order).toEqual(['agent-claude', 'agent-codex', 'agent-gemini']);
    for (const provider of ['codex', 'claude', 'gemini']) {
      const usage = document.getElementById(`settings-${provider}-usage`)!.closest('details');
      expect(usage, provider).not.toBeNull();
      expect(usage!.open, provider).toBe(false);
      expect(usage!.querySelector('summary')?.textContent, provider).toContain('사용량');
      // The account box stays on the main screen: it is the part people change.
      expect(document.querySelector(`[data-settings-agent-accounts="${provider}"]`)!.closest('details'), provider).toBeNull();
    }
  });
  it('collapses all API key cards while preserving their input nodes and values', () => {
    mount();
    for (const id of ['gemini-api-key','openai-api-key','claude-api-key','perplexity-api-key','naver-client-id','naver-hub-client-secret','naver-ad-api-key']) {
      const field = document.getElementById(id) as HTMLInputElement;
      expect(field).not.toBeNull();
      const details = field.closest('details');
      expect(details, id).not.toBeNull(); expect(details?.open, id).toBe(false);
      field.value = 'keep-test-value'; details!.open = true; details!.open = false;
      expect(field.value).toBe('keep-test-value');
    }
  });
  it('refreshes all providers regardless of the selected engine and exposes failures', async () => {
    mount();
    (window as any).api.agentUsage = vi.fn(async (provider) => {
      if (provider === 'claude') throw new Error('private-token-must-not-render');
      return { success: true, usage: { callsInWindow: provider === 'codex' ? 3 : 0 } };
    });
    await refreshSettingsAgentUsage();
    expect((window as any).api.agentUsage).toHaveBeenCalledTimes(3);
    expect(document.getElementById('settings-codex-usage')?.textContent).toContain('3회');
    expect(document.getElementById('settings-gemini-usage')?.textContent).toContain('0회');
    expect(document.getElementById('settings-claude-usage')?.textContent).toContain('조회 실패');
    expect(document.getElementById('settings-claude-usage')?.textContent).not.toContain('private-token');
  });
  it('does not pretend local history is the official remaining quota', () => {
    expect(settingsAgentUsageText({ callsInWindow: 4, observedLimit: 12 })).toContain('추정');
    expect(settingsAgentUsageText({ callsInWindow: 0 })).toContain('공식 잔여량');
    expect(settingsAgentUsageText({ callsInWindow: 2, manualLimit: 10 })).toContain('사용자 설정');
    expect(settingsAgentUsageText({ callsInWindow: 4, rateLimitResetAt: Date.now()+60000 })).toContain('한도 도달');
  });
  it('preserves the existing save action and opens the provider-specific official page', async () => {
    mount();
    const save = vi.fn(); document.getElementById('text-engine-save-btn')!.addEventListener('click', save);
    document.getElementById('settings-agent-save')!.click(); expect(save).toHaveBeenCalledOnce();
    const open = vi.fn().mockResolvedValue({ success: true }); (window as any).api.openExternalUrl = open;
    const container = document.getElementById('settings-claude-usage')!.parentElement!;
    container.querySelectorAll('button')[1].click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('https://claude.ai/settings/usage'));
    open.mockRejectedValue(new Error('private-error'));
    container.querySelectorAll('button')[1].click();
    await vi.waitFor(() => expect(container.textContent).toContain('열지 못했습니다'));
  });
  it('keeps the latest refresh when an earlier response arrives late', async () => {
    mount(); let finish!: (value: unknown) => void;
    (window as any).api.agentUsage = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ success: true, usage: { callsInWindow: 9 } });
    const old = refreshSettingsAgentUsage(['codex']);
    await refreshSettingsAgentUsage(['codex']);
    finish({ success: true, usage: { callsInWindow: 1 } }); await old;
    expect(document.getElementById('settings-codex-usage')!.textContent).toContain('9회');
  });
  it('handles missing bridge, malformed data, unknown reset and absent DOM', async () => {
    setupSettingsAgentOverview(); await refreshSettingsAgentUsage();
    mount(); (window as any).api = undefined; await refreshSettingsAgentUsage();
    expect(document.getElementById('settings-codex-usage')!.textContent).toContain('조회 실패');
    expect(settingsAgentUsageText({ callsInWindow: NaN })).toContain('확인할 수 없습니다');
    expect(settingsAgentUsageText({ callsInWindow: 3, rateLimitedAt: Date.now() })).toContain('시각 확인 필요');
    expect(settingsAgentUsageText({ callsInWindow: 20, observedLimit: 10 })).toContain('추정 0회');
  });
});
