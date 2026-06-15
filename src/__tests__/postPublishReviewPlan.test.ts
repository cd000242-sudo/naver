import { describe, expect, it } from 'vitest';
import { createPostPublishReviewPlan } from '../automation/postPublishReviewPlan.js';

function scriptedRandom(values: number[]) {
  let index = 0;
  return (min: number, max: number) => {
    const value = values[index++];
    if (value === undefined) {
      throw new Error(`unexpected randomInt call for ${min}-${max}`);
    }
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThanOrEqual(max);
    return value;
  };
}

describe('createPostPublishReviewPlan', () => {
  it('builds a deterministic post-publish review plan from injected random values', () => {
    const plan = createPostPublishReviewPlan({
      naverId: 'leader_248',
      publishedUrl: 'https://blog.naver.com/leader_248/123',
      viewport: { width: 1280, height: 900 },
      randomInt: scriptedRandom([7000, 4, 320, 540, 12, 3500]),
    });

    expect(plan).toEqual({
      publishedUrl: 'https://blog.naver.com/leader_248/123',
      blogHomeUrl: 'https://blog.naver.com/leader_248',
      reviewDurationMs: 7000,
      reviewScrollCount: 4,
      afterReviewDelayMs: 3000,
      mouseMove: { x: 320, y: 540, steps: 12 },
      homeStayMs: 3500,
      afterHomeDelayMs: 2000,
    });
  });

  it('skips mouse movement when no safe viewport is available', () => {
    const plan = createPostPublishReviewPlan({
      naverId: 'leader_248',
      publishedUrl: 'https://blog.naver.com/leader_248/123',
      viewport: { width: 160, height: 240 },
      randomInt: scriptedRandom([5000, 3, 2000]),
    });

    expect(plan.mouseMove).toBeNull();
    expect(plan.afterReviewDelayMs).toBe(1000);
    expect(plan.afterHomeDelayMs).toBe(500);
  });
});
