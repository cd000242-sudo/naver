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
  // [2026-08-28] 빈 설정의 기본 모델은 3.6 Flash 다.
  //   정규화 함수(normalizeGeminiTextModelId)는 "알 수 없는 id → Lite" 매핑이라 그대로둔다.
  //   앱 기본값은 buildGeminiModelChain 과 gemini.ts DEFAULT_MODEL 이 정한다.
  it('uses the 3.6 Flash model for a new or blank configuration', () => {
    expect(normalizeGeminiTextModelId('')).toBe(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(buildGeminiModelChain().primaryModel).toBe(GEMINI_TEXT_MODELS.FLASH);
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
    // [2026-08-12] 3티어로 라벨이 바뀌었다. 문구가 아니라 값으로 검증한다 —
    //   문구를 박아두면 라벨만 다듬어도 회귀로 오인된다.
    expect(html).toContain('value="gemini-3.1-flash-lite"');
    expect(html).toContain('value="gemini-3.6-flash"');
    expect(html).toContain('value="gemini-3.5-flash"');
  });

  it('reports the current prepaid Flash price and never labels it free', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'main', 'ipc', 'apiHandlers.ts'),
      'utf8',
    );
    // 균형 티어 = 3.6 Flash 공식 단가
    expect(source).toContain("flash_input: '$1.50 / 1M tokens'");
    expect(source).toContain("flash_output: '$7.50 / 1M tokens'");
    expect(source).toContain("flash_input: '무료 티어 없음'");
    expect(source).not.toContain("flash_input: '$0 (무료)'");
  });
});
