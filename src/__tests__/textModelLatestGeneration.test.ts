/**
 * [2026-11-03] API text engines moved to the latest model generation.
 *
 * Contract: UI selector values (openai-gpt41, claude-sonnet, ...) stay stable and only the
 * model that is really called changes. Retired saved IDs resolve to the same tier's new ID.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../configManager', () => ({ loadConfig: vi.fn(), saveConfig: vi.fn() }));

import {
  CLAUDE_MODELS,
  FAKE_MODEL_IDS_BANNED,
  GEMINI_TEXT_MODELS,
  OPENAI_TEXT_MODELS,
  VISION_MODELS,
  VERIFIED_IMAGE_MODELS,
  isBannedModelId,
  normalizeGeminiTextModelId,
  resolveTextModelProfile,
  routeTextToVision,
  supportsClaudeTemperature,
} from '../runtime/modelRegistry';
import { normalizeGeminiPrepaidTextModelId } from '../runtime/geminiTextModelNormalization';
import { resolveGeminiTextPricing } from '../apiUsageTracker';
import {
  CLAUDE_ADAPTIVE_MIN_TIMEOUT_MS,
  getClaudeContentTimeoutMs,
  getOpenAiContentTimeoutMs,
} from '../contentProviderTimeoutPolicy';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf-8');
const html = fs.readFileSync(path.join(SRC, '../public/index.html'), 'utf-8');

describe('latest generation constants', () => {
  it('OpenAI text models', () => {
    expect(OPENAI_TEXT_MODELS.LUNA).toBe('gpt-6-luna');
    expect(OPENAI_TEXT_MODELS.TERRA).toBe('gpt-6.1-terra');
    expect(OPENAI_TEXT_MODELS.SOL).toBe('gpt-6.1-sol');
    expect(OPENAI_TEXT_MODELS.GPT_41).toBe('gpt-6.1-terra');
    expect(OPENAI_TEXT_MODELS.GPT_41_MINI).toBe('gpt-6-luna');
  });

  it('Claude models', () => {
    expect(CLAUDE_MODELS.SONNET).toBe('claude-sonnet-5-5');
    expect(CLAUDE_MODELS.FABLE).toBe('claude-fable-5-1');
    expect(CLAUDE_MODELS.OPUS).toBe('claude-fable-5-1');
    expect(CLAUDE_MODELS.HAIKU).toBe('claude-haiku-5-5');
  });

  it('Gemini text models', () => {
    expect(GEMINI_TEXT_MODELS.FLASH_LITE).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_TEXT_MODELS.FLASH).toBe('gemini-3.8-flash');
    expect(GEMINI_TEXT_MODELS.FLASH_SUSTAINED).toBe('gemini-3.6-flash');
  });

  it('vision models follow the text constants', () => {
    expect(VISION_MODELS.OPENAI_41).toBe('gpt-6.1-terra');
    expect(VISION_MODELS.OPENAI_41_MINI).toBe('gpt-6-luna');
    expect(VISION_MODELS.CLAUDE_SONNET).toBe('claude-sonnet-5-5');
    expect(VISION_MODELS.GEMINI_FLASH).toBe('gemini-3.8-flash');
    expect(VISION_MODELS.GEMINI_FLASH_LITE).toBe('gemini-3.5-flash-lite');
  });
});

describe('resolveTextModelProfile — stable selectors keep their tier', () => {
  const cases: Array<[string, string, string, string]> = [
    ['openai-gpt4o-mini', 'value', 'gpt-6-luna', 'GPT-6 Luna'],
    ['openai-gpt41', 'balanced', 'gpt-6.1-terra', 'GPT-6.1 Terra'],
    ['openai-gpt4o', 'premium', 'gpt-6.1-sol', 'GPT-6.1 Sol'],
    ['openai-gpt4o-search', 'balanced', 'gpt-6.1-terra', 'GPT-6.1 Terra + Web Search'],
    ['claude-haiku', 'value', 'claude-haiku-5-5', 'Claude Haiku 5.5'],
    ['claude-sonnet', 'balanced', 'claude-sonnet-5-5', 'Claude Sonnet 5.5'],
    ['claude-opus', 'premium', 'claude-fable-5-1', 'Claude Fable 5.1'],
    ['claude-fable', 'premium', 'claude-fable-5-1', 'Claude Fable 5.1'],
  ];
  it.each(cases)('%s -> %s %s', (selector, tier, model, displayName) => {
    const p = resolveTextModelProfile(selector);
    expect(p.tier).toBe(tier);
    expect(p.model).toBe(model);
    expect(p.displayName).toBe(displayName);
  });

  it('reasoning effort stays on OpenAI profiles', () => {
    expect(resolveTextModelProfile('openai-gpt41').reasoningEffort).toBe('medium');
  });
});

describe('resolveTextModelProfile — retired saved IDs migrate to the same tier', () => {
  const cases: Array<[string, string, string]> = [
    ['gpt-5.6-luna', 'value', 'gpt-6-luna'],
    ['gpt-5.6-terra', 'balanced', 'gpt-6.1-terra'],
    ['gpt-5.6-sol', 'premium', 'gpt-6.1-sol'],
    ['gpt-4.1', 'balanced', 'gpt-6.1-terra'],
    ['gpt-4.1-mini', 'value', 'gpt-6-luna'],
    ['gpt-4.1-nano', 'value', 'gpt-6-luna'],
    ['claude-sonnet-5', 'balanced', 'claude-sonnet-5-5'],
    ['claude-fable-5', 'premium', 'claude-fable-5-1'],
    ['claude-haiku-4-5-20251001', 'value', 'claude-haiku-5-5'],
    ['claude-haiku-4-5', 'value', 'claude-haiku-5-5'],
    ['gpt-6-luna', 'value', 'gpt-6-luna'],
    ['gpt-6.1-terra', 'balanced', 'gpt-6.1-terra'],
    ['gpt-6.1-sol', 'premium', 'gpt-6.1-sol'],
    ['claude-sonnet-5-5', 'balanced', 'claude-sonnet-5-5'],
    ['claude-fable-5-1', 'premium', 'claude-fable-5-1'],
    ['claude-haiku-5-5', 'value', 'claude-haiku-5-5'],
  ];
  it.each(cases)('%s -> %s %s', (selector, tier, model) => {
    const p = resolveTextModelProfile(selector);
    expect(p.model).toBe(model);
    expect(p.tier).toBe(tier);
    expect(p.selector).toBe(selector);
  });
});

describe('Gemini text selectors and migration', () => {
  it('empty selector defaults to the value tier', () => {
    const p = resolveTextModelProfile('');
    expect(p.model).toBe('gemini-3.5-flash-lite');
    expect(p.tier).toBe('value');
    expect(p.displayName).toBe('Gemini 3.5 Flash-Lite');
  });

  const cases: Array<[string, string, string, string]> = [
    ['gemini-3.5-flash-lite', 'value', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'],
    ['gemini-3.1-flash-lite', 'value', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'],
    ['gemini-2.5-flash-lite', 'value', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'],
    ['gemini-3.8-flash', 'balanced', 'gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['gemini-2.5-flash', 'balanced', 'gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['gemini-3.6-flash', 'premium', 'gemini-3.6-flash', 'Gemini 3.6 Flash'],
    ['gemini-3.5-flash', 'premium', 'gemini-3.6-flash', 'Gemini 3.6 Flash'],
  ];
  it.each(cases)('%s -> %s %s', (selector, tier, model, displayName) => {
    const p = resolveTextModelProfile(selector);
    expect(p.tier).toBe(tier);
    expect(p.model).toBe(model);
    expect(p.displayName).toBe(displayName);
  });

  it('normalizeGeminiTextModelId maps retired IDs and keeps current ones', () => {
    expect(normalizeGeminiTextModelId('gemini-3.1-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(normalizeGeminiTextModelId('gemini-3.5-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiTextModelId('gemini-3.6-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiTextModelId('gemini-3.8-flash')).toBe('gemini-3.8-flash');
    expect(normalizeGeminiTextModelId('gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(normalizeGeminiTextModelId('gemini-2.5-flash')).toBe('gemini-3.8-flash');
    expect(normalizeGeminiTextModelId('gemini-2.5-pro')).toBe('gemini-3.5-flash-lite');
    expect(normalizeGeminiTextModelId('')).toBe('gemini-3.5-flash-lite');
  });

  it('prepaid normalization keeps the three supported models and drops Pro', () => {
    expect(normalizeGeminiPrepaidTextModelId('gemini-3.1-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(normalizeGeminiPrepaidTextModelId('gemini-3.5-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiPrepaidTextModelId('gemini-3.8-flash')).toBe('gemini-3.8-flash');
    expect(normalizeGeminiPrepaidTextModelId('gemini-3.1-pro-preview')).toBe('gemini-3.5-flash-lite');
    expect(normalizeGeminiPrepaidTextModelId('claude-haiku')).toBe('claude-haiku');
  });
});

describe('supportsClaudeTemperature — Claude 5.x never gets sampling controls', () => {
  it.each([
    'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-haiku-5-5',
    'claude-sonnet-5', 'claude-fable-5', 'claude-opus-5', 'claude-haiku-5',
    'claude-opus-4-7', 'claude-opus-4-8',
  ])('%s rejects temperature', (model) => {
    expect(supportsClaudeTemperature(model)).toBe(false);
  });

  it.each([
    'claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5',
    'claude-3-5-haiku-20241022',
  ])('%s still accepts temperature', (model) => {
    expect(supportsClaudeTemperature(model)).toBe(true);
  });

  it('haiku 5.5 gets the long adaptive window like the other 5.x models', () => {
    expect(getClaudeContentTimeoutMs(2500, 'claude-haiku-5-5')).toBeGreaterThanOrEqual(CLAUDE_ADAPTIVE_MIN_TIMEOUT_MS);
  });
});

describe('OpenAI long-form timeout floors follow the new IDs', () => {
  it('gpt-6.1-sol / gpt-6.1-terra keep their wide windows', () => {
    expect(getOpenAiContentTimeoutMs(2500, 'gpt-6.1-sol')).toBeGreaterThanOrEqual(240_000);
    expect(getOpenAiContentTimeoutMs(2500, 'gpt-6.1-terra')).toBeGreaterThanOrEqual(180_000);
    expect(getOpenAiContentTimeoutMs(500, 'gpt-6.1-sol')).toBeGreaterThanOrEqual(120_000);
  });
  it('retired ids still get the window (saved-value compatibility)', () => {
    expect(getOpenAiContentTimeoutMs(2500, 'gpt-5.6-sol')).toBeGreaterThanOrEqual(240_000);
    expect(getOpenAiContentTimeoutMs(2500, 'gpt-5.6-terra')).toBeGreaterThanOrEqual(180_000);
  });
});

describe('routeTextToVision — new text keys', () => {
  it('Gemini value / balanced / premium keys route without fallback', () => {
    const lite = routeTextToVision('gemini-3.5-flash-lite');
    expect(lite).toMatchObject({ vendor: 'gemini', model: VISION_MODELS.GEMINI_FLASH_LITE, fellBack: false });
    for (const key of ['gemini-3.8-flash', 'gemini-3.6-flash']) {
      expect(routeTextToVision(key)).toMatchObject({ vendor: 'gemini', model: VISION_MODELS.GEMINI_FLASH, fellBack: false });
    }
  });
  it('retired Gemini keys keep working', () => {
    expect(routeTextToVision('gemini-3.1-flash-lite')).toMatchObject({ model: VISION_MODELS.GEMINI_FLASH_LITE, fellBack: false });
    expect(routeTextToVision('gemini-3.5-flash')).toMatchObject({ model: VISION_MODELS.GEMINI_FLASH, fellBack: false });
  });
});

describe('banned / verified lists do not catch the new IDs', () => {
  const ids = [
    'gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol',
    'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-haiku-5-5',
    'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash',
  ];
  it.each(ids)('%s is not banned', (id) => {
    expect(isBannedModelId(id)).toBe(false);
    for (const banned of FAKE_MODEL_IDS_BANNED) expect(id.includes(banned)).toBe(false);
  });
  it('image whitelist is untouched by the text-model move', () => {
    for (const id of ids) expect((VERIFIED_IMAGE_MODELS as readonly string[]).includes(id)).toBe(false);
  });
});

describe('price tables', () => {
  it('Gemini text prices: Flash-Lite is not priced as 3.5 Flash', () => {
    expect(resolveGeminiTextPricing('gemini-3.5-flash-lite', 1000)).toEqual({ input: 0.30, output: 2.50 });
    expect(resolveGeminiTextPricing('gemini-3.8-flash', 1000)).toEqual({ input: 1.50, output: 7.50 });
    expect(resolveGeminiTextPricing('gemini-3.6-flash', 1000)).toEqual({ input: 1.50, output: 7.50 });
  });
  it('retired Gemini IDs keep their historical prices', () => {
    expect(resolveGeminiTextPricing('gemini-3.1-flash-lite', 1000)).toEqual({ input: 0.25, output: 1.50 });
    expect(resolveGeminiTextPricing('gemini-3.5-flash', 1000)).toEqual({ input: 1.50, output: 9.00 });
  });
  it('OpenAI and Claude tables contain the new models', () => {
    const tracker = read('apiUsageTracker.ts');
    expect(tracker).toMatch(/'gpt-6-luna':\s*\{\s*input:\s*0\.10[^}]*output:\s*0\.50/);
    expect(tracker).toMatch(/'gpt-6\.1-terra':\s*\{\s*input:\s*1\.00[^}]*output:\s*5\.00/);
    expect(tracker).toMatch(/'gpt-6\.1-sol':\s*\{\s*input:\s*2\.00[^}]*output:\s*10\.00/);
    expect(tracker).toMatch(/'claude-haiku-5-5':\s*\{\s*input:\s*1\.00[^}]*output:\s*5\.00/);
    expect(tracker).toMatch(/'claude-sonnet-5-5':\s*\{\s*input:\s*3\.00[^}]*output:\s*15\.00/);
    expect(tracker).toMatch(/'claude-fable-5-1':\s*\{\s*input:\s*10\.00[^}]*output:\s*50\.00/);
  });
});

describe('no hard-coded retired model IDs in side-call sites', () => {
  it.each(['factCheckRouter.ts', 'main/ipc/paraphraseAnalysisHandlers.ts'])('%s uses the registry', (file) => {
    const text = read(file);
    expect(text).not.toMatch(/'gpt-4\.1-mini'/);
    expect(text).not.toMatch(/'claude-haiku-4-5-20251001'/);
    expect(text).not.toMatch(/'gemini-3\.1-flash-lite'/);
  });
});

describe('screen labels and radio values', () => {
  it('settings radios use the new Gemini IDs', () => {
    expect(html).toMatch(/name="primaryGeminiTextModel"\s+value="gemini-3\.5-flash-lite"/);
    expect(html).toMatch(/name="primaryGeminiTextModel"\s+value="gemini-3\.8-flash"/);
    expect(html).toMatch(/name="primaryGeminiTextModel"\s+value="gemini-3\.6-flash"/);
    expect(html).not.toMatch(/name="primaryGeminiTextModel"\s+value="gemini-3\.1-flash-lite"/);
    expect(html).not.toMatch(/name="primaryGeminiTextModel"\s+value="gemini-3\.5-flash"/);
  });
  it('settings radios show the new model names', () => {
    for (const label of ['GPT-6 Luna', 'GPT-6.1 Terra', 'GPT-6.1 Sol', 'Claude Haiku 5.5', 'Claude Sonnet 5.5', 'Claude Fable 5.1', 'Gemini 3.8 Flash', 'Gemini 3.5 Flash-Lite']) {
      expect(html).toContain(label);
    }
    expect(html).not.toMatch(/<span>[^<]*GPT-5\.6 (Luna|Terra|Sol)<\/span>/);
    expect(html).not.toMatch(/<span>[^<]*Claude (Haiku 4\.5|Sonnet 5|Fable 5)<\/span>/);
  });
  it.each(['renderer/utils/settingsModal.ts', 'renderer/modules/priceInfoModal.ts'])('%s label map uses the new names', (file) => {
    const text = read(file);
    expect(text).toContain('GPT-6.1 Terra');
    expect(text).toContain('Gemini 3.8 Flash');
    expect(text).toContain('Gemini 3.5 Flash-Lite');
    expect(text).toContain('Claude Sonnet 5.5');
    expect(text).not.toMatch(/GPT-5\.6 (Luna|Terra|Sol)/);
  });
  it('provider map knows every current Gemini radio value', () => {
    const text = read('renderer/modules/unifiedDOMCache.ts');
    for (const id of ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash']) {
      expect(text).toContain(`'${id}': 'gemini'`);
    }
  });
});
