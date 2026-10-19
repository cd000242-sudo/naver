// [2026-10-20] 나노바나나2 = Nano Banana 2.1. 실호출 미확인(키 402)이라, 2.1 이 "모델" 로 거부될 때만 같은 엔진의
//   직전 버전(gemini-3.1-flash-image)으로 넘어간다. 과금·할당량·인증·서버 오류는 버전을 바꾸지 않는다.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  NANO_BANANA_21_MODEL,
  NANO_BANANA_2_PREVIOUS_MODEL,
  applyNanoBanana21Availability,
  markNanoBanana21UnavailableIfModelError,
  resetNanoBanana21AvailabilityForTest,
} from '../image/nanoBanana21Guard';
import { GEMINI_IMAGE_MODELS } from '../runtime/modelRegistry';

describe('nanoBanana21Guard', () => {
  beforeEach(() => resetNanoBanana21AvailabilityForTest());

  it('레지스트리의 나노바나나2 = 2.1, 직전 = 3.1 Flash Image', () => {
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_2).toBe(NANO_BANANA_21_MODEL);
    expect(GEMINI_IMAGE_MODELS.NANO_BANANA_2_PREV).toBe(NANO_BANANA_2_PREVIOUS_MODEL);
  });

  it('처음에는 2.1 그대로, 404·400 모델 오류 뒤에는 직전 버전', () => {
    expect(applyNanoBanana21Availability(NANO_BANANA_21_MODEL)).toBe(NANO_BANANA_21_MODEL);
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 404, 'models/gemini-nano-banana-2.1 is not found')).toBe(true);
    expect(applyNanoBanana21Availability(NANO_BANANA_21_MODEL)).toBe(NANO_BANANA_2_PREVIOUS_MODEL);
    // 두 번째 신호는 다시 알리지 않는다(로그 1회).
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 404, 'not found')).toBe(false);
  });

  it("문자열 상태코드 '400' + 'not supported' 도 모델 오류다", () => {
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, '400', 'Image generation is not supported for this model')).toBe(true);
  });

  it('과금 402·할당량 429·인증 403·서버 503·일반 400 은 버전을 바꾸지 않는다', () => {
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 402, 'prepayment credits are depleted')).toBe(false);
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 429, 'quota exceeded for model')).toBe(false);
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 403, 'API key not valid')).toBe(false);
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 503, 'model is overloaded')).toBe(false);
    expect(markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 400, 'Request contains an invalid argument: prompt')).toBe(false);
    expect(applyNanoBanana21Availability(NANO_BANANA_21_MODEL)).toBe(NANO_BANANA_21_MODEL);
  });

  it('다른 모델(프로·3.1·2.5)은 건드리지 않는다', () => {
    expect(markNanoBanana21UnavailableIfModelError('gemini-3-pro-image', 404, 'not found')).toBe(false);
    markNanoBanana21UnavailableIfModelError(NANO_BANANA_21_MODEL, 404, 'not found');
    expect(applyNanoBanana21Availability('gemini-3-pro-image')).toBe('gemini-3-pro-image');
    expect(applyNanoBanana21Availability('gemini-2.5-flash-image')).toBe('gemini-2.5-flash-image');
  });
});

describe('배선(소스 가드)', () => {
  it('생성기와 스타일 미리보기 둘 다 가드를 거친다', () => {
    const gen = readFileSync(resolve('src/image/nanoBananaProGenerator.ts'), 'utf8');
    expect(gen).toContain('applyNanoBanana21Availability(selectedModel)');
    expect(gen).toContain('markNanoBanana21UnavailableIfModelError(lastSelectedModel, statusCode,');
    expect(gen).toContain('sendImageLog(NANO_BANANA_21_FALLBACK_NOTICE)');
    const ipc = readFileSync(resolve('src/main/ipc/imageHandlers.ts'), 'utf8');
    expect(ipc).toContain('applyNanoBanana21Availability(route.model)');
    expect(ipc).toContain('markNanoBanana21UnavailableIfModelError(previewModel,');
  });
});
