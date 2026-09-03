import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  auditAffiliateAuthenticity,
  buildAffiliateAuthenticityContract,
  buildAffiliateReviewIntentContract,
  buildAffiliateTitleEvidenceDirective,
} from '../content/affiliateAuthenticity';
import { auditAffiliateReviewDepth } from '../content/affiliateReviewDepth';
import { buildAffiliateConversionStructureContract } from '../content/affiliateConversionStructure';
import { buildReviewGuardBlock } from '../content/reviewGuard';
import { buildContentQualityV3Prompt, createContentQualityV3InitialPromptOptions } from '../contentQualityV3/prompt';

/**
 * [2026-09-03 사장님] "1인칭시점에서 글이나와야지 자꾸 개인경험으로읽어야된다 후기가이렇다 이런식으로 넣지말라니까..??
 *   누가봐도 경험없이 다른경험을 설명해주는느낌이자나"
 * AI 경험 옵트인이 켜지면: 후기의 사실을 재료로 작성자 1인칭 체험으로 쓴다. 중계 문장은 실패다.
 * 지어내면 안 되는 것은 그대로다: 숫자 기간·구매 시점·내돈내산·가족 반응.
 */
const reviews = [
  '뚜껑이 뻑뻑해서 처음 열 때 손이 아팠어요. 그래도 밀폐는 확실합니다.',
  '누워서 써도 소음이 거슬리지 않아요. 무게는 좀 나갑니다.',
  '배송 빠르고 포장 꼼꼼했어요. 크기가 생각보다 커요.',
];
const optIn = { productReviews: reviews, aiExperienceGeneration: true, personalExperience: '' };
const optOut = { productReviews: reviews, aiExperienceGeneration: false, personalExperience: '' };

describe('AI 경험 옵트인 — 작성자 1인칭 체험 (쇼핑)', () => {
  it('계약: 옵트인이면 1인칭 화자 블록이 붙고 중계 문장이 금지된다', () => {
    const contract = buildAffiliateAuthenticityContract(optIn);
    expect(contract).toContain('작성자 1인칭 체험');
    expect(contract).toMatch(/"후기에서는", "구매자들은"/u);
    expect(contract).toMatch(/숫자 기간/u);
    expect(buildAffiliateAuthenticityContract(optOut)).not.toContain('작성자 1인칭 체험');
  });

  it('후기 의도 계약: 옵트인이면 화자 규칙이 1인칭으로 바뀌고 "직접 경험으로 바꾸지 않는다"가 사라진다', () => {
    const on = buildAffiliateReviewIntentContract(optIn);
    const off = buildAffiliateReviewIntentContract(optOut);
    expect(on).toContain('작성자가 직접 겪은 1인칭 체험으로 쓴다');
    expect(on).not.toContain('작성자의 직접 경험으로 바꾸지 않는다');
    expect(on).toContain('내가 겪던 구체 상황');
    expect(off).toContain('작성자의 직접 경험으로 바꾸지 않는다');
    expect(off).not.toContain('작성자가 직접 겪은 1인칭 체험으로 쓴다');
  });

  it('제목: 옵트인이면 체험 훅 허용, 출처 표기 제목·숫자 기간·내돈내산 금지', () => {
    const directive = buildAffiliateTitleEvidenceDirective(optIn);
    expect(directive).toContain('1인칭 체험 제목');
    expect(directive).toMatch(/"직접 써보니"/u);
    expect(directive).toMatch(/내돈내산/u);
    expect(buildAffiliateTitleEvidenceDirective(optOut)).toContain('REVIEW_SYNTHESIS — 작성자 실사용 근거 없음');
  });

  it('감사: 옵트인이면 1인칭 체험은 날조가 아니고, 후기 중계 문장이 문제가 된다', () => {
    const firstPerson = '제가 써보니 뚜껑이 뻑뻑해서 처음엔 손이 아팠어요. 그래도 밀폐는 확실했습니다. 누워서 써도 소음이 거슬리지 않더라고요. 무게는 좀 나갑니다. 크기가 생각보다 커서 자리를 먼저 보는 게 좋습니다. 배송은 빨랐고 포장도 꼼꼼했어요. 저는 이 정도면 쓸 만하다고 봅니다.';
    const relay = '구매자 후기에서는 뚜껑이 뻑뻑하다는 의견이 있었습니다. 또 다른 구매자는 소음이 거슬리지 않는다고 합니다. 후기를 보면 크기가 크다는 말도 있습니다. 배송이 빨랐다는 후기도 있었습니다. 전체적으로 만족한다는 의견이 이어집니다. 무게가 나간다는 의견도 있었습니다.';
    const on = auditAffiliateAuthenticity({ body: firstPerson, evidenceMode: 'review_synthesis', aiExperienceOptIn: true });
    expect(on.issues.map(i => i.code)).not.toContain('FABRICATED_FIRST_PERSON');
    expect(on.issues.map(i => i.code)).not.toContain('MISSING_REVIEW_ATTRIBUTION');
    const relayOn = auditAffiliateAuthenticity({ body: relay, evidenceMode: 'review_synthesis', aiExperienceOptIn: true });
    expect(relayOn.issues.map(i => i.code)).toContain('REVIEW_RELAY_VOICE');
    // 옵트인이 꺼져 있으면 예전 계약 그대로 — 1인칭은 날조
    const off = auditAffiliateAuthenticity({ body: firstPerson, evidenceMode: 'review_synthesis' });
    expect(off.issues.map(i => i.code)).toContain('FABRICATED_FIRST_PERSON');
  });

  it('감사: 옵트인 중에도 숫자 기간은 잡는다 — "써보니"는 되고 "한 달 써보니"는 안 된다', () => {
    const duration = '한 달 써보니 뚜껑이 부드러워졌어요. 소음도 거슬리지 않습니다. 크기는 큰 편이라 자리를 먼저 보세요. 배송은 빨랐습니다. 포장도 꼼꼼했어요. 저는 만족합니다.';
    const report = auditAffiliateAuthenticity({ body: duration, evidenceMode: 'review_synthesis', aiExperienceOptIn: true });
    expect(report.issues.map(i => i.code)).toContain('UNSUPPORTED_DURATION_CLAIM');
    expect(report.hardFail).toBe(false);
  });

  it('후기 깊이 감사: 옵트인이면 출처 표기 누락을 문제 삼지 않고 지시도 1인칭이다', () => {
    const body = '제가 써보니 뚜껑이 뻑뻑해서 처음 열 때 손이 아팠어요. 밀폐는 확실합니다. 누워서 써도 소음이 거슬리지 않았고 무게는 좀 나갑니다. 크기가 생각보다 커요.';
    const on = auditAffiliateReviewDepth({ title: 't', body, productReviews: reviews, aiExperienceOptIn: true });
    expect(on.issues.map(i => i.code)).not.toContain('MISSING_REVIEW_ATTRIBUTION');
    expect(on.retryDirective).not.toContain('출처를 분명히 한다');
    const off = auditAffiliateReviewDepth({ title: 't', body, productReviews: reviews });
    expect(off.issues.map(i => i.code)).toContain('MISSING_REVIEW_ATTRIBUTION');
  });

  it('리뷰 부재 가드·전환 골격: 옵트인이면 1인칭 체험을 허용한다', () => {
    const guard = buildReviewGuardBlock({ reviewCount: 0, hasSpec: true, hasPrice: false, aiExperienceOptIn: true });
    expect(guard).toContain('작성자 1인칭 체험으로 쓴다');
    expect(guard).not.toContain('과거 체험 주장 금지는 그대로다');
    const structure = buildAffiliateConversionStructureContract({ personalExperience: '', aiExperienceGeneration: true });
    expect(structure).toContain('작성자가 직접 겪은 1인칭 장면');
    expect(structure).not.toContain('2인칭으로 시뮬레이션');
  });

  it('체크박스 기본값은 켬 — 사장님은 켜는 걸 모른 채 "왜 3인칭이냐"고 물었다', () => {
    const html = readFileSync(resolve(__dirname, '..', '..', 'public', 'index.html'), 'utf-8');
    expect(html).toMatch(/id="ai-experience-generation" checked/u);
  });

  it('V3 프롬프트: 옵트인이면 화자 오버라이드가 붙고, 꺼지거나 메모가 있으면 붙지 않는다', () => {
    const base = { contentMode: 'affiliate', rawText: '제품 설명 원문. 뚜껑이 뻑뻑하다. 밀폐가 확실하다.', productReviews: reviews, metadata: { keywords: ['밀폐용기'] } };
    const on = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({ mode: 'affiliate', source: { ...base, aiExperienceGeneration: true }, minChars: 1500 }));
    expect(on).toContain('[VOICE_OVERRIDE: FIRST_PERSON_EXPERIENCE');
    const off = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({ mode: 'affiliate', source: { ...base, aiExperienceGeneration: false }, minChars: 1500 }));
    expect(off).not.toContain('VOICE_OVERRIDE');
    const memo = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({ mode: 'affiliate', source: { ...base, aiExperienceGeneration: true, personalExperience: '제가 3년째 쓰는 통입니다. 뚜껑이 뻑뻑합니다.' }, minChars: 1500 }));
    expect(memo).not.toContain('VOICE_OVERRIDE');
  });

  // [2026-09-03 사장님 실제 발행글 224399398683 "누가 이걸 구매하고싶어하냐"] — 옛 감사는 이 글을 90점으로 통과시켰다.
  it('사장님 글 실측: 구매자 중계·면책 해설·인증 나열을 감사가 잡는다', () => {
    const body = [
      '구매자 반응에는 압박과 시간 조절, 접는 보관의 편의가 있었지만 유선 사용·소음·설명서 부족도 함께 나옵니다.',
      '복싱 뒤 다리가 뻐근했던 구매자는 운동 뒤 쉬면서 쓰기 편했다고 남겼어요. 한 구매자는 3단을 선호했고 20분 정도 사용했다고 적었습니다.',
      '이 변화는 해당 구매자의 경험이며, 다리 상태에 대한 결과를 제품 전체의 결과로 묶어 말할 수는 없어요.',
      '충전 없이 바로 놓는 방식으로 해석할 근거는 없으므로 선을 연결해 쓰는 흐름이 괜찮은 사람에게 맞습니다.',
      'KC 인증정보는 HU071627-18006F, HU072737-20002C 입니다. 제조국은 중국산(닥터웰)입니다.',
    ].join(' ');
    const report = auditAffiliateAuthenticity({ body, evidenceMode: 'review_synthesis', aiExperienceOptIn: true });
    const codes = report.issues.map(i => i.code);
    expect(codes).toContain('REVIEW_RELAY_VOICE');
    expect(codes).toContain('EVIDENCE_META_NARRATED');
    expect(codes).toContain('SPEC_DUMP');
    expect(report.score).toBeLessThan(85);
    // 면책 해설은 옵트인과 무관하게 잡는다
    const offCodes = auditAffiliateAuthenticity({ body, evidenceMode: 'review_synthesis' }).issues.map(i => i.code);
    expect(offCodes).toContain('EVIDENCE_META_NARRATED');
    // 1인칭으로 제대로 쓴 글은 깨끗하다
    const good = '제가 써보니 바지처럼 입는 방식이라 누워서 바로 켜기 편했어요. 3단으로 20분 정도 쓰면 다리가 가벼워집니다. 소음은 있는 편이라 조용한 방에서는 거슬릴 수 있어요. 유선이라 쓸 때마다 꺼내야 하는 건 불편했습니다. 저는 운동 많이 한 날 관리용으로는 추천하고, 조용한 무선을 원하면 다른 걸 보라고 하겠습니다.';
    const clean = auditAffiliateAuthenticity({ body: good, evidenceMode: 'review_synthesis', aiExperienceOptIn: true });
    expect(clean.issues.map(i => i.code)).not.toContain('REVIEW_RELAY_VOICE');
    expect(clean.issues.map(i => i.code)).not.toContain('FABRICATED_FIRST_PERSON');
    expect(clean.issues.map(i => i.code)).not.toContain('EVIDENCE_META_NARRATED');
  });
});
