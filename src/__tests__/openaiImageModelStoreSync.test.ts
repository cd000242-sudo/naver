import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  isShoppingReferenceGenerationSelectionSupported,
} from '../image/shoppingReferenceGeneration';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-25 사용자 실측] "AI 이미지 생성에서 GPT Image 2 를 골랐는데도
 * GPT Image 2 로 선택하라고 한다."
 *
 * 원인은 모델 판정이 아니라 저장소가 갈린 것이었다.
 *   저장: 이미지 관리 탭 라디오 → api.saveConfig({ openaiImageModel })  (config)
 *   읽기: 생성 경로 costAndAutoGen → pipelineReadRaw('openaiImageModel') (localStorage)
 * 화면에서 고른 값이 읽는 쪽에 도달하지 못해, 빈 모델을 본 쇼핑커넥트 검사가 막았다.
 */
describe('쇼핑커넥트 대표이미지 모델 판정 (기존 계약)', () => {
  it('gpt-image-2 면 통과한다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-2')).toBe(true);
  });

  it('provider 자체가 gpt-image-2 여도 통과한다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('gpt-image-2')).toBe(true);
  });

  it('모델이 비면 막는다 — 이것이 사용자가 본 화면이다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', '')).toBe(false);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', undefined)).toBe(false);
  });

  it('다른 OpenAI 모델은 막는다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-1.5')).toBe(false);
  });
});

describe('저장소 동기화 — 화면에서 고른 모델이 생성 경로에 도달한다', () => {
  const generate = read('renderer/modules/costAndAutoGen.ts');
  const tab = read('renderer/modules/imageManagementTab.ts');

  it('읽는 쪽이 localStorage 가 비면 config 로 내려간다 (기존 사용자 즉시 복구)', () => {
    const at = generate.indexOf("if (!options.imageModel && provider === 'openai-image')");
    expect(at).toBeGreaterThan(-1);
    const block = generate.slice(at, at + 1400);
    expect(block).toContain('rawPipeline.openaiImageModel');
    expect(block).toMatch(/await \(window as any\)\.api\?\.getConfig\?\.\(\)/);
    expect(block).toMatch(/cfg\?\.openaiImageModel/);
  });

  it('config 조회가 실패해도 생성이 죽지 않는다', () => {
    const at = generate.indexOf("if (!options.imageModel && provider === 'openai-image')");
    const block = generate.slice(at, at + 1400);
    expect(block).toMatch(/catch \(e\)/);
  });

  it('저장할 때 두 저장소를 함께 맞춘다', () => {
    expect(tab).toMatch(/saveConfig\?\.\(\{ \.\.\.cfg, openaiImageModel: model/);
    expect(tab).toMatch(/localStorage\.setItem\('openaiImageModel', model\)/);
  });

  it('복원할 때도 config 값을 localStorage 로 끌어올린다', () => {
    expect(tab).toMatch(/localStorage\.setItem\('openaiImageModel', savedModel\)/);
  });
});
