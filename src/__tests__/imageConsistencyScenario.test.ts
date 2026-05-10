/**
 * SPEC-CONVERSION-001 L3-3.5 — 이미지 일관성 통합 시나리오 테스트.
 *
 * 흐름:
 *   본문 → keywordExtractor → keywordImagePromptBuilder
 *        → imageBodyAlignmentVerifier → (실패 시) imageRegenerationStrategy
 */

import { describe, it, expect } from 'vitest';
import { extractKeywords } from '../content/keywordExtractor';
import { buildKeywordImagePrompt } from '../image/keywordImagePromptBuilder';
import { verifyImageBodyAlignment, buildAlignmentRetryHint } from '../image/imageBodyAlignmentVerifier';
import { planRegeneration } from '../image/imageRegenerationStrategy';

const sampleBody = [
  '# 강남 카페 인테리어 후기',
  '',
  '카페 인테리어가 정말 좋았어요. 분위기가 깔끔했어요. '.repeat(15),
  '',
  '## 메뉴 구성',
  '',
  '카페 메뉴는 다양했어요. 디저트와 커피가 인상적이었어요. '.repeat(10),
  '',
  '## 좌석·공간',
  '',
  '카페 공간이 넓었어요. 좌석이 편안했어요. 인테리어 디테일도 좋았어요. '.repeat(10),
].join('\n');

describe('이미지 일관성 시나리오 — 정상 흐름', () => {
  it('본문 → 키워드 → 이미지 프롬프트 → alignment 통과', () => {
    const kwResult = extractKeywords({
      bodyText: sampleBody,
      title: '강남 카페 인테리어 후기',
      maxKeywords: 8,
    });
    expect(kwResult.keywords.length).toBeGreaterThan(2);

    const imgPrompt = buildKeywordImagePrompt({
      keywords: kwResult.keywords,
      lang: 'ko',
      headingHint: '강남 카페 인테리어',
      maxKeywords: 4,
    });
    expect(imgPrompt.prompt).toContain('카페');
    expect(imgPrompt.prompt).toContain('인테리어');

    const alignment = verifyImageBodyAlignment({
      bodyKeywords: kwResult.keywords,
      imagePromptOrAlt: imgPrompt.prompt,
      minOverlapRate: 0.4,
    });
    expect(alignment.aligned).toBe(true);
    expect(alignment.matchedKeywords.length).toBeGreaterThan(0);
  });
});

describe('이미지 일관성 시나리오 — 불일치 감지·재생성', () => {
  it('잘못된 이미지 프롬프트 감지 + 재생성 전략 통과', () => {
    const kwResult = extractKeywords({
      bodyText: sampleBody,
      title: '강남 카페 인테리어 후기',
      maxKeywords: 8,
    });

    // 일부러 본문과 무관한 이미지 프롬프트 (잘못된 생성 결과 시뮬레이션)
    const badPrompt = '도쿄 거리 풍경, 자동차, 야경';
    const badAlignment = verifyImageBodyAlignment({
      bodyKeywords: kwResult.keywords,
      imagePromptOrAlt: badPrompt,
      minOverlapRate: 0.4,
    });
    expect(badAlignment.aligned).toBe(false);
    expect(badAlignment.reason).toMatch(/OVERLAP_TOO_LOW/);

    // retry 안내문 생성
    const retryHint = buildAlignmentRetryHint(badAlignment);
    expect(retryHint).toContain('정렬 실패');

    // 재생성 전략 실행
    const regen = planRegeneration({
      bodyKeywords: kwResult.keywords,
      headingHint: '강남 카페 인테리어',
      initialAlignment: badAlignment,
      lang: 'ko',
    });
    expect(regen.attempts.length).toBeGreaterThan(0);
    if (regen.succeeded) {
      expect(regen.finalPrompt).toContain('카페');
    } else {
      // 모든 시도 실패해도 최고 overlap 시도는 반환
      expect(regen.attempts[0].alignment.overlapRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('이미 aligned=true면 재생성 스킵', () => {
    const kwResult = extractKeywords({ bodyText: sampleBody, title: '카페' });
    const goodAlignment = verifyImageBodyAlignment({
      bodyKeywords: kwResult.keywords,
      imagePromptOrAlt: '카페 인테리어 메뉴',
      minOverlapRate: 0.3,
    });
    expect(goodAlignment.aligned).toBe(true);

    const regen = planRegeneration({
      bodyKeywords: kwResult.keywords,
      initialAlignment: goodAlignment,
    });
    expect(regen.succeeded).toBe(true);
    expect(regen.attempts).toHaveLength(0);
    expect(regen.fallbackReason).toMatch(/ALREADY_ALIGNED/);
  });

  it('빈 키워드 입력은 명시 fallback', () => {
    const regen = planRegeneration({
      bodyKeywords: [],
      initialAlignment: {
        aligned: false, overlapRate: 0, matchedKeywords: [],
        missingFromImage: [], extraInImage: [],
      },
    });
    expect(regen.succeeded).toBe(false);
    expect(regen.fallbackReason).toMatch(/BODY_KEYWORDS_EMPTY/);
  });
});

describe('이미지 일관성 시나리오 — 결정론', () => {
  it('같은 본문은 같은 키워드·이미지 프롬프트 (결정론)', () => {
    const a = extractKeywords({ bodyText: sampleBody });
    const b = extractKeywords({ bodyText: sampleBody });
    expect(a.keywords.map((k) => k.term)).toEqual(b.keywords.map((k) => k.term));

    const promptA = buildKeywordImagePrompt({ keywords: a.keywords, lang: 'en' });
    const promptB = buildKeywordImagePrompt({ keywords: b.keywords, lang: 'en' });
    expect(promptA.prompt).toBe(promptB.prompt);
  });
});
