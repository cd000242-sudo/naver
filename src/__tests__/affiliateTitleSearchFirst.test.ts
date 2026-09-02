import { describe, expect, it } from 'vitest';

import { buildAffiliateTitleEvidenceDirective } from '../content/affiliateAuthenticity';
import { evaluateTitleQuality } from '../contentTitleEvaluator';
import { scoreSearchPhraseIntact } from '../content/titleModeObjective';

/**
 * [2026-09-02 사장님] "팔린다 → 고객이 본다 → 노출된다 → 상위노출될 제목을 쓴다."
 * 제목의 첫 임무는 검색에 걸리는 것이다. 쇼핑 제목 지시에 검색어 위치가 없었고, 맞물림 채점은
 * 낱말이 흩어져 있어도 만점이었다(닥터웰: "종아리"와 "마사지기"가 떨어져 있어도 0점 감점).
 */
const KW = '닥터웰 종아리 마사지기';

describe('쇼핑 제목 지시 — 검색어를 그대로 앞쪽에', () => {
  it('세 근거 모드 모두 같은 지시를 받는다', () => {
    for (const input of [
      { productReviews: ['소음이 적어요'] },
      {},
      { personalExperience: '두 달째 매일 밤 15분씩 씁니다. 첫 주엔 1단으로 썼어요.' },
    ]) {
      const d = buildAffiliateTitleEvidenceDirective(input as never);
      expect(d).toContain('그대로 붙여서 제목 앞쪽');
      expect(d).toContain('검색어 → 상황');
    }
  });
});

describe('검색어 구절 온전성 (쇼핑)', () => {
  it('구절이 토막 나 있으면 감점 — 닥터웰 실측 후보 2번', () => {
    const v = scoreSearchPhraseIntact('닥터웰 에어웨이브 DR-5180 공기압 마사지기, 종아리 압박 위치 후기', KW, 'affiliate');
    expect(v.points).toBeLessThan(0);
    expect(v.reason).toContain('토막');
  });

  it('구절이 그대로 앞쪽에 있으면 0', () => {
    expect(scoreSearchPhraseIntact('닥터웰 종아리 마사지기, 어르신 선물 전에 볼 압박 위치', KW, 'affiliate').points).toBe(0);
  });

  it('구절은 있지만 뒤로 밀렸으면 약하게 감점', () => {
    const v = scoreSearchPhraseIntact('어르신 선물로 고민하다 고른 바지형 공기압 안마기, 닥터웰 종아리 마사지기', KW, 'affiliate');
    expect(v.points).toBeLessThan(0);
    expect(v.points).toBeGreaterThan(-10);
  });

  it('쇼핑이 아니면 손대지 않는다 — SEO 는 자기 스캐너가 있다', () => {
    expect(scoreSearchPhraseIntact('아무 제목', KW, 'seo').points).toBe(0);
    expect(scoreSearchPhraseIntact('아무 제목', KW, 'homefeed').points).toBe(0);
  });

  it('평가기에 배선 — 온전한 제목이 토막 난 제목보다 높다', () => {
    const intact = evaluateTitleQuality('닥터웰 종아리 마사지기, 어르신 선물 전에 볼 압박 위치', KW, 'affiliate' as never);
    const broken = evaluateTitleQuality('닥터웰 에어웨이브 DR-5180 공기압 마사지기, 종아리 압박 위치 후기', KW, 'affiliate' as never);
    expect(intact.score).toBeGreaterThan(broken.score);
    expect(broken.issues.join(' ')).toMatch(/토막/u);
  });
});
