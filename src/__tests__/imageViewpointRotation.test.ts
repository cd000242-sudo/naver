import { describe, expect, it } from 'vitest';

import {
  IMAGE_VIEWPOINT_HINTS,
  appendViewpointHint,
  engineInjectsViewpoint,
} from '../image/imageViewpointRotation';

/**
 * [2026-09-01 사장님 실측] "이미지 생성을 하면 왜 전부 다 위에서 내려다보는 전신샷만 나오니?"
 *
 * 책임 공백이었다.
 *
 *   프롬프트 생성기(getTranslationPrompt) 4번 규칙:
 *     "DO NOT include camera angle, color grading, or lighting
 *      — these are added separately by the system"
 *
 *   그런데 그 "시스템" 은 Flow 뿐이다. flowPromptInjection.injectHeadingVariation 이
 *   8개 시점을 순환시키는데, 그 함수를 부르는 곳이 flowGenerator 두 군데밖에 없다.
 *   덕테이프(gpt-image-2) · 나노바나나 · 그 밖의 엔진에는 아무도 각도를 넣지 않는다.
 *
 * 그래서 LLM 은 각도를 쓰지 말라는 지시를 지키고, 시스템은 넣지 않고,
 * 이미지 모델은 지시가 없으니 가장 안전한 구도 — 중앙 정렬 부감 — 로 수렴한다.
 * 소제목이 무엇이든 같은 그림이 나오는 이유가 이것이다.
 *
 * Flow 는 이미 넣으므로 두 번 넣지 않는다.
 */
describe('시점 순환', () => {
  it('여덟 개 시점을 갖는다', () => {
    expect(IMAGE_VIEWPOINT_HINTS.length).toBe(8);
  });

  it('부감 하나에만 몰려 있지 않다', () => {
    const overhead = IMAGE_VIEWPOINT_HINTS.filter((hint) => /top-down|bird/i.test(hint));
    expect(overhead.length).toBe(1);
  });

  it('소제목마다 다른 시점을 준다', () => {
    const first = appendViewpointHint('a cozy kitchen', 0);
    const second = appendViewpointHint('a cozy kitchen', 1);
    expect(first).not.toBe(second);
  });

  it('원본 프롬프트를 지우지 않고 뒤에 덧붙인다', () => {
    expect(appendViewpointHint('a cozy kitchen', 2)).toContain('a cozy kitchen');
  });

  it('여덟 개를 넘으면 처음으로 돌아온다', () => {
    expect(appendViewpointHint('x', 8)).toBe(appendViewpointHint('x', 0));
  });
});

describe('Flow 는 건드리지 않는다 — 이미 넣고 있다', () => {
  it('flow 계열은 시스템이 이미 주입한다고 판정한다', () => {
    expect(engineInjectsViewpoint('flow')).toBe(true);
    expect(engineInjectsViewpoint('google-flow')).toBe(true);
  });

  it('덕테이프 · 나노바나나는 아무도 안 넣는다', () => {
    expect(engineInjectsViewpoint('openai-image')).toBe(false);
    expect(engineInjectsViewpoint('gpt-image-2')).toBe(false);
    expect(engineInjectsViewpoint('nano-banana-pro')).toBe(false);
  });
});

describe('망가뜨리지 않는다', () => {
  it('빈 프롬프트는 그대로 둔다', () => {
    expect(appendViewpointHint('', 0)).toBe('');
    expect(appendViewpointHint(undefined as never, 0)).toBe('');
  });

  it('음수 인덱스에도 던지지 않는다', () => {
    expect(() => appendViewpointHint('x', -1)).not.toThrow();
    expect(appendViewpointHint('x', -1)).toContain('x');
  });
});
