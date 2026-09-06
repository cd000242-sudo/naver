import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  auditReviewVoice,
  buildReviewVoiceDirective,
  describeReviewVoice,
  isAffiliateFirstPersonVoice,
} from '../content/reviewVoiceAudit';

/**
 * [2026-09-06 사장님 "남은것 전부 승인"] 9/6 쇼핑 라이브(2026-09-06T07-20-50) 실측.
 *   1인칭 옵트인 글이 구매자 후기 문장을 그대로 옮기고(5/19 문장), 리뷰어의 "저녁에 30분 2번" ·
 *   "온가족" 을 필자 경험으로 다시 썼다. 진정성 검수는 100/100, [Experience] 는 제약·유보만 봤다 —
 *   어떤 감지기도 후기 원문을 손에 쥐고 본문과 견주지 않았다.
 *   9/3 규칙(feedback_shopping_first_person_voice): 작성자 1인칭이되 숫자 기간·구매·가족은 금지.
 */
const REVIEWS = [
  '출산 후 다리저림이있고 아기를 안는 시간이 많으면서 다리 피로감이 많아져서 사봤어요. 원했던 종아리보단 허벅지쪽 압이 더 잘 들어가는거 같은데 가정용으로 이정도면 괜찮은거 같아요. 다만 설명서가 부족해요.',
  '무릎 내측인대가 파열돼서 거의 3개월 정도 고생하고 있는데, 처음에는 안마도 해보고 폼롤러도 꾸준히 써봤는데, 매번 직접 풀어주는 게 생각보다 번거롭더라고요. 그냥 누워서 착용하고 작동시키면 되니까 제가 따로 힘을 줄 필요도 없고, 운동하고 집에 와서 쉬면서 사용하기 좋았어요. 사용하지 않을 때는 접어서 보관하면 되니까 자리도 거의 차지하지 않고, 안마기처럼 크고 무거운 제품이 아니라 보관하기도 편하네요.',
  '하지정맥이 있는데 요즘 다리가 너무 아파서 닥터웰 공기압 마사지기를 구매해봤습니다! 저녁에 30분 2번 하고 자니 다음 날 다리 부종이 확실히 좋아지네요',
  '처음 일주일은 매일 사용했는데 시간이 지나니 잘 안쓰게 되네요;;; 온가족이 다 사용할 수 있어서 좋아요. 다만 보관통은 따로 준비해야하고 사이즈가 작지 않아서 생각보다 공간차지 많이해요.',
];
const PRODUCT = '닥터웰 종아리 공기압 마사지기 발 장화 안마기 에어웨이브 DR-5180 (그레이)본체+다리';

const LIVE_BODY = [
  '운동을 하고 나면 다리가 뻐근하고 무거워지는 느낌을 자주 받게 되잖아요. 저도 처음에는 안마도 해보고 폼롤러도 꾸준히 써봤는데, 매번 직접 풀어주는 게 생각보다 번거롭더라고요.',
  '근데 그러다 고민 끝에 닥터웰 종아리 공기압 마사지기를 써봤는데, 그냥 누워서 착용하고 작동시키면 되니까 제가 따로 힘을 줄 필요가 없어서 훨씬 편안하게 쉴 수 있었어요.',
  '특히 저녁에 30분씩 두 번 정도 사용하고 나면 다음 날 다리 부종이 좋아지는 느낌을 받았습니다.',
  '근데 나이가 많으신 분들도 어렵지 않게 사용할 수 있는 구조라 온 가족이 함께 쓰기에도 좋더라고요.',
  '사용하지 않을 때는 접어서 보관하면 되니까 자리도 거의 차지하지 않고요. 안마기처럼 크고 무거운 제품이 아니라서 보관 공간에 대한 부담이 적다는 점이 큰 장점예요.',
].join('\n\n');

const CLEAN_BODY = [
  '운동 뒤에 종아리가 무겁게 가라앉는 날이 있어요. 손으로 주무르는 건 금방 팔이 아프고, 폼롤러는 자세 잡기가 귀찮아서 오래 못 갔습니다.',
  '닥터웰 종아리 공기압 마사지기는 바지처럼 다리를 넣고 버튼만 누르면 돼서, 힘을 뺀 채로 누워 있을 수 있다는 게 저한테는 제일 컸어요.',
  '압은 종아리보다 허벅지 쪽이 먼저 차오르는 느낌이라, 종아리만 집중하고 싶으면 단계 조절이 필요합니다. 설명서가 얇아서 모드 차이는 직접 눌러 보며 익혔어요.',
  '유선이라 쓸 때마다 꺼내 꽂는 수고는 있고, 접어도 보관통 자리는 따로 나와야 합니다. 그 정도 번거로움을 감수할 수 있다면 가정용으로는 무난한 선택이에요.',
].join('\n\n');

describe('쇼핑 1인칭 화자 감사 — 후기 원문 복사·리뷰어 주장 이식', () => {
  it('[라이브 실측] 후기 문장을 그대로 옮긴 구간과 리뷰어 수치·가족 주장을 잡는다', () => {
    const audit = auditReviewVoice({ body: LIVE_BODY, reviews: REVIEWS, ignore: [PRODUCT, '다리 공기압 마사지기'] });
    expect(audit.verbatimRuns.length).toBeGreaterThanOrEqual(3);
    expect(audit.verbatimRuns.some((r) => r.text.includes('매번 직접 풀어주는 게 생각보다 번거롭더라고요'))).toBe(true);
    expect(audit.verbatimRuns.some((r) => r.text.includes('안마기처럼 크고 무거운 제품이 아니'))).toBe(true);
    const codes = audit.issues.map((i) => i.code);
    expect(codes).toContain('REVIEW_VERBATIM_COPY');
    expect(codes).toContain('UNSUPPORTED_USAGE_COUNT_CLAIM');
    expect(codes).toContain('UNSUPPORTED_FAMILY_USAGE_CLAIM');
    expect(audit.claimSentences.some((s) => s.includes('30분씩 두 번'))).toBe(true);
    expect(audit.claimSentences.some((s) => s.includes('온 가족'))).toBe(true);
    expect(audit.patchable).toBe(true);
  });

  it('필자의 말로 다시 쓴 본문은 통과한다 — 상품명·검색어 겹침은 복사가 아니다', () => {
    const audit = auditReviewVoice({ body: CLEAN_BODY, reviews: REVIEWS, ignore: [PRODUCT, '다리 공기압 마사지기'] });
    expect(audit.verbatimRuns).toEqual([]);
    expect(audit.issues).toEqual([]);
    expect(audit.patchable).toBe(false);
  });

  it('구매자 말로 중계한 문장(귀속 표지)은 수치·가족 주장으로 세지 않는다 — 그건 진정성 검수 몫', () => {
    const relayed = '한 구매자는 저녁에 30분씩 두 번 쓰고 나니 부종이 빠졌다고 남겼어요. 온 가족이 쓴다는 후기도 있었고요.';
    const audit = auditReviewVoice({ body: relayed, reviews: REVIEWS });
    expect(audit.claimSentences).toEqual([]);
  });

  it('가정·권유 문장은 경험 주장이 아니다', () => {
    const hypothetical = '하루 10분만 써도 종아리가 가벼워질 수 있어요. 가족과 함께 쓰기에도 괜찮을 것 같아요.';
    const audit = auditReviewVoice({ body: hypothetical, reviews: [] });
    expect(audit.claimSentences).toEqual([]);
  });

  it('[라이브 09-42-51 patch 후] 현재 습관형 1인칭("~하고 있답니다")도 수치 주장이다', () => {
    const habitual = '특히 저녁에 30분씩 두 번 정도 사용하고 자면 다음 날 다리 부종이 좋아지는 게 느껴져서 요즘은 운동 후 루틴처럼 챙기고 있답니다.';
    const audit = auditReviewVoice({ body: habitual, reviews: [] });
    expect(audit.issues.map((i) => i.code)).toEqual(['UNSUPPORTED_USAGE_COUNT_CLAIM']);
  });

  it('[라이브 09-42-51 오탐] 숫자 없는 "생각보다 번거롭더라고요" 는 수치 주장이 아니다 — 글자 하나(다·여·일)로 세지 않는다', () => {
    const noNumber = '처음에는 폼롤러를 써보기도 하고 손으로 직접 풀어보기도 했지만, 매번 힘을 들여 마사지하는 게 생각보다 번거롭더라고요.';
    expect(auditReviewVoice({ body: noNumber, reviews: [] }).claimSentences).toEqual([]);
    const loneChar = '여기서 회사 얘기를 했고, 일단 분위기는 좋았어요. 다시 써봤는데 시원했습니다.';
    expect(auditReviewVoice({ body: loneChar, reviews: [] }).claimSentences).toEqual([]);
    expect(auditReviewVoice({ body: '다섯 번 정도 써보니 압이 익숙해졌어요.', reviews: [] }).claimSentences).toHaveLength(1);
  });

  it('구매 사실 주장(샀어요·주문했어요)도 잡는다', () => {
    const audit = auditReviewVoice({ body: '고민하다가 결국 샀어요. 배송은 이틀 만에 받았습니다.', reviews: [] });
    expect(audit.issues.map((i) => i.code)).toContain('UNSUPPORTED_PURCHASE_CLAIM');
    // [라이브 09-46-44 patch 후] 완곡한 구매 표현도 구매 사실이다
    expect(auditReviewVoice({ body: '고민 끝에 이 제품을 들였는데, 바지처럼 입고 버튼만 누르면 됩니다.', reviews: [] }).issues.map((i) => i.code)).toContain('UNSUPPORTED_PURCHASE_CLAIM');
  });

  it('후기가 없으면 복사 판정은 비고, 주장 판정만 돈다', () => {
    const audit = auditReviewVoice({ body: LIVE_BODY, reviews: [] });
    expect(audit.verbatimRuns).toEqual([]);
    expect(audit.issues.map((i) => i.code)).not.toContain('REVIEW_VERBATIM_COPY');
    expect(audit.issues.map((i) => i.code)).toContain('UNSUPPORTED_USAGE_COUNT_CLAIM');
  });

  it('지시문: 옮긴 구간과 주장 문장을 그대로 보여 주고, 비어 있으면 빈 문자열', () => {
    const audit = auditReviewVoice({ body: LIVE_BODY, reviews: REVIEWS, ignore: [PRODUCT] });
    const directive = buildReviewVoiceDirective(audit);
    expect(directive).toContain('후기 원문');
    expect(directive).toContain('매번 직접 풀어주는 게 생각보다 번거롭더라고요');
    expect(directive).toContain('30분씩 두 번');
    expect(buildReviewVoiceDirective(auditReviewVoice({ body: CLEAN_BODY, reviews: REVIEWS, ignore: [PRODUCT] }))).toBe('');
    expect(describeReviewVoice(audit)).toMatch(/^\[ReviewVoice\] ⚠️/);
    expect(describeReviewVoice(auditReviewVoice({ body: CLEAN_BODY, reviews: REVIEWS, ignore: [PRODUCT] }))).toMatch(/^\[ReviewVoice\] ✅/);
  });

  it('감사 대상은 1인칭 옵트인 쇼핑뿐 — 사용자 경험담이 있으면 그 사람 말이므로 제외', () => {
    expect(isAffiliateFirstPersonVoice({ contentMode: 'affiliate', aiExperienceGeneration: true })).toBe(true);
    expect(isAffiliateFirstPersonVoice({ contentMode: 'affiliate', aiExperienceGeneration: true, personalExperience: '직접 두 달 써 본 경험담입니다' })).toBe(false);
    expect(isAffiliateFirstPersonVoice({ contentMode: 'affiliate', aiExperienceGeneration: false })).toBe(false);
    expect(isAffiliateFirstPersonVoice({ contentMode: 'seo', aiExperienceGeneration: true })).toBe(false);
  });
});

describe('contentGenerator 배선 — 소비자는 쇼핑 관통 patch 슬롯(추가 유료 호출 없음)', () => {
  const src = readFileSync(join(__dirname, '..', 'contentGenerator.ts'), 'utf8');
  it('판정 결과를 로그·경고·스탬프로 남기고 patch 사유에 합류한다', () => {
    expect(src).toContain('auditReviewVoice({');
    expect(src).toContain('(optimized as any).__reviewVoice = _reviewVoice;');
    expect(src).toMatch(/const _reviewVoicePatch = Boolean\(_reviewVoiceDirective\);/);
    expect(src).toMatch(/const _allowGatePatch = allowPaidPostGenerationRepair \|\| \(allowThroughlineRepair && \(_throughlinePatch \|\| _reviewVoicePatch\)\);/);
    expect(src).toMatch(/_gateResult\.decision === 'patch' \|\| _humanFloorMiss \|\| _quality90HardMiss \|\| _throughlinePatch \|\| _reviewVoicePatch/);
    expect(src).toMatch(/const _patchDirective = \[_throughlineDirective, _reviewVoiceDirective, _quality90Assessment\?\.directive \|\| _gateResult\?\.retryDirective \|\| ''\]\.filter\(Boolean\)\.join\('\\n'\)/);
  });
  it('patch 뒤에 다시 감사해 남은 위반을 로그로 남긴다(두 번째 patch 는 없다)', () => {
    expect(src).toMatch(/\[ReviewVoice\] patch 후/);
    expect((src.match(/auditReviewVoice\(\{/g) || []).length).toBe(2);
  });
  it('지문 allowlist 에 등록돼 있다', () => {
    expect(readFileSync(join(__dirname, '..', 'contentQualityV3', 'candidateRuntimeFingerprint.ts'), 'utf8')).toContain("'src/content/reviewVoiceAudit.ts'");
  });
});
