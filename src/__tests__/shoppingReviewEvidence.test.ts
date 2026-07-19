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
import { auditAffiliateReviewDepth } from '../content/affiliateReviewDepth.js';
import {
  buildReviewDecisionBlueprint,
  clusterReviewDecisionEvidence,
} from '../content/reviewDecisionBlueprint.js';

const BATHROOM_REVIEWS = [
  '기존 환풍기 자리가 작아서 천장 타공을 넓히는 설치 과정이 조금 번거로웠어요.',
  '샤워 뒤 10분 정도 돌리니 물기가 빨리 말랐지만 최고 단계 소음은 생각보다 크게 들렸어요.',
];

const FEATURE_PARAPHRASE_DRAFT = `
샤워 뒤 습기가 오래 남는 쪽이 고민이라면 제습 표기에 무게를 둘 수 있어요.
추운 계절 욕실의 차가운 공기가 부담이라면 온풍 표기가 필요합니다.
환기 흐름을 챙기고 싶다면 자동배기를 확인하세요.
바디드라이는 실제 생활에서 필요한 기능인지 생각해 보세요.
`;

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

  it('keeps short but concrete bathroom pain-point reviews that still affect buyer intent', () => {
    const selected = selectDecisionUsefulReviewTexts([
      '물때 안 끼라고 샀어요',
      '소리 안 커서 밤에도 괜찮아요',
      '리뷰 전체 보기',
      '좋아요',
    ]);

    expect(selected).toEqual([
      '물때 안 끼라고 샀어요',
      '소리 안 커서 밤에도 괜찮아요',
    ]);
  });

  it('keeps natural short buyer sentences even when they do not hit a hard-coded anchor keyword', () => {
    const selected = selectDecisionUsefulReviewTexts([
      '마감이 깔끔해서 욕실이 덜 답답해 보여요',
      '리뷰 전체 보기',
    ]);

    expect(selected).toEqual([
      '마감이 깔끔해서 욕실이 덜 답답해 보여요',
    ]);
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
    expect(contract).toContain('REVIEW DECISION BLUEPRINT');
    expect(contract).toContain('설치·교체');
    expect(contract).toContain('온도·습기·성능 체감');
    expect(contract).toContain('소음·진동');
    expect(contract).toContain('첫 두 소제목');
    expect(contract).toContain('상품명·가격·기능명 재설명으로 대체하지 않는다');
  });

  it('returns no review synthesis instructions when no actual review text exists', () => {
    expect(buildAffiliateReviewIntentContract({
      title: '하츠 티오람미니 HMF-J300',
      productSpec: '온풍·제습·환기',
    })).toBe('');
  });

  it('keeps a fallback blueprint and audit signal for natural reviews outside fixed categories', () => {
    const review = '마감이 깔끔해서 욕실이 덜 답답해 보여요';
    const blueprint = buildReviewDecisionBlueprint([review]);
    const report = auditAffiliateReviewDepth({
      title: '욕실 환풍기',
      body: '구매자 후기에서는 마감이 깔끔해 욕실이 덜 답답해 보인다는 의견이 있었어요. 외관 답답함이 신경 쓰인 사람에게 구매 이유가 될 수 있습니다.',
      productReviews: [review],
    });

    expect(blueprint).toContain('기타 구매 결정 장면');
    expect(blueprint).toContain('REVIEW_1');
    expect(report.usedReviewEvidenceCount).toBe(1);
    expect(report.issues.map(issue => issue.code)).not.toContain('REVIEW_PAIN_POINT_UNUSED');
  });

  it('does not count one multi-theme REVIEW_N as multiple independent evidence sources or required headings', () => {
    const review = '기존 환풍기보다 커서 천장 타공 설치가 필요했고, 샤워 뒤 10분 돌리면 물기는 빨리 마르지만 최고 단계 소음이 컸어요.';
    const clusters = clusterReviewDecisionEvidence([review]);
    const clustersBackedOnlyByReviewOne = clusters.filter(cluster => (
      cluster.reviewRefs.length === 1 && cluster.reviewRefs[0] === 'REVIEW_1'
    ));
    const blueprint = buildReviewDecisionBlueprint([review]);

    expect(new Set(clusters.flatMap(cluster => cluster.reviewRefs))).toEqual(new Set(['REVIEW_1']));
    expect(clustersBackedOnlyByReviewOne).toHaveLength(1);
    expect(blueprint).not.toContain('근거 묶음이 2개 이상이면 첫 두 소제목');
  });
});

describe('shopping review depth advisory', () => {
  it('detects feature-name paraphrase that ignores available buyer pain points', () => {
    const report = auditAffiliateReviewDepth({
      title: '하츠 티오람미니 HMF-J300 제습 온풍 자동배기 바디드라이',
      body: FEATURE_PARAPHRASE_DRAFT,
      productReviews: BATHROOM_REVIEWS,
    });

    expect(report.evidenceMode).toBe('review_synthesis');
    expect(report.usedReviewEvidenceCount).toBe(0);
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'REVIEW_PAIN_POINT_UNUSED',
      'REVIEW_USE_OUTCOME_UNUSED',
      'FEATURE_NAME_PARAPHRASE',
    ]));
  });

  it('accepts attributed review pain points connected to outcomes and buyer fit', () => {
    const report = auditAffiliateReviewDepth({
      title: '하츠 티오람미니 HMF-J300',
      body: `구매자 후기 한 건에서는 기존 환풍기 자리보다 본체가 커 천장 타공을 넓히는 설치가 번거로웠다고 했어요.
교체 설치라면 제품값보다 천장 규격을 먼저 재야 하는 이유입니다.
다른 구매자 후기에는 샤워 뒤 10분 정도 작동했을 때 물기가 빨리 말랐다는 평가가 있었지만, 최고 단계 소음은 생각보다 컸다는 의견도 있었어요.
습기 관리가 우선인 욕실에는 장점이지만 야간 소음에 민감하면 낮은 단계를 고려할 수 있습니다.`,
      productReviews: BATHROOM_REVIEWS,
    });

    expect(report.usedReviewEvidenceCount).toBeGreaterThanOrEqual(2);
    expect(report.issues.map(issue => issue.code)).not.toEqual(expect.arrayContaining([
      'REVIEW_PAIN_POINT_UNUSED',
      'REVIEW_USE_OUTCOME_UNUSED',
      'FEATURE_NAME_PARAPHRASE',
    ]));
  });

  it('does not demand buyer experiences when only review UI noise exists', () => {
    const report = auditAffiliateReviewDepth({
      title: '하츠 티오람미니 HMF-J300',
      body: '판매 페이지에서 확인된 제품 정보와 설치 조건을 기준으로 판단합니다.',
      productReviews: ['리뷰 전체 보기 구매 옵션 선택 신고하기'],
    });

    expect(report.evidenceMode).toBe('spec_only');
    expect(report.issues).toEqual([]);
  });
});

describe('review collection wiring', () => {
  it('forces structured shopping evidence collection for review-mode general product URLs', () => {
    const path = fileURLToPath(new URL('../sourceAssembler.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('includeShoppingEvidence');
    expect(source).toContain('forceProductPage');
    expect(source).toContain('buildShoppingEvidenceSnapshot');
    expect(source).toMatch(/productReviews:\s*shoppingEvidence\.productReviews/);
  });

  it('does not let a generic DOM number overwrite a trusted JSON-LD product price', () => {
    const path = fileURLToPath(new URL('../sourceAssembler.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('const structuredSnapshot = puppeteerExtractedData');
    expect(source).toContain('price: structuredSnapshot.price || domExtractedData.price');
    expect(source).toMatch(
      /const priceSelectors = \[\s*\/\/ 구조화 가격[\s\S]{0,300}'meta\[property="og:price:amount"\]'[\s\S]{0,500}'\[class\*="price"\]'/,
    );
  });

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

  it('does not discard short purchase motives in the legacy visible-DOM collector', () => {
    const path = fileURLToPath(new URL('../sourceAssembler.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');

    expect(source).toMatch(/text\s*&&\s*text\.length\s*>=\s*8\s*&&\s*text\.length\s*<\s*500/);
  });
});
