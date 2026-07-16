import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  assertContentGeneratorProviderAllowed,
  getDisabledAgentStatus,
  resolveAgentProviderPolicy,
} from '../agentCli/productPolicy';
import {
  resolvePersistedTextModelConfig,
  resolveTextModelSelection,
} from '../renderer/utils/agentProductPolicyUi';

const readSource = (...segments: string[]): string => readFileSync(
  resolve(process.cwd(), ...segments),
  'utf8',
);

describe('packaged Claude Code enablement regression', () => {
  it('keeps Claude Code enabled at every product-policy boundary', () => {
    expect(resolveAgentProviderPolicy('claude').enabled).toBe(true);
    expect(resolveAgentProviderPolicy('claude', { allowClaudeSubscription: false }).enabled).toBe(true);
    expect(() => assertContentGeneratorProviderAllowed('agent-claude')).not.toThrow();
    expect(getDisabledAgentStatus('claude')).toBeUndefined();
  });

  it('preserves a saved Claude Code subscription selection without API-key fallback', () => {
    expect(resolveTextModelSelection('agent-claude', '', true)).toEqual({
      model: 'agent-claude',
      provider: 'agent-claude',
    });

    const config = Object.freeze({
      primaryGeminiTextModel: 'agent-claude',
      defaultAiProvider: 'agent-claude',
    });
    const result = resolvePersistedTextModelConfig(config, true);
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
  });

  it('ships an enabled Claude Code card and no packaged-app disabled copy', () => {
    const html = readSource('public', 'index.html');
    const cardStart = html.indexOf('id="agent-claude-card"');
    const cardEnd = html.indexOf('id="agent-claude-actions"', cardStart);
    const card = html.slice(cardStart, cardEnd);

    expect(cardStart).toBeGreaterThanOrEqual(0);
    expect(card).not.toContain('aria-disabled="true"');
    expect(card).not.toMatch(/value="agent-claude"[^>]*\sdisabled(?:\s|>)/);
    expect(card).toContain('별도 API 키 불필요');
    expect(html).not.toContain('배포 앱 비활성');
    expect(html).not.toContain('배포 앱에서는 Claude 구독 로그인을 제공하지 않습니다');
  });

  it('does not derive Claude availability from Electron packaging state', () => {
    const main = readSource('src', 'main.ts');
    const settings = readSource('src', 'renderer', 'utils', 'settingsModal.ts');
    const priceModal = readSource('src', 'renderer', 'modules', 'priceInfoModal.ts');

    expect(main).not.toContain('allowClaudeSubscription: !app.isPackaged');
    expect(main.match(/allowClaudeSubscription:\s*true/g) ?? []).toHaveLength(2);
    expect(settings).not.toContain('isClaudeSubscriptionDisabled');
    expect(priceModal).not.toContain('let claudeSubscriptionDisabled = true');
    expect(priceModal).not.toContain('배포 앱 비활성');
  });
});
