import { describe, expect, it } from 'vitest';
import { applyReviewEditsToPlan } from '../imageNarrative/reviewEdits';
import type { NarrativePlan } from '../imageNarrative/types';

function makePlan(): NarrativePlan {
  return {
    mode: 'auto',
    sections: [
      {
        heading: 'old place',
        imageRefs: ['img-1', 'img-2', 'img-3'],
        beats: ['old one', 'old two', 'old three'],
      },
    ],
    needsUserReview: true,
    warnings: ['G1 low confidence', 'other warning'],
    orderedResults: ['img-1', 'img-2', 'img-3'].map((imageId) => ({
      imageId,
      provider: 'gemini',
      latencyMs: 10,
      result: {
        scene_type: 'travel',
        location_hint: 'old place',
        food_items: [],
        mood_keywords: [],
        description_ko: `old ${imageId}`,
        confidence: 0.5,
      },
    })),
  };
}

describe('applyReviewEditsToPlan', () => {
  it('applies user descriptions and location hints before writing', () => {
    const updated = applyReviewEditsToPlan(makePlan(), {
      'img-2': {
        userDescription: 'user corrected scene',
        locationHint: 'correct place',
        category: 'daily',
      },
    });

    const edited = updated.orderedResults.find((r) => r.imageId === 'img-2')!;
    expect(edited.result.description_ko).toBe('user corrected scene');
    expect(edited.result.location_hint).toBe('correct place');
    expect(edited.result.scene_type).toBe('daily');
    expect(updated.needsUserReview).toBe(false);
    expect(updated.warnings).toEqual(['other warning']);
  });
});
