import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  resolvePersistedTextModelConfig,
  resolveTextModelSelection,
} from '../renderer/utils/agentProductPolicyUi';

describe('agent product-policy UI selection', () => {
  it('preserves agent-claude in packaged mode when a Claude API key also exists', () => {
    expect(resolveTextModelSelection('agent-claude', 'sk-ant-api-key', true)).toEqual({
      model: 'agent-claude',
      provider: 'agent-claude',
    });
  });

  it('preserves agent-claude in packaged mode without a Claude API key', () => {
    expect(resolveTextModelSelection('agent-claude', '', true)).toEqual({
      model: 'agent-claude',
      provider: 'agent-claude',
    });
  });

  it('does not rewrite a persisted Claude Code subscription route', () => {
    const saved = Object.freeze({
      primaryGeminiTextModel: 'agent-claude',
      defaultAiProvider: 'agent-claude',
      claudeApiKey: 'sk-ant-api-key',
      unrelated: 'preserved',
    });

    const migration = resolvePersistedTextModelConfig(saved, true);

    expect(migration).toMatchObject({
      changed: false,
      selection: { model: 'agent-claude', provider: 'agent-claude' },
      config: {
        primaryGeminiTextModel: 'agent-claude',
        defaultAiProvider: 'agent-claude',
        unrelated: 'preserved',
      },
    });
    expect(migration.config).toBe(saved);
    expect(saved.primaryGeminiTextModel).toBe('agent-claude');
    expect(Object.isFrozen(migration)).toBe(true);
    expect(Object.isFrozen(migration.config)).toBe(true);
  });

  it('does not rewrite an allowed development Claude subscription route', () => {
    const config = Object.freeze({
      primaryGeminiTextModel: 'agent-claude',
      defaultAiProvider: 'agent-claude',
      claudeApiKey: '',
    });

    const migration = resolvePersistedTextModelConfig(config, false);

    expect(migration.changed).toBe(false);
    expect(migration.config).toBe(config);
    expect(migration.selection).toEqual({
      model: 'agent-claude',
      provider: 'agent-claude',
    });
  });

  it('repairs a mismatched provider without replacing the persisted primary model', () => {
    const config = Object.freeze({
      primaryGeminiTextModel: 'gemini-3.5-flash',
      defaultAiProvider: 'agent-claude',
      claudeApiKey: 'sk-ant-api-key',
    });

    const migration = resolvePersistedTextModelConfig(config, true);

    expect(migration).toMatchObject({
      changed: true,
      selection: { model: 'gemini-3.5-flash', provider: 'gemini' },
      config: {
        primaryGeminiTextModel: 'gemini-3.5-flash',
        defaultAiProvider: 'gemini',
      },
    });
  });

  it('atomically repairs any persisted model/provider mismatch in packaged mode', () => {
    const config = Object.freeze({
      primaryGeminiTextModel: 'claude-haiku',
      defaultAiProvider: 'gemini',
      claudeApiKey: 'sk-ant-api-key',
    });

    const migration = resolvePersistedTextModelConfig(config, true);

    expect(migration).toMatchObject({
      changed: true,
      selection: { model: 'claude-haiku', provider: 'claude' },
      config: {
        primaryGeminiTextModel: 'claude-haiku',
        defaultAiProvider: 'claude',
      },
    });
  });

  it.each([
    ['agent-claude', '', false, 'agent-claude', 'agent-claude'],
    ['agent-codex', '', true, 'agent-codex', 'agent-codex'],
    ['claude-sonnet', 'key', true, 'claude-sonnet', 'claude'],
    ['openai-gpt41', '', true, 'openai-gpt41', 'openai'],
    ['perplexity-sonar', '', true, 'perplexity-sonar', 'perplexity'],
    ['gemini-3.5-flash', '', true, 'gemini-3.5-flash', 'gemini'],
  ] as const)('preserves safe selection %s', (
    selected,
    key,
    disabled,
    expectedModel,
    expectedProvider,
  ) => {
    expect(resolveTextModelSelection(selected, key, disabled)).toEqual({
      model: expectedModel,
      provider: expectedProvider,
    });
  });

  it('uses the normalized selection for both saved model and provider', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'renderer', 'modules', 'priceInfoModal.ts'),
      'utf8',
    );
    expect(source).toContain('primaryGeminiTextModel: safeTextSelection.model');
    expect(source).toContain('defaultAiProvider: safeTextSelection.provider');
  });

  it('normalizes model/provider consistency on every settings load/save surface', () => {
    const settingsModal = readFileSync(
      resolve(process.cwd(), 'src', 'renderer', 'utils', 'settingsModal.ts'),
      'utf8',
    );
    const priceInfoModal = readFileSync(
      resolve(process.cwd(), 'src', 'renderer', 'modules', 'priceInfoModal.ts'),
      'utf8',
    );

    expect(settingsModal).toContain('resolvePersistedTextModelConfig(');
    expect(settingsModal).toContain('await api.saveConfig(persistedTextModel.config)');
    expect(settingsModal).toContain('primaryGeminiTextModel: safeTextSelection.model');
    expect(settingsModal).toContain('defaultAiProvider: safeTextSelection.provider');
    expect(priceInfoModal).toContain('resolvePersistedTextModelConfig(');
    expect(priceInfoModal).toContain('await settingsApi.saveConfig(persistedTextModel.config)');
  });

  it('describes subscription routing without zero-cost or unlimited claims', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'public', 'index.html'),
      'utf8',
    );
    const renderer = readFileSync(
      resolve(process.cwd(), 'src', 'renderer', 'modules', 'priceInfoModal.ts'),
      'utf8',
    );

    for (const forbidden of [
      '에이전트 모드 (API 과금 ₩0)',
      'GPT Plus 또는 Claude Plus',
      'codex / claude 구독을 연동',
      '글은 구독으로 무료',
      '구독으로 무료 (사용량 과금 0)',
      '본인 구독 한도 내 무료',
    ]) {
      expect(html).not.toContain(forbidden);
    }

    expect(html).toContain('ChatGPT 플랜 한도·크레딧');
    expect(html).toContain('Claude Code CLI 글생성');
    expect(html).toContain('Claude 구독 한도·크레딧 사용');
    expect(renderer).toContain("'agent-claude': '🤖 에이전트 (Claude Code 구독)'");
  });
});
