import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01 사장님 실측] "덕테이프2로 선택하고 발행했는데도 2를 선택하라고 에러가 뜬다."
 *
 * 2026-08-25 에 같은 증상을 이미 한 번 고쳤다. 원인은 저장소가 갈린 것이었다 —
 * 이미지 관리 탭의 모델 라디오는 config 에 저장하는데(saveConfig({ openaiImageModel }))
 * 발행 경로는 localStorage / formData 만 읽어서, 화면에서 고른 값이 도달하지 못했다.
 * 빈 모델을 본 쇼핑커넥트 검사가 "gpt-image-2 를 선택해주세요" 로 막는다.
 *
 * 그때 고친 것은 costAndAutoGen 한 곳뿐이었다. 그런데 이미지 생성 경로가 둘이다.
 * 실제 발행이 타는 fullAutoFlow 의 generateAIImagesForHeadings 에는 폴백이 없어
 * 같은 버그가 그대로 남아 있었다. 사장님이 다시 만난 것이 이쪽이다.
 *
 * 한쪽만 고치고 끝낸 것이 원인이므로, 두 경로 모두를 못으로 박는다.
 */
const read = (...parts: string[]) => readFileSync(resolve(__dirname, '..', ...parts), 'utf-8');

describe('OpenAI 이미지 모델 config 폴백 — 두 경로 모두', () => {
  it('costAndAutoGen 경로에 폴백이 있다', () => {
    expect(read('renderer', 'modules', 'costAndAutoGen.ts')).toMatch(/openaiImageModel/);
  });

  it('fullAutoFlow 경로에도 폴백이 있다 — 실제 발행이 타는 길이다', () => {
    expect(read('renderer', 'modules', 'fullAutoFlow.ts')).toMatch(/openaiImageModel/);
  });

  it('fullAutoFlow 의 폴백은 쇼핑커넥트 검사보다 먼저 온다', () => {
    const src = read('renderer', 'modules', 'fullAutoFlow.ts');
    const fallbackAt = src.indexOf('openaiImageModel');
    const guardAt = src.indexOf('assertShoppingReferenceGenerationSelectionSupported(imageSource');
    expect(fallbackAt).toBeGreaterThan(0);
    expect(guardAt).toBeGreaterThan(fallbackAt);
  });
});
