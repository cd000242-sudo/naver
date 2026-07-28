import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { buildAffiliateConversionStructureContract } from '../content/affiliateConversionStructure';
import {
  auditAffiliateAuthenticity,
  buildAffiliateTitleEvidenceDirective,
} from '../content/affiliateAuthenticity';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 사용자 제공 "고조회 상세페이지 구조"의 근거 게이트 채택 잠금.
 * 10단 골격 + EEAT + 제목 공식 5종 + 심의 가드(보장·한정 문형 하드 삭제).
 */
describe('affiliate 10-step conversion structure (EEAT)', () => {
  it('10단이 순서대로 존재하고 근거 게이트가 걸려 있다', () => {
    const contract = buildAffiliateConversionStructureContract({});
    for (const step of ['1. 후킹', '2. 문제 제기', '3. 해결책 제시', '4. 사회적 증거',
      '5. 스토리텔링', '6. 시각적 분할', '7. 긴급성', '8. 행동 유도(CTA)', '9. 안전장치', '10. 클로징']) {
      expect(contract).toContain(step);
    }
    // 근거 게이트: 없는 단계는 조용히 생략 + 재고/마감 날조 금지
    expect(contract).toContain('근거가 없으면');
    expect(contract).toContain('재고 수량·마감 시한을 만들어내지 않는다');
    expect(contract).toContain('[심의 가드 — 생성 단계 금지]');
    // EEAT 4신호
    for (const sig of ['Experience', 'Expertise', 'Authoritativeness', 'Trust']) {
      expect(contract).toContain(sig);
    }
  });

  it('스토리텔링 단계: 직접 사용 메모 유무로 1인칭/2인칭이 갈린다', () => {
    const without = buildAffiliateConversionStructureContract({});
    const withMemo = buildAffiliateConversionStructureContract({ personalExperience: '한 달간 매일 사용하며 소음을 측정했다' });
    expect(without).toContain('2인칭으로 시뮬레이션');
    expect(without).toContain('위장하지 않는다');
    expect(withMemo).toContain('1인칭 장면으로 쓴다');
  });

  it('제목 공식 5종이 3개 근거 모드 전부에 주입된다', () => {
    for (const input of [
      { personalExperience: '실제로 두 달 써 본 경험 메모입니다' },
      { productReviews: ['설치가 생각보다 오래 걸렸지만 소음은 확실히 줄었어요. 조용해져서 만족합니다.'] },
      {},
    ]) {
      const directive = buildAffiliateTitleEvidenceDirective(input as any);
      expect(directive).toContain('[제목 공식');
      expect(directive).toContain('문제 해결형');
      expect(directive).toContain('비교·대조형');
      expect(directive).toContain('본문 도입부가 직접 답해야 한다');
    }
  });

  it('심의 가드(결정론): 결과 보장·가짜 한정 문형이 hard 이슈로 걸린다', () => {
    const guarantee = auditAffiliateAuthenticity({
      title: '공기청정기 고르기 전 확인할 3가지',
      body: '이 제품을 쓰면 무조건 좋아집니다. 단 2주 만에 문의가 3배 늘었습니다. 매출은 자연스럽게 따라옵니다.',
      evidenceMode: 'spec_only',
    });
    expect(guarantee.issues.some(i => i.code === 'PRESSURE_SALES_COPY' && i.hard)).toBe(true);

    const urgency = auditAffiliateAuthenticity({
      title: '공기청정기 고르기 전 확인할 3가지',
      body: '재고 30개 남았습니다. 이번 주까지만 이 가격입니다.',
      evidenceMode: 'spec_only',
    });
    expect(urgency.issues.some(i => i.code === 'UNSUPPORTED_URGENCY')).toBe(true);
  });

  it('finalContract 배선: 후기형/전문가형 공통으로 10단 골격이 부착된다', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/buildAffiliateConversionStructureContract\(source as any\),[\s\S]{0,300}isExpertAnalysis \? '' : buildAffiliateReviewIntentContract\(source\)/);
  });

  it('이미지 링크: 개별 image.link가 발행 루프에서 실제로 읽힌다 (죽은 기능 배선)', () => {
    const imageHelpers = read('automation/imageHelpers.ts');
    expect(imageHelpers).toContain('const perImageLink');
    expect(imageHelpers).toMatch(/effectiveLinkUrl = perImageLink \|\| linkUrl/);
    // 전체 링크 원복 유지 (원샷 게이트 재도입 금지)
    expect(imageHelpers).not.toMatch(/self\.__affiliateProductImageLinkAttached !== true/);
  });
});
