/**
 * blueOceanTier2Fallback.test.ts
 *
 * [2026-07-04] 광고 API(정확 검색량)가 없는 사용자(부업러 대부분)도 블루오션 자동선정이
 * 되도록 Tier 2 폴백을 검증한다. calcBlueOceanScore는 searchVolume>0이 필수라 광고 API 없으면
 * 빈 결과였는데, estimateBlueOceanScoreWithoutAd가 문서량(경쟁도, 검색 API 실측)을 주축으로
 * '저경쟁 롱테일'을 선별한다.
 */
import { describe, it, expect } from 'vitest';
import { estimateBlueOceanScoreWithoutAd } from '../analytics/keywordAnalyzer';

describe('블루오션 Tier 2 폴백 (광고 API 없이 문서량 기반)', () => {
  it('저경쟁(문서 적음) 롱테일은 광고 API 없이도 선정된다', () => {
    const r = estimateBlueOceanScoreWithoutAd('medium', 1000, 0);
    expect(r.qualifies).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(45);
  });

  it('고경쟁(문서 5만 초과)은 탈락한다 (레드오션 차단)', () => {
    const r = estimateBlueOceanScoreWithoutAd('high', 200000, 0);
    expect(r.qualifies).toBe(false);
  });

  it('문서량이 적을수록 점수가 높다 (경쟁도 축 실측)', () => {
    const few = estimateBlueOceanScoreWithoutAd('medium', 500, 0).score;
    const many = estimateBlueOceanScoreWithoutAd('medium', 45000, 0).score;
    expect(few).toBeGreaterThan(many);
  });

  it('연관검색어 순서가 앞일수록(수요 프록시) 점수가 높다', () => {
    const first = estimateBlueOceanScoreWithoutAd('medium', 3000, 0).score;
    const later = estimateBlueOceanScoreWithoutAd('medium', 3000, 12).score;
    expect(first).toBeGreaterThan(later);
  });

  it('문서량 0(측정 실패)은 선정하지 않는다', () => {
    expect(estimateBlueOceanScoreWithoutAd('high', 0, 0).qualifies).toBe(false);
  });
});
