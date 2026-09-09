// @vitest-environment happy-dom
/**
 * gpt-image-2.5 (flare / sunburst, 2026-09) 지원 회귀 방지.
 * - 품질 5단계(xhigh/max)는 2.5 계열에서만 그대로 통과, 구 모델은 high 로 강등 (400 방지)
 * - 쇼핑커넥트 대표이미지 참조 게이트가 2.5 모델을 받아준다
 * - 레지스트리/설정 sanitizer 가 두 모델을 안다
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveOpenAIImageQuality, isOpenAIImageModelV25 } from '../image/openaiImageQuality.js';
import { isShoppingReferenceGenerationSelectionSupported } from '../image/shoppingReferenceGeneration.js';
import { OPENAI_IMAGE_MODELS, VERIFIED_IMAGE_MODELS } from '../runtime/modelRegistry.js';
import { getOpenAIImageCostKRW, getOpenAIImageQualities } from '../renderer/utils/imageCostUtils.js';

describe('resolveOpenAIImageQuality — 모델별 품질 정규화', () => {
  it('2.5 계열은 xhigh / max 를 그대로 통과시킨다', () => {
    expect(resolveOpenAIImageQuality('gpt-image-2.5-flare', 'xhigh')).toBe('xhigh');
    expect(resolveOpenAIImageQuality('gpt-image-2.5-sunburst', 'max')).toBe('max');
  });

  it('구 모델(1 / 1.5 / 2)에 xhigh / max 가 오면 high 로 강등한다', () => {
    for (const m of ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2']) {
      expect(resolveOpenAIImageQuality(m, 'xhigh')).toBe('high');
      expect(resolveOpenAIImageQuality(m, 'max')).toBe('high');
    }
  });

  it('low / medium / high / auto 는 모든 모델에서 그대로', () => {
    for (const m of ['gpt-image-1.5', 'gpt-image-2.5-flare']) {
      for (const q of ['low', 'medium', 'high', 'auto']) {
        expect(resolveOpenAIImageQuality(m, q)).toBe(q);
      }
    }
  });

  it('미지정·쓰레기 값은 medium (비용 안전 기본)', () => {
    expect(resolveOpenAIImageQuality('gpt-image-2.5-flare', undefined)).toBe('medium');
    expect(resolveOpenAIImageQuality('gpt-image-1.5', 'ultra')).toBe('medium');
    expect(resolveOpenAIImageQuality(undefined, 'xhigh')).toBe('high');
  });

  it('isOpenAIImageModelV25 는 접두 gpt-image-2.5 만 참', () => {
    expect(isOpenAIImageModelV25('gpt-image-2.5-flare')).toBe(true);
    expect(isOpenAIImageModelV25('gpt-image-2')).toBe(false);
    expect(isOpenAIImageModelV25('')).toBe(false);
  });
});

describe('쇼핑커넥트 참조 게이트 — 2.5 모델 허용', () => {
  it('gpt-image-2.5-flare / sunburst 는 통과', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-2.5-flare')).toBe(true);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-2.5-sunburst')).toBe(true);
  });
  it('gpt-image-1.5 는 여전히 차단', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-1.5')).toBe(false);
  });
});

describe('레지스트리 / 설정 / 표시 단가', () => {
  it('OPENAI_IMAGE_MODELS 와 VERIFIED_IMAGE_MODELS 에 두 모델이 있다', () => {
    expect(OPENAI_IMAGE_MODELS.GPT_IMAGE_2_5_FLARE).toBe('gpt-image-2.5-flare');
    expect(OPENAI_IMAGE_MODELS.GPT_IMAGE_2_5_SUNBURST).toBe('gpt-image-2.5-sunburst');
    expect(VERIFIED_IMAGE_MODELS).toContain('gpt-image-2.5-flare');
    expect(VERIFIED_IMAGE_MODELS).toContain('gpt-image-2.5-sunburst');
  });

  it('configManager sanitizer 가 2.5 두 모델과 xhigh/max 를 받는다 (소스 핀)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../configManager.ts'), 'utf-8');
    expect(src).toMatch(/\['gpt-image-2', 'gpt-image-2\.5-flare', 'gpt-image-2\.5-sunburst'\]\.includes\(parsed\.openaiImageModel\)/);
    expect(src).toMatch(/\['low', 'medium', 'high', 'xhigh', 'max', 'auto'\]\.includes\(parsed\.openaiImageQuality\)/);
  });

  it('표시 단가(₩, 환율 1400)가 apiUsageTracker 와 같은 수치다', () => {
    expect(getOpenAIImageCostKRW('gpt-image-2.5-flare', 'low', 1400)).toBe(Math.round(0.0059 * 1400));
    expect(getOpenAIImageCostKRW('gpt-image-2.5-sunburst', 'max', 1400)).toBe(Math.round(0.2107 * 1400));
    expect(getOpenAIImageCostKRW('gpt-image-2', 'medium', 1400)).toBe(Math.round(0.053 * 1400));
    expect(getOpenAIImageCostKRW('gpt-image-1.5', 'medium', 1400)).toBe(Math.round(0.034 * 1400));
  });

  it('구 모델에 xhigh 를 물으면 high 단가 (생성기 강등 규칙과 일치)', () => {
    expect(getOpenAIImageCostKRW('gpt-image-2', 'xhigh', 1400)).toBe(Math.round(0.211 * 1400));
  });

  it('getOpenAIImageQualities — 2.5 는 5단계, 그 외 3단계', () => {
    expect(getOpenAIImageQualities('gpt-image-2.5-flare')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(getOpenAIImageQualities('gpt-image-2')).toEqual(['low', 'medium', 'high']);
  });
});
