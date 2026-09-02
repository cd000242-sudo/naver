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

  /*
   * [2026-09-02 갱신] 위 08-25 계약("localStorage 가 비면 config")은 세 번째 재발로 뒤집혔다.
   * 오늘 값은 비어 있지 않고 틀렸다 — 부팅이 낡은 계정(acct1) config 를 먼저 복원하고
   * imageManagementTab 이 그 값(1.5)을 localStorage 에 도장 찍는다. 진짜 계정 config 는 2.
   * 그래서 이제 config 가 SSOT 다. localStorage·화면은 config 가 빌 때만 쓴다.
   * (교정 함수 계약은 openaiImageModelReconcile.test.ts 가 잠근다.)
   */
  const READ_ANCHOR = "const screenModel = String(options.imageModel || rawPipeline.openaiImageModel || '').trim();";

  it('읽는 쪽은 config 를 먼저 믿고, localStorage 는 config 가 빌 때만 쓴다', () => {
    const at = generate.indexOf(READ_ANCHOR);
    expect(at).toBeGreaterThan(-1);
    const block = generate.slice(at, at + 900);
    expect(block).toMatch(/await \(window as any\)\.api\?\.getConfig\?\.\(\)/);
    expect(block).toMatch(/cfg\?\.openaiImageModel/);
    expect(block).toMatch(/reconcileOpenaiImageModelSelection\(screenModel, configModel\)/);
    // 되돌린 흔적 — "비어 있을 때만 config" 가 다시 오면 낡은 값이 검사를 받는다
    expect(generate).not.toContain("if (!options.imageModel && provider === 'openai-image')");
  });

  it('config 조회가 실패해도 생성이 죽지 않는다', () => {
    const at = generate.indexOf(READ_ANCHOR);
    const block = generate.slice(at, at + 900);
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
