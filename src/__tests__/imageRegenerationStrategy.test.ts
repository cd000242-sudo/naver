/**
 * SPEC-CONVERSION-001 L3-3.4 — imageRegenerationStrategy 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { planRegeneration } from '../image/imageRegenerationStrategy';
import { extractKeywords } from '../content/keywordExtractor';
import { verifyImageBodyAlignment } from '../image/imageBodyAlignmentVerifier';

const sampleBody = [
  '# 강남 카페 인테리어 후기',
  '',
  '카페 인테리어와 메뉴가 정말 좋았어요. '.repeat(20),
  '## 메뉴',
  '카페 메뉴와 디저트가 다양했어요. '.repeat(15),
].join('\n');

describe('planRegeneration — 정상', () => {
  it('이미 aligned면 ALREADY_ALIGNED reason + attempts 빈 배열', () => {
    const kw = extractKeywords({ bodyText: sampleBody, title: '카페' });
    const aligned = verifyImageBodyAlignment({
      bodyKeywords: kw.keywords,
      imagePromptOrAlt: '카페 인테리어 메뉴',
      minOverlapRate: 0.3,
    });
    expect(aligned.aligned).toBe(true);
    const r = planRegeneration({
      bodyKeywords: kw.keywords,
      initialAlignment: aligned,
    });
    expect(r.succeeded).toBe(true);
    expect(r.attempts).toHaveLength(0);
    expect(r.fallbackReason).toMatch(/ALREADY_ALIGNED/);
  });

  it('미정렬 입력에서 재생성 전략 시도 후 통과', () => {
    const kw = extractKeywords({ bodyText: sampleBody, title: '강남 카페' });
    const bad = verifyImageBodyAlignment({
      bodyKeywords: kw.keywords,
      imagePromptOrAlt: '도쿄 거리 야경',
      minOverlapRate: 0.4,
    });
    expect(bad.aligned).toBe(false);

    const r = planRegeneration({
      bodyKeywords: kw.keywords,
      headingHint: '강남 카페',
      initialAlignment: bad,
      lang: 'ko',
    });
    expect(r.attempts.length).toBeGreaterThan(0);
    if (r.succeeded) {
      expect(r.finalPrompt).toMatch(/카페|메뉴|인테리어/);
    }
  });

  it('빈 키워드는 명시 fallback', () => {
    const r = planRegeneration({
      bodyKeywords: [],
      initialAlignment: {
        aligned: false, overlapRate: 0,
        matchedKeywords: [], missingFromImage: [], extraInImage: [],
      },
    });
    expect(r.succeeded).toBe(false);
    expect(r.fallbackReason).toMatch(/BODY_KEYWORDS_EMPTY/);
  });

  it('maxAttempts=1로 시도 제한', () => {
    const kw = extractKeywords({ bodyText: sampleBody, title: '카페' });
    const bad = verifyImageBodyAlignment({
      bodyKeywords: kw.keywords,
      imagePromptOrAlt: '완전 무관한 텍스트',
      minOverlapRate: 0.99,        // 거의 통과 불가
    });
    const r = planRegeneration({
      bodyKeywords: kw.keywords,
      initialAlignment: bad,
      maxAttempts: 1,
    });
    expect(r.attempts.length).toBeLessThanOrEqual(1);
  });

  it('결정론 — 같은 입력은 같은 결과', () => {
    const kw = extractKeywords({ bodyText: sampleBody, title: '카페' });
    const bad = verifyImageBodyAlignment({
      bodyKeywords: kw.keywords,
      imagePromptOrAlt: '도쿄 거리 야경',
      minOverlapRate: 0.4,
    });
    const a = planRegeneration({ bodyKeywords: kw.keywords, initialAlignment: bad, lang: 'ko' });
    const b = planRegeneration({ bodyKeywords: kw.keywords, initialAlignment: bad, lang: 'ko' });
    expect(a.attempts.map((x) => x.prompt)).toEqual(b.attempts.map((x) => x.prompt));
  });
});

describe('planRegeneration — 전략 다양성', () => {
  it('headingHint 없으면 strategy 2(add-heading) 스킵', () => {
    const kw = extractKeywords({ bodyText: sampleBody, title: '카페' });
    const bad = verifyImageBodyAlignment({
      bodyKeywords: kw.keywords,
      imagePromptOrAlt: '완전무관텍스트',
      minOverlapRate: 0.99,
    });
    const r = planRegeneration({
      bodyKeywords: kw.keywords,
      initialAlignment: bad,
      lang: 'ko',
    });
    const strategies = r.attempts.map((a) => a.strategy);
    expect(strategies).not.toContain('add-heading');
  });

  it('실패 시 best attempt prompt 반환', () => {
    const kw = extractKeywords({ bodyText: sampleBody, title: '카페' });
    const bad = verifyImageBodyAlignment({
      bodyKeywords: kw.keywords,
      imagePromptOrAlt: '아무것도아닌',
      minOverlapRate: 0.99,
    });
    const r = planRegeneration({
      bodyKeywords: kw.keywords,
      initialAlignment: bad,
      lang: 'ko',
    });
    if (!r.succeeded) {
      expect(r.finalPrompt.length).toBeGreaterThan(0);
      expect(r.fallbackReason).toMatch(/MAX_ATTEMPTS_EXCEEDED/);
    }
  });
});
