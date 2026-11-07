/**
 * [2026-11-07 사장님] 모델 목록 정리 — 공식 문서 기준 최신 모델 반영 (앱 기본값은 그대로).
 *
 *   OpenAI : gpt-6-astra 가 최상위. 6.1 Terra/Sol, 6 Luna 는 기존 그대로.
 *   Claude : '프리미엄' = claude-opus-5-5, Fable 5.1 은 별도 최상위 선택지.
 *   Gemini : 최상위 칸 = gemini-4-argon (기본은 3.8 Flash 그대로, 3.6 Flash 는 저장값 보존).
 *   에이전트(구독 CLI) 화면 후보: codex / claude / agy 실측 목록.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../configManager', () => ({ loadConfig: vi.fn(), saveConfig: vi.fn() }));

import {
  CLAUDE_MODELS,
  GEMINI_TEXT_MODELS,
  OPENAI_TEXT_MODELS,
  migrateRetiredApiTextModelId,
  normalizeGeminiTextModelId,
  resolveTextModelProfile,
  routeTextToVision,
  supportsClaudeTemperature,
} from '../runtime/modelRegistry';
import { normalizeGeminiPrepaidTextModelId } from '../runtime/geminiTextModelNormalization';
import { getGeminiFreeTierLimit } from '../geminiQuotaPolicy';
import { resolveGeminiMaxOutputTokens } from '../contentGeminiSamplingPolicy';
import { getOpenAiContentTimeoutMs } from '../contentProviderTimeoutPolicy';
import { resolveTextModelSelection } from '../renderer/utils/agentProductPolicyUi';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf-8').replace(/\r\n/g, '\n');
const html = read('../public/index.html');

describe('model constants', () => {
  it('Claude: Opus 5.5 is the premium model, Fable 5.1 stays as its own top model', () => {
    expect(CLAUDE_MODELS.OPUS).toBe('claude-opus-5-5');
    expect(CLAUDE_MODELS.FABLE).toBe('claude-fable-5-1');
    expect(CLAUDE_MODELS.SONNET).toBe('claude-sonnet-5-5');
    expect(CLAUDE_MODELS.HAIKU).toBe('claude-haiku-5-5');
  });
  it('OpenAI: Astra is added on top; the app tiers do not move', () => {
    expect(OPENAI_TEXT_MODELS.ASTRA).toBe('gpt-6-astra');
    expect(OPENAI_TEXT_MODELS.LUNA).toBe('gpt-6-luna');
    expect(OPENAI_TEXT_MODELS.TERRA).toBe('gpt-6.1-terra');
    expect(OPENAI_TEXT_MODELS.SOL).toBe('gpt-6.1-sol');
  });
  it('Gemini: Argon is the top slot; default Flash and the 3.6 saved value are untouched', () => {
    expect(GEMINI_TEXT_MODELS.ARGON).toBe('gemini-4-argon');
    expect(GEMINI_TEXT_MODELS.FLASH).toBe('gemini-3.8-flash');
    expect(GEMINI_TEXT_MODELS.FLASH_SUSTAINED).toBe('gemini-3.6-flash');
    expect(GEMINI_TEXT_MODELS.FLASH_LITE).toBe('gemini-3.5-flash-lite');
  });
  it('a saved claude-opus-5 moves to Opus 5.5; the retired table keeps its older rows', () => {
    expect(migrateRetiredApiTextModelId('claude-opus-5')).toBe('claude-opus-5-5');
    expect(migrateRetiredApiTextModelId('claude-fable-5')).toBe('claude-fable-5-1');
    expect(migrateRetiredApiTextModelId('claude-sonnet-5')).toBe('claude-sonnet-5-5');
    expect(migrateRetiredApiTextModelId('gpt-5.6-sol')).toBe('gpt-6.1-sol');
  });
});

describe('resolveTextModelProfile — new top models', () => {
  const cases: Array<[string, string, string, string]> = [
    ['claude-opus', 'premium', 'claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-opus-5-5', 'premium', 'claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-opus-5', 'premium', 'claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-fable', 'premium', 'claude-fable-5-1', 'Claude Fable 5.1'],
    ['claude-fable-5-1', 'premium', 'claude-fable-5-1', 'Claude Fable 5.1'],
    ['openai-gpt6-astra', 'premium', 'gpt-6-astra', 'GPT-6 Astra'],
    ['gpt-6-astra', 'premium', 'gpt-6-astra', 'GPT-6 Astra'],
    ['gemini-4-argon', 'premium', 'gemini-4-argon', 'Gemini 4 Argon'],
  ];
  it.each(cases)('%s -> %s %s', (selector, tier, model, displayName) => {
    const p = resolveTextModelProfile(selector);
    expect(p).toMatchObject({ tier, model, displayName });
    expect(p.selector).toBe(selector);
  });

  it('Astra is a reasoning model (medium effort); Argon/Opus are not mislabeled', () => {
    expect(resolveTextModelProfile('openai-gpt6-astra').reasoningEffort).toBe('medium');
    expect(resolveTextModelProfile('openai-gpt6-astra').vendor).toBe('openai');
    expect(resolveTextModelProfile('claude-opus').vendor).toBe('claude');
    expect(resolveTextModelProfile('gemini-4-argon').vendor).toBe('gemini');
  });

  it('existing tiers are not moved', () => {
    expect(resolveTextModelProfile('gemini-3.6-flash')).toMatchObject({ tier: 'premium', model: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash' });
    expect(resolveTextModelProfile('gemini-3.8-flash')).toMatchObject({ tier: 'balanced', model: 'gemini-3.8-flash' });
    expect(resolveTextModelProfile('openai-gpt4o')).toMatchObject({ tier: 'premium', model: 'gpt-6.1-sol' });
    expect(resolveTextModelProfile('claude-sonnet')).toMatchObject({ tier: 'balanced', model: 'claude-sonnet-5-5' });
  });

  it('Claude 5.x never gets sampling controls (Opus 5.5 included)', () => {
    expect(supportsClaudeTemperature('claude-opus-5-5')).toBe(false);
  });
});

describe('Gemini Argon — recognised everywhere a saved value can land', () => {
  it('normalization keeps Argon in both the plain and the prepaid path', () => {
    expect(normalizeGeminiTextModelId('gemini-4-argon')).toBe('gemini-4-argon');
    expect(normalizeGeminiPrepaidTextModelId('gemini-4-argon')).toBe('gemini-4-argon');
    expect(normalizeGeminiPrepaidTextModelId('gemini-3.6-flash')).toBe('gemini-3.6-flash');
  });
  it('vision routes without a silent fallback, to the same Flash as the other premium keys', () => {
    expect(routeTextToVision('gemini-4-argon')).toMatchObject({ vendor: 'gemini', fellBack: false, model: 'gemini-3.8-flash' });
    expect(routeTextToVision('openai-gpt6-astra')).toMatchObject({ vendor: 'openai', fellBack: false, model: 'gpt-6.1-terra' });
    expect(routeTextToVision('claude-fable')).toMatchObject({ vendor: 'claude', fellBack: false, model: 'claude-sonnet-5-5' });
  });
  it('quota policy knows Argon: no free tier', () => {
    expect(getGeminiFreeTierLimit('gemini-4-argon')).toMatchObject({ freeTierAvailable: false, label: 'Gemini 4 Argon' });
  });
  it('output budget is not cut to 8,192 (a thinking model truncated there on 2026-09-03)', () => {
    expect(resolveGeminiMaxOutputTokens({ modelName: 'gemini-4-argon', isPro: false })).toBe(16384);
    expect(resolveGeminiMaxOutputTokens({ modelName: 'gemini-3.5-flash-lite', isPro: false })).toBe(8192);
  });
  it('the config doctor does not flag Argon as an unknown model', () => {
    expect(read('agents/masterAgent.ts')).toMatch(/validModels = \[[^\]]*GEMINI_TEXT_MODELS\.ARGON/);
  });
  it('the Gemini first-response window treats Argon like the 3.x thinking models', () => {
    expect(read('contentGenerator.ts')).toMatch(/gemini-\(\?:3\\\.\\d\|4-argon\)/);
  });
});

describe('OpenAI Astra timeouts', () => {
  it('Astra gets at least the Sol window on long articles', () => {
    expect(getOpenAiContentTimeoutMs(2500, 'gpt-6-astra')).toBeGreaterThanOrEqual(240_000);
    expect(getOpenAiContentTimeoutMs(500, 'gpt-6-astra')).toBeGreaterThanOrEqual(120_000);
  });
});

describe('selector -> provider maps know the new selectors', () => {
  it.each([
    ['openai-gpt6-astra', 'openai'],
    ['claude-fable', 'claude'],
    ['claude-opus', 'claude'],
    ['gemini-4-argon', 'gemini'],
  ])('%s -> %s (settings UI)', (selector, provider) => {
    expect(resolveTextModelSelection(selector, '', false).provider).toBe(provider);
  });
  it('unifiedDOMCache provider map', () => {
    const text = read('renderer/modules/unifiedDOMCache.ts');
    expect(text).toContain("'gemini-4-argon': 'gemini'");
    expect(text).toContain("'openai-gpt6-astra': 'openai'");
    expect(text).toContain("'claude-fable': 'claude'");
  });
  it.each(['renderer/utils/settingsModal.ts', 'renderer/modules/priceInfoModal.ts'])('%s label maps', (file) => {
    const text = read(file);
    expect(text).toContain('Gemini 4 Argon');
    expect(text).toContain('GPT-6 Astra');
    expect(text).toContain('Claude Opus 5.5');
    expect(text).toContain('Claude Fable 5.1');
    expect(text).toMatch(/'claude-opus': '[^']*Claude Opus 5\.5/);
    expect(text).toMatch(/'claude-fable': '[^']*Claude Fable 5\.1/);
    expect(text).toMatch(/'openai-gpt6-astra': '[^']*GPT-6 Astra/);
    expect(text).toMatch(/'gemini-4-argon': '[^']*Gemini 4 Argon/);
  });
});

describe('settings screen (public/index.html)', () => {
  it('has a radio for every new top model', () => {
    expect(html).toMatch(/name="primaryGeminiTextModel"\s+value="gemini-4-argon"/);
    expect(html).toMatch(/name="primaryGeminiTextModel"\s+value="openai-gpt6-astra"/);
    expect(html).toMatch(/name="primaryGeminiTextModel"\s+value="claude-fable"/);
  });
  it('keeps the existing radios, with the claude-opus one renamed to Opus 5.5', () => {
    for (const v of ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'openai-gpt4o', 'claude-sonnet', 'claude-opus']) {
      expect(html).toMatch(new RegExp(`name="primaryGeminiTextModel"\\s+value="${v}"`));
    }
    const opusAt = html.search(/name="primaryGeminiTextModel"\s+value="claude-opus"/);
    const opusCard = html.slice(opusAt, html.indexOf('</label>', opusAt));
    expect(opusCard).toContain('Claude Opus 5.5');
    expect(opusCard).not.toContain('Claude Fable 5.1');
  });
  it('Argon says it is expensive, short and on the card itself', () => {
    const at = html.search(/name="primaryGeminiTextModel"\s+value="gemini-4-argon"/);
    expect(at).toBeGreaterThan(0);
    const card = html.slice(at, at + 2200);
    expect(card).toMatch(/비용[^<]{0,30}(큼|높)/);
    expect(card).toContain('$2');
  });
  it('the unified engine dropdown offers Argon with the same warning', () => {
    expect(html).toMatch(/<option value="gemini-4-argon">[^<]*비용[^<]*<\/option>/);
    expect(html).toMatch(/<option value="gemini-3\.8-flash" selected>/);
  });
});

describe('agent (subscription CLI) model candidates', () => {
  const load = async () => import('../runtime/agentModelPolicy');
  const values = (list: ReadonlyArray<{ value: string }>) => list.map((m) => m.value);

  it('codex = the subscription list', async () => {
    const { AGENT_MODEL_PRESETS } = await load();
    expect(values(AGENT_MODEL_PRESETS['agent-codex']).sort()).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra',
      'gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6.1-terra',
    ]);
  });
  it('claude = aliases + the four current IDs, without the retired fixed versions', async () => {
    const { AGENT_MODEL_PRESETS } = await load();
    const v = values(AGENT_MODEL_PRESETS['agent-claude']);
    expect(v).toEqual(expect.arrayContaining(['fable', 'opus', 'sonnet', 'haiku',
      'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']));
    for (const gone of ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']) {
      expect(v).not.toContain(gone);
    }
  });
  it('agy = the measured `agy models` list, nothing else', async () => {
    const { AGENT_MODEL_PRESETS } = await load();
    expect(values(AGENT_MODEL_PRESETS['agent-gemini']).sort()).toEqual([
      'claude-opus-5-5-high', 'claude-opus-5-5-low', 'claude-opus-5-5-medium',
      'claude-sonnet-5-5-high', 'claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium',
      'gemini-3.8-flash-high', 'gemini-3.8-flash-low', 'gemini-3.8-flash-medium',
      'gemini-4-argon-high', 'gemini-4-argon-low', 'gemini-4-argon-medium',
      'gpt-oss-120b-medium',
    ]);
  });
  it('every candidate still passes the safe-format check unchanged', async () => {
    const { AGENT_MODEL_PRESETS, resolveAgentModel } = await load();
    const keys: Record<string, string> = { 'agent-codex': 'agentCodexModel', 'agent-claude': 'agentClaudeModel', 'agent-gemini': 'agentGeminiModel' };
    for (const [provider, models] of Object.entries(AGENT_MODEL_PRESETS)) {
      for (const m of models) expect(resolveAgentModel(provider, { [keys[provider]]: m.value })).toBe(m.value);
    }
  });
  it.each([
    ['gemini-3.7-flash-high', 'gemini-3.8-flash-high'],
    ['gemini-3.6-flash-high', 'gemini-3.8-flash-high'],
    ['gemini-3.6-flash-low', 'gemini-3.8-flash-low'],
    ['gemini-3.1-pro-high', 'gemini-4-argon-high'],
    ['claude-opus-4-6-thinking', 'claude-opus-5-5-high'],
    ['claude-sonnet-4-6', 'claude-sonnet-5-5-high'],
  ])('a saved agy value %s moves to %s', async (saved, expected) => {
    const { migrateRetiredAgentModelId, resolveAgentModel } = await load();
    expect(migrateRetiredAgentModelId('agent-gemini', saved)).toBe(expected);
    expect(resolveAgentModel('agent-gemini', { agentGeminiModel: saved })).toBe(expected);
  });
  it('values that are in the list, or belong to another agent, are left alone', async () => {
    const { migrateRetiredAgentModelId, resolveAgentModel } = await load();
    expect(migrateRetiredAgentModelId('agent-gemini', 'gemini-4-argon-medium')).toBe('gemini-4-argon-medium');
    expect(migrateRetiredAgentModelId('agent-gemini', 'my-own-model')).toBe('my-own-model');
    expect(migrateRetiredAgentModelId('agent-claude', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveAgentModel('agent-claude', { agentClaudeModel: 'claude-fable-5' })).toBe('claude-fable-5');
  });
  it('the settings dropdown shows the migrated name, not the dead one as "custom"', () => {
    expect(read('renderer/modules/agentModelSelect.ts')).toContain('migrateRetiredAgentModelId(provider, input.value.trim())');
  });
});
