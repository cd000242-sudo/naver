import { describe, expect, it } from 'vitest';

import {
  auditAffiliateAuthenticity,
  buildAffiliateAuthenticityContract,
  buildAffiliateTitleEvidenceDirective,
  classifyAffiliateEvidence,
} from '../content/affiliateAuthenticity';

describe('affiliate authenticity contract', () => {
  it('사용자가 직접 입력한 경험만 first_party로 인정한다', () => {
    expect(classifyAffiliateEvidence({
      personalExperience: '퇴근 뒤 거실에서 일주일 동안 사용했고, 저속에서는 조용했지만 최고 단계는 소리가 컸어요.',
      productReviews: ['가볍고 조용하다는 구매자 후기'],
    }).mode).toBe('first_party');

    expect(classifyAffiliateEvidence({
      productReviews: ['가볍고 조용하다는 구매자 후기'],
    }).mode).toBe('review_synthesis');

    expect(classifyAffiliateEvidence({
      productSpec: '무게 680g, 3단 풍속',
      productPrice: '39,900원',
    }).mode).toBe('spec_only');
  });

  it('구매자 리뷰는 작성자의 실사용 증거로 승격하지 않는다', () => {
    const contract = buildAffiliateAuthenticityContract({
      productReviews: ['저속은 조용하지만 최고 단계에서는 소리가 커요.'],
      productSpec: '3단 풍속',
    });

    expect(contract).toContain('REVIEW_SYNTHESIS');
    expect(contract).toContain('구매자 후기');
    expect(contract).toContain('작성자 본인의 체험처럼 바꾸지 않는다');
    expect(contract).toContain('친한 친구');
    expect(contract).not.toContain('이 제품을 구매해서 사용한 실제 소비자');
  });

  it('실사용 근거가 없으면 제목의 체험 후킹을 명시적으로 금지한다', () => {
    const directive = buildAffiliateTitleEvidenceDirective({
      productReviews: ['손잡이가 편하다는 후기'],
    });

    expect(directive).toContain('작성자 실사용 근거 없음');
    expect(directive).toContain('써보니');
    expect(directive).toContain('구매자 후기에서 확인된');
  });

  it('리뷰가 전혀 없으면 제목의 후기·리뷰 표기도 금지한다', () => {
    const directive = buildAffiliateTitleEvidenceDirective({
      productSpec: '3단 풍속',
      productPrice: '45,800원',
    });

    expect(directive).toContain('후기/리뷰/사용기/체험기');

    const report = auditAffiliateAuthenticity({
      title: '지엠지모터스 쿨썸 시트커버 후기',
      body: '제품 페이지의 스펙과 구매 전 확인할 조건을 정리했습니다.',
      evidenceMode: 'spec_only',
    });

    expect(report.hardFail).toBe(true);
    expect(report.issues.some(issue => issue.code === 'UNSUPPORTED_REVIEW_TITLE')).toBe(true);
  });

  it('수집 가격을 현재 판매가로 단정하면 재작성 대상으로 잡는다', () => {
    const unsafe = auditAffiliateAuthenticity({
      title: '지엠지모터스 쿨썸 시트커버 구매 전 확인',
      body: '현재 네이버 스마트스토어에서 45,800원에 판매되고 있습니다.',
      evidenceMode: 'spec_only',
    });
    const safe = auditAffiliateAuthenticity({
      title: '지엠지모터스 쿨썸 시트커버 구매 전 확인',
      body: '수집 당시 판매 페이지 표시 가격은 45,800원이었으며 최신 가격과 옵션은 결제 전에 확인해야 합니다.',
      evidenceMode: 'spec_only',
    });

    expect(unsafe.score).toBeLessThan(85);
    expect(unsafe.issues.some(issue => issue.code === 'UNSAFE_CURRENT_PRICE_CLAIM')).toBe(true);
    expect(safe.issues.some(issue => issue.code === 'UNSAFE_CURRENT_PRICE_CLAIM')).toBe(false);
  });

  it('쉼표 없는 현재 가격 단정도 재작성 대상으로 잡는다', () => {
    const report = auditAffiliateAuthenticity({
      title: '지엠지모터스 쿨썸 시트커버 구매 전 확인',
      body: '현재 가격은 45800원입니다.',
      evidenceMode: 'spec_only',
    });

    expect(report.issues.some(issue => issue.code === 'UNSAFE_CURRENT_PRICE_CLAIM')).toBe(true);
  });

  it('내용 없는 고민 해결 질문으로 시작하는 AI 도입부를 잡는다', () => {
    const report = auditAffiliateAuthenticity({
      title: '지엠지모터스 쿨썸 시트커버 구매 전 확인',
      body: '고민 해결할 수 있을까요? 여름철 차량 운전 시 등 땀으로 불편함을 느끼는 분들이 많습니다.',
      evidenceMode: 'spec_only',
    });

    expect(report.score).toBeLessThan(85);
    expect(report.issues.some(issue => issue.code === 'AI_AGENCY_VOICE')).toBe(true);
  });

  it('리뷰 종합 글에서 가짜 1인칭 사용담은 하드 실패한다', () => {
    const report = auditAffiliateAuthenticity({
      title: '한 달 써본 모노팬 F3 솔직 후기',
      body: '제가 직접 한 달 써보니 저속에서는 조용했고 가족도 좋아하더라고요. 무조건 사세요.',
      evidenceMode: 'review_synthesis',
    });

    expect(report.hardFail).toBe(true);
    expect(report.score).toBeLessThan(70);
    expect(report.issues.some(issue => issue.code === 'FABRICATED_FIRST_PERSON')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'PRESSURE_SALES_COPY')).toBe(true);
  });

  it('구체적이고 솔직한 리뷰 종합형 친구 말투는 통과한다', () => {
    const report = auditAffiliateAuthenticity({
      title: '모노팬 F3, 소음이 걱정이라면 볼 부분',
      body: `선풍기는 풍량보다 소음 때문에 손이 안 가는 경우가 있잖아요. 모노팬 F3는 3단 풍속으로 표기돼 있어요.

구매자 후기에서 반복해서 나온 얘기는 저속은 비교적 조용하지만 최고 단계에서는 소리가 커진다는 점이었어요. 침실에서 약하게 틀어둘 사람과 강한 바람을 오래 쓰는 사람의 판단이 갈릴 만한 부분이죠.

무게는 680g이라 방을 옮겨 다니며 쓰려는 분이 먼저 확인해볼 만해요. 반대로 소음에 아주 예민하고 최고 풍량을 자주 쓴다면 다른 선택지도 같이 보는 편이 낫겠습니다.

현재 가격과 옵션은 바뀔 수 있으니 결제 전 상품 페이지에서 한 번 더 확인해보세요.`,
      evidenceMode: 'review_synthesis',
    });

    expect(report.hardFail).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(85);
  });

  it('광고대행사 브리핑과 근거 없는 긴급 문구를 함께 잡는다', () => {
    const report = auditAffiliateAuthenticity({
      title: '역대급 최저가, 오늘만 놓치면 후회',
      body: '이번 포스팅에서는 구매 욕구를 자극할 핵심 포인트를 알아보겠습니다. 품절 임박이니 지금 바로 구매하세요.',
      evidenceMode: 'spec_only',
    });

    expect(report.hardFail).toBe(true);
    expect(report.issues.some(issue => issue.code === 'AI_AGENCY_VOICE')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'UNSUPPORTED_URGENCY')).toBe(true);
  });
});
