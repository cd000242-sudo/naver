import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  GEMINI_TEXT_MODELS,
  normalizeGeminiTextModelId,
  resolveTextModelProfile,
} from '../runtime/modelRegistry';
import { buildGeminiModelChain } from '../contentGeminiModelPolicy';

describe('Gemini prepaid/value text-model policy', () => {
  it('uses the free-tier Flash-Lite model for a new or blank configuration', () => {
    expect(normalizeGeminiTextModelId('')).toBe(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(buildGeminiModelChain().primaryModel).toBe(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(resolveTextModelProfile('')).toMatchObject({
      vendor: 'gemini',
      tier: 'value',
      model: GEMINI_TEXT_MODELS.FLASH_LITE,
    });
  });

  it.each([
    'gemini-3.1-pro-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-pro-preview',
    'gemini-1.5-pro',
    'gemini-pro',
  ])('migrates paid-only/legacy Pro selection %s to prepaid-safe Flash-Lite', (model) => {
    expect(normalizeGeminiTextModelId(model)).toBe(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(buildGeminiModelChain({ primaryGeminiTextModel: model })).toMatchObject({
      primaryModel: GEMINI_TEXT_MODELS.FLASH_LITE,
      uniqueModels: [GEMINI_TEXT_MODELS.FLASH_LITE],
      isPro: false,
    });
  });

  it('does not expose Gemini Pro in any shipped model selector', () => {
    const html = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
    expect(html).not.toMatch(/value=["']gemini-3\.1-pro-preview["']/);
    expect(html).toContain('Gemini 3.1 Flash-Lite (무료');
    expect(html).toContain('Gemini 3.5 Flash (선불');
  });

  it('reports the current prepaid Flash price and never labels it free', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'main', 'ipc', 'apiHandlers.ts'),
      'utf8',
    );
    expect(source).toContain("flash_input: '$0.75 / 1M tokens'");
    expect(source).toContain("flash_output: '$4.50 / 1M tokens'");
    expect(source).toContain("flash_input: '무료 티어 없음'");
    expect(source).not.toContain("flash_input: '$0 (무료)'");
  });
});
