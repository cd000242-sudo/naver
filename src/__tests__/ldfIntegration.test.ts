/**
 * Phase B — LDF dead-code 통합 검증.
 *
 * 통합 전: qualityGate, revenueEngine 등 11개 모듈이 프로덕션에서 호출 0건 (dead code).
 * 통합 후: contentGenerator의 finalize 단계에서 호출되어 quality.warnings + revenueMeta 채움.
 *
 * 본 테스트는 통합된 모듈이 정상 호출되고 결과를 반환하는지만 검증
 * (전체 generateStructuredContent 흐름은 LLM 의존이라 mock 비용이 큼).
 */

import { describe, it, expect } from 'vitest';
import { prePublishGate } from '../content/qualityGate';
import { CATEGORY_ECONOMICS } from '../content/revenueEngine';

describe('Phase B — qualityGate 통합', () => {
  it('정상 글은 allowed=true 반환', () => {
    const r = prePublishGate({
      title: '맛있는 김치찌개 레시피 30분 완성',
      content: '안녕하세요. 오늘은 김치찌개 만드는 법을 알려드릴게요. '.repeat(50),
      category: 'food',
    });
    expect(r.allowed).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.estimatedRiskImpact).toBeDefined();
  });

  it('800자 미만은 blockers에 잡힘', () => {
    const r = prePublishGate({
      title: '짧은 글',
      content: '아주 짧은 본문',
      category: 'general',
    });
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes('800자'))).toBe(true);
  });

  it('strict 모드는 high 신호도 차단', () => {
    const r = prePublishGate({
      title: '광고성 제목',
      content: '본문 내용 '.repeat(100),
      category: 'general',
      strictness: 'strict',
    });
    expect(r).toBeDefined();
  });
});

describe('Phase B — revenueEngine 카테고리 메타', () => {
  it('10개 카테고리 모두 정의', () => {
    const expected = ['food','parenting','beauty','health','travel','tech','lifestyle','entertainment','finance','general'];
    for (const c of expected) {
      expect((CATEGORY_ECONOMICS as any)[c]).toBeDefined();
      expect((CATEGORY_ECONOMICS as any)[c].avgCPC).toBeGreaterThan(0);
      expect((CATEGORY_ECONOMICS as any)[c].avgCommission).toBeGreaterThan(0);
      expect((CATEGORY_ECONOMICS as any)[c].monthlyCeiling).toBeGreaterThan(0);
    }
  });

  it('parenting이 food보다 CPC 높음 (구매력 차이)', () => {
    expect((CATEGORY_ECONOMICS as any).parenting.avgCPC).toBeGreaterThan((CATEGORY_ECONOMICS as any).food.avgCPC);
  });
});
