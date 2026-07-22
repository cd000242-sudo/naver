import { describe, expect, it } from 'vitest';
import {
  getExpectedLinkCardMin,
  getHashtagGapEnterCount,
  normalizeComparableUrl,
  planEditorTail,
  resolveCtaPosition,
  selectSectionCtas,
} from '../automation/editorTailPlan.js';

describe('editor tail plan', () => {
  it('keeps previous-post insertion before hashtags and skips duplicate CTA links', () => {
    const plan = planEditorTail({
      previousPostUrl: 'https://blog.naver.com/rimi_77-/224299610946?x=1',
      ctas: [
        { text: 'same previous post', link: 'https://blog.naver.com/rimi_77-/224299610946' },
        { text: 'official site', link: 'https://example.com/product' },
      ],
      hashtags: ['#one', '#two', '#three', '#four', '#five', '#six'],
    });

    expect(plan.previousPost.shouldInsert).toBe(true);
    expect(plan.skippedDuplicateCtaCount).toBe(1);
    expect(plan.effectiveCtas).toEqual([{ text: 'official site', link: 'https://example.com/product' }]);
    expect(plan.hashtagGapEnterCountAfterPreviousPost).toBe(5);
    expect(plan.hashtagsToApply).toEqual(['#one', '#two', '#three', '#four', '#five']);
  });

  it('keeps selected heading CTA placement out of the bottom tail CTA area', () => {
    const plan = planEditorTail({
      ctaPosition: 'heading-3',
      ctas: [{ text: 'middle CTA', link: 'https://example.com/cta' }],
      hashtags: ['#tag'],
    });

    expect(plan.isHeadingPosition).toBe(true);
    expect(plan.bottomCtas).toEqual([]);
    expect(plan.effectiveCtas).toEqual([{ text: 'middle CTA', link: 'https://example.com/cta' }]);
  });

  it('counts expected link cards from the previous-post card plus non-duplicate CTA URLs', () => {
    const plan = planEditorTail({
      previousPostUrl: 'https://blog.naver.com/leadernam/1',
      ctas: [{ text: 'coupon', link: 'https://example.com/coupon' }],
    });

    expect(getExpectedLinkCardMin(plan.previousPost.shouldInsert, plan.effectiveCtas)).toBe(2);
    expect(getExpectedLinkCardMin(false, plan.effectiveCtas)).toBe(1);
  });

  it('does not insert a previous-post tail when the affiliate link is the same URL', () => {
    const plan = planEditorTail({
      affiliateLink: 'https://naver.me/abc?NaPm=tracked',
      previousPostUrl: 'https://naver.me/abc',
      ctas: [{ text: 'buy', link: 'https://naver.me/abc' }],
    });

    expect(plan.previousPost.shouldInsert).toBe(false);
    expect(plan.previousPost.skippedBecauseAffiliateDuplicate).toBe(true);
    expect(plan.skippedDuplicateCtaCount).toBe(1);
  });

  it('normalizes comparable URLs for query, hash, and trailing slash differences', () => {
    expect(normalizeComparableUrl(' https://blog.naver.com/a/1/?x=1#top ')).toBe('https://blog.naver.com/a/1');
    expect(getHashtagGapEnterCount(true)).toBe(5);
    expect(getHashtagGapEnterCount(false)).toBe(5);
  });

  // [v2.11.142] CTA별 위치 (사용자 요청: CTA마다 다른 위치 배치)
  it('resolves per-CTA position with own > global > bottom priority', () => {
    expect(resolveCtaPosition({ text: 'a', position: 'heading-2' }, 'bottom')).toBe('heading-2');
    expect(resolveCtaPosition({ text: 'a' }, 'heading-3')).toBe('heading-3');
    expect(resolveCtaPosition({ text: 'a' }, undefined)).toBe('bottom');
  });

  it('routes a mixed CTA set: heading CTAs to their sections, the rest to the bottom', () => {
    const ctas = [
      { text: '중간 CTA', link: 'https://a.example', position: 'heading-2' },
      { text: '하단 CTA', link: 'https://b.example', position: 'bottom' },
      { text: '전역 따름', link: 'https://c.example' }, // 전역 bottom → 하단
    ];
    expect(selectSectionCtas(ctas, 'bottom', 2).map((c) => c.text)).toEqual(['중간 CTA']);
    expect(selectSectionCtas(ctas, 'bottom', 1)).toEqual([]);

    const plan = planEditorTail({ ctas, ctaPosition: 'bottom' });
    expect(plan.bottomCtas.map((c) => c.text)).toEqual(['하단 CTA', '전역 따름']);
  });

  it('legacy behaviour: global heading position without per-CTA positions', () => {
    const ctas = [{ text: 'a', link: 'https://a.example' }, { text: 'b', link: 'https://b.example' }];
    // 전역 heading-1 → 두 CTA 모두 1번 소제목, 하단 0개
    expect(selectSectionCtas(ctas, 'heading-1', 1).map((c) => c.text)).toEqual(['a', 'b']);
    const plan = planEditorTail({ ctas, ctaPosition: 'heading-1' });
    expect(plan.bottomCtas).toEqual([]);
    expect(plan.isHeadingPosition).toBe(true);
  });

  it('skipCta empties bottom CTAs regardless of positions', () => {
    const plan = planEditorTail({ ctas: [{ text: 'a', position: 'bottom' }], skipCta: true });
    expect(plan.bottomCtas).toEqual([]);
  });
});
