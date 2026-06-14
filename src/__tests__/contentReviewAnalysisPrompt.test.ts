import { describe, expect, it } from 'vitest';

import {
  appendReviewAnalysisPrompt,
  buildReviewAnalysisPrompt,
} from '../contentReviewAnalysisPrompt';

describe('contentReviewAnalysisPrompt', () => {
  it('keeps the review-analysis prompt as expert analysis, not fake usage review', () => {
    const prompt = buildReviewAnalysisPrompt();

    expect(prompt).toContain('구매 전 제품 분석 가이드');
    expect(prompt).toContain('사용후기 아님');
    expect(prompt).toContain('써보니/사용해보니');
    expect(prompt).toContain('스펙을 살펴보면');
    expect(prompt).toContain('실사용/솔직후기/내돈내산/찐후기/리얼후기');
  });

  it('appends the prompt only for review-type content', () => {
    const base = 'BASE';

    expect(appendReviewAnalysisPrompt(base, true)).toContain('구매 전 제품 분석 가이드');
    expect(appendReviewAnalysisPrompt(base, true)).toContain(base);
    expect(appendReviewAnalysisPrompt(base, false)).toBe(base);
  });
});
