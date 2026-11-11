/**
 * [2026-11-08] Step 2 — features computed from the post itself at publish time (pure, no I/O).
 */
import { describe, it, expect } from 'vitest';
import { classifyTitleType, computeOutcomeFeatures } from '../analytics/outcomeFeatures';

const base = {
  title: '전기요금이 올랐을 때 먼저 볼 것',
  body: '첫 문장입니다. 두 번째 문장이 조금 더 깁니다. 셋째?',
  headings: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
  imageCount: 4,
  publishedAt: '2026-11-03T23:16:24.471Z',
};

describe('computeOutcomeFeatures', () => {
  it('counts headings, images and non-space body characters', () => {
    const f = computeOutcomeFeatures(base);
    expect(f.featureVersion).toBe(1);
    expect(f.headingsCount).toBe(3);
    expect(f.imageCount).toBe(4);
    expect(f.bodyChars).toBe(base.body.replace(/\s+/g, '').length);
    expect(f.keywordDifficulty).toBeNull();
  });

  it('counts question marks (half and full width)', () => {
    expect(computeOutcomeFeatures({ ...base, body: '왜일까? 어떻게요？ 그렇군요.' }).questionCount).toBe(2);
    expect(computeOutcomeFeatures({ ...base, body: '물음표가 없습니다.' }).questionCount).toBe(0);
  });

  it('sentence length std-dev is 0 for equal sentences and positive when they vary', () => {
    expect(computeOutcomeFeatures({ ...base, body: '가나다. 라마바. 사아자.' }).sentenceLenStdDev).toBe(0);
    const varied = computeOutcomeFeatures({ ...base, body: '가나다. 가나다라마바. 가.' }).sentenceLenStdDev;
    expect(varied).toBeCloseTo(2.05, 1);
  });

  it('empty body gives zeros, not NaN', () => {
    const f = computeOutcomeFeatures({ ...base, body: '' });
    expect(f.bodyChars).toBe(0);
    expect(f.sentenceLenStdDev).toBe(0);
    expect(f.questionCount).toBe(0);
  });

  it('publish hour is KST (UTC+9) and rolls over midnight', () => {
    expect(computeOutcomeFeatures(base).publishHourKst).toBe(8);
    expect(computeOutcomeFeatures({ ...base, publishedAt: '2026-11-03T03:05:00.000Z' }).publishHourKst).toBe(12);
  });

  it('invalid time is -1 (unknown), never a made-up hour', () => {
    expect(computeOutcomeFeatures({ ...base, publishedAt: 'not a date' }).publishHourKst).toBe(-1);
  });

  it('negative or fractional image counts are clamped to a whole number >= 0', () => {
    expect(computeOutcomeFeatures({ ...base, imageCount: -2 }).imageCount).toBe(0);
    expect(computeOutcomeFeatures({ ...base, imageCount: 2.7 }).imageCount).toBe(2);
  });
});

describe('classifyTitleType', () => {
  it('question / number / two-part / statement', () => {
    expect(classifyTitleType('전기요금 왜 오를까?')).toBe('question');
    expect(classifyTitleType('2026년 지원금 3가지 정리')).toBe('number');
    expect(classifyTitleType('공식 제안에 2년 거론까지, 그래도 확정은 아닌 이유'.replace('2', 'X'))).toBe('two-part');
    expect(classifyTitleType('전기요금 폭탄 피하는 방법')).toBe('statement');
    expect(classifyTitleType('')).toBeNull();
  });
});
