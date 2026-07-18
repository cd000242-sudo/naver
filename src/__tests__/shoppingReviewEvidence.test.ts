import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  selectDecisionUsefulReviewTexts,
} from '../crawler/shopping/utils/reviewTextSelection.js';
import {
  buildAffiliateReviewIntentContract,
  classifyAffiliateEvidence,
} from '../content/affiliateAuthenticity.js';

describe('shopping review evidence selection', () => {
  it('keeps concrete pain points, workarounds, and outcomes while dropping UI noise and empty praise', () => {
    const selected = selectDecisionUsefulReviewTexts([
      '리뷰',
      '좋아요',
      '옵션 선택 상품 보기 신고하기',
      '기존 환풍기 자리가 작아서 천장 타공을 넓히는 과정이 조금 힘들었어요.',
      '씻기 10분 전에 온풍을 켜두니 욕실 한기가 덜했고, 사용 후 물기도 빨리 말랐습니다.',
      '저단은 괜찮지만 최고 단계에서는 소리가 생각보다 크게 들렸어요.',
      '기존 환풍기 자리가 작아서 천장 타공을 넓히는 과정이 조금 힘들었어요.',
    ]);

    expect(selected).toEqual(expect.arrayContaining([
      expect.stringContaining('천장 타공'),
      expect.stringContaining('10분 전에 온풍'),
      expect.stringContaining('최고 단계에서는 소리'),
    ]));
    expect(selected).toHaveLength(3);
    expect(selected.join(' ')).not.toMatch(/신고하기|옵션 선택|^좋아요$/);
  });

  it('does not manufacture or paraphrase reviewer claims during selection', () => {
    const source = '필터를 분리해서 씻는 과정이 번거롭지만 건조 속도는 만족스러웠어요.';
    expect(selectDecisionUsefulReviewTexts([source])).toEqual([source]);
  });
});

describe('shopping review intent contract', () => {
  it('does not let review UI noise suppress the truthful spec-only fallback', () => {
    expect(classifyAffiliateEvidence({
      productReviews: ['리뷰 전체 보기 구매 옵션 선택 신고하기'],
    }).mode).toBe('spec_only');
  });

  it('turns actual buyer reviews into problem-solution purchase decisions instead of obvious spec narration', () => {
    const contract = buildAffiliateReviewIntentContract({
      title: '하츠 티오람미니 HMF-J300',
      productReviews: [
        '기존 환풍기 자리가 작아서 천장 타공을 넓히는 과정이 조금 힘들었어요.',
        '씻기 10분 전에 온풍을 켜두니 욕실 한기가 덜했고, 사용 후 물기도 빨리 말랐습니다.',
        '저단은 괜찮지만 최고 단계에서는 소리가 생각보다 크게 들렸어요.',
      ],
      productSpec: '타공 272x272mm, 소음 43dB, 온풍·제습·환기',
    });

    expect(contract).toContain('REVIEW SEARCH INTENT');
    expect(contract).toContain('반복 불편');
    expect(contract).toContain('설치');
    expect(contract).toContain('해결');
    expect(contract).toContain('구매자 후기');
    expect(contract).toContain('천장 타공');
    expect(contract).toContain('10분 전에 온풍');
    expect(contract).toContain('최고 단계에서는 소리');
    expect(contract).toContain('누구나 아는');
    expect(contract).toContain('한 줄 판정');
  });

  it('returns no review synthesis instructions when no actual review text exists', () => {
    expect(buildAffiliateReviewIntentContract({
      title: '하츠 티오람미니 HMF-J300',
      productSpec: '온풍·제습·환기',
    })).toBe('');
  });
});

describe('review collection wiring', () => {
  it('requests visible review text collection in the maintained brand-store affiliate path', () => {
    const path = fileURLToPath(new URL('../crawler/shopping/brandStoreAffiliateCrawler.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('includeReviewTexts: true');
    expect(source).toContain('selectDecisionUsefulReviewTexts(collection.productInfo?.reviewTexts)');
    expect(source).toMatch(/\{\s*reviewTexts\s*\}/);
    expect(source).toMatch(/\{\s*reviewCount\s*\}/);
  });

  it('merges visible review text with JSON-LD in the brandconnect redirect path', () => {
    const path = fileURLToPath(new URL('../crawler/productSpecCrawler.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('selectDecisionUsefulReviewTexts');
    expect(source).toContain('visibleReviewTexts');
    expect(source).toMatch(/reviewTexts:\s*collectedReviewTexts/);
  });
});
