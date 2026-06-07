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

    expect(sections).toHaveLength(2);
    expect(sections[0]!.imageRefs).toHaveLength(MAX_IMAGES_PER_NARRATIVE_SECTION);
    expect(sections[1]!.imageRefs).toHaveLength(2);
    expect(new Set(sections.map((section) => section.heading)).size).toBe(2);
  });
});
