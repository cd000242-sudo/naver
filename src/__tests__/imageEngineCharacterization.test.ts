/**
 * Stage 0 — 이미지 엔진 개편 회귀 기준선 (Characterization)
 *
 * 목적: 나노바나나 3종 분리 작업 전 "현재 동작"을 비트 단위로 고정한다.
 *   이후 Stage 1~8에서 의도한 변경 외 동작이 바뀌면 이 테스트가 실패한다.
 *
 * 특히 마이그레이션 타깃을 "추측"이 아니라 "현 코드 측정값"으로 확정한다:
 *   레거시 provider 값 'nano-banana-pro' + 기본 config → 실제 어떤 모델을 호출하는가?
 *   → 그 모델을 그대로 쓰는 신규 값으로 마이그레이션해야 회귀 0.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeImageProvider } from '../runtime/modelRegistry.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('Stage 0 — normalizeImageProvider 현재 동작 고정', () => {
  it("[Stage 1 해제됨] 'nano-banana-2'는 더 이상 'nano-banana-pro'로 붕괴되지 않는다", () => {
    // v2.10.335: 나노바나나 3종 분리 — 각각 별개 모델이므로 통합 정규화 제거.
    expect(normalizeImageProvider('nano-banana-2')).toBe('nano-banana-2');
    expect(normalizeImageProvider('nano-banana')).toBe('nano-banana');
    expect(normalizeImageProvider('nano-banana-pro')).toBe('nano-banana-pro');
  });

  it("deepinfra 계열은 'deepinfra'로 정규화된다 (불변 — 변경 금지)", () => {
    expect(normalizeImageProvider('deepinfra-flux')).toBe('deepinfra');
    expect(normalizeImageProvider('deepinfra-flux-2')).toBe('deepinfra');
  });

  it('정규화 대상이 아닌 값은 그대로 통과한다 (불변 — 변경 금지)', () => {
    expect(normalizeImageProvider('openai-image')).toBe('openai-image');
    expect(normalizeImageProvider('imagefx')).toBe('imagefx');
    expect(normalizeImageProvider('flow')).toBe('flow');
    expect(normalizeImageProvider('leonardoai')).toBe('leonardoai');
  });
});

describe('Stage 0 — 마이그레이션 타깃 측정 (레거시 nano-banana-pro가 실제 호출하는 모델)', () => {
  const genCode = read('image/nanoBananaProGenerator.ts');

  it("nanoBananaProGenerator 기본 모델 키는 'gemini-3-1-flash'다", () => {
    // 기본 config 사용자 → userMainModel/userSubModel 폴백값
    expect(genCode).toMatch(/nanoBananaMainModel\s*\|\|\s*'gemini-3-1-flash'/);
    expect(genCode).toMatch(/nanoBananaSubModel\s*\|\|\s*'gemini-3-1-flash'/);
  });

  it("MODEL_MAP에서 'gemini-3-1-flash'는 gemini-3.1-flash-image-preview로 매핑된다", () => {
    expect(genCode).toMatch(
      /'gemini-3-1-flash':\s*\{\s*model:\s*'gemini-3\.1-flash-image-preview'/,
    );
  });

  it("MODEL_MAP에서 'gemini-3-pro'는 gemini-3-pro-image-preview로 매핑된다", () => {
    expect(genCode).toMatch(/'gemini-3-pro':\s*\{\s*model:\s*'gemini-3-pro-image-preview'/);
  });

  it("MODEL_MAP에서 'gemini-2.5-flash'는 gemini-2.5-flash-image로 매핑된다", () => {
    expect(genCode).toMatch(/'gemini-2\.5-flash':\s*\{\s*model:\s*'gemini-2\.5-flash-image'/);
  });

  /**
   * 측정 결론 (Stage 2 마이그레이션 근거):
   *   레거시 'nano-banana-pro' + 기본 config
   *     → 모델 키 'gemini-3-1-flash'
   *     → API 모델 'gemini-3.1-flash-image-preview' (= 신규 UI "나노바나나2")
   *   따라서 레거시 'nano-banana-pro' 저장값은 신규 'nano-banana-2'로 마이그레이션한다 (행동 보존).
   */
  it('결론: 레거시 nano-banana-pro 마이그레이션 타깃 = nano-banana-2 (gemini-3.1-flash-image-preview)', () => {
    const defaultKey = 'gemini-3-1-flash';
    expect(genCode).toContain(`'${defaultKey}': { model: 'gemini-3.1-flash-image-preview'`);
  });
});

describe('Stage 0 — imageGenerator 디스패치 현재 동작 고정', () => {
  const dispatchCode = read('imageGenerator.ts');

  it('[Stage 3 적용됨] nano-banana 3종이 각각 별개로 라우팅된다 (통합 정규화 제거)', () => {
    // v2.10.335: nano-banana-2 → nano-banana-pro 통합 정규화 코드 제거됨
    expect(dispatchCode).not.toMatch(
      /normalizedProvider === 'nano-banana-2'[\s\S]{0,120}?normalizedProvider = 'nano-banana-pro'/,
    );
    // 3종 모두 nano 디스패치 분기 조건에 포함
    expect(dispatchCode).toMatch(
      /normalizedProvider === 'nano-banana'[\s\S]{0,200}?'nano-banana-2'[\s\S]{0,200}?'nano-banana-pro'/,
    );
  });

  it("'openai-image'는 generateWithOpenAIImage로 라우팅된다 (불변 — 변경 금지)", () => {
    expect(dispatchCode).toMatch(
      /normalizedProvider === 'openai-image'[\s\S]{0,300}?generateWithOpenAIImage/,
    );
  });

  it("'nano-banana-pro'는 generateWithNanoBananaPro로 라우팅된다 (불변 — 변경 금지)", () => {
    expect(dispatchCode).toMatch(
      /normalizedProvider === 'nano-banana-pro'[\s\S]{0,900}?generateWithNanoBananaPro/,
    );
  });
});
