import { describe, expect, it } from 'vitest';
import {
  buildNarrativeSections,
  MAX_IMAGES_PER_NARRATIVE_SECTION,
} from '../imageNarrative/inferenceAggregator/sectionBuilder';
import type { InferenceResponse } from '../imageNarrative/types';

function response(imageId: string): InferenceResponse {
  return {
    imageId,
    provider: 'gemini',
    latencyMs: 10,
    result: {
      scene_type: 'travel',
      location_hint: 'same place',
      food_items: [],
      mood_keywords: [],
      description_ko: `caption ${imageId}`,
      confidence: 0.9,
    },
  };
}

describe('buildNarrativeSections', () => {
  it('splits large same-location groups into stable section chunks', () => {
    const results = Array.from({ length: MAX_IMAGES_PER_NARRATIVE_SECTION + 2 }, (_, i) =>
      response(`img-${i + 1}`),
    );

    const sections = buildNarrativeSections(results);

    /*
     * [2026-09-09] 계약이 바뀌었다 — 예전에는 상한(8)에서만 잘라 10장이면 8+2 였다.
     * 사장님 규칙: "1~2개의 장소면 소제목을 그만큼 자동으로 쪼개줘야지."
     * 장소가 하나뿐이면 소제목 하나짜리 글이 되지 않게 장면 단위로 더 나눈다.
     * 개수 자체보다 지켜야 할 것은 아래 네 가지다.
     */
    expect(sections.length).toBeGreaterThanOrEqual(2);
    // 상한을 넘는 섹션은 없다
    sections.forEach((section) => {
      expect(section.imageRefs.length).toBeLessThanOrEqual(MAX_IMAGES_PER_NARRATIVE_SECTION);
    });
    // 사진을 한 장도 잃지 않고, 순서도 그대로다
    expect(sections.flatMap((section) => section.imageRefs)).toEqual(
      results.map((r) => r.imageId),
    );
    // 소제목은 서로 구분된다
    expect(new Set(sections.map((section) => section.heading)).size).toBe(sections.length);
  });
});
