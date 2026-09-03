/**
 * [2026-09-04 실측 회귀 잠금] 환각 "경고"는 실제 환각 신호일 때만.
 * 긍정 어휘 누락·같은 방향의 비율 차이는 경고가 아니다 — 경고 하나가 안전 점수를 임계 아래로 내려
 * 유료 재생성을 샀다(재측정 배치 2/4편).
 */
import { describe, expect, it } from 'vitest';
import { checkHallucination } from '../content/hallucinationCheck';

const POSITIVE_SOURCE = '기부와 나눔으로 도움을 준 선한 이웃의 감동적인 희망 이야기가 소중하다. 진심과 배려가 담긴 좋은 사례다. '
  + '전기요금 절약을 위해 에어컨 설정 온도를 26도로 두면 소비전력이 줄어든다.';

describe('checkHallucination — 경고 범위', () => {
  it('원본의 긍정 어휘가 결과에 없어도 경고하지 않는다(누락 목록만 남긴다)', () => {
    const r = checkHallucination(POSITIVE_SOURCE, '에어컨 설정 온도를 26도로 두면 소비전력이 줄어 전기요금이 내려간다. 필터 청소도 함께 한다.');
    expect(r.missingPositiveKeywords.length).toBeGreaterThanOrEqual(3);
    expect(r.warnings).toEqual([]);
    expect(r.isLikelyHallucinated).toBe(false);
  });

  it('원본도 긍정, 결과도 긍정이면 비율 차이가 커도 방향 경고를 내지 않는다', () => {
    // 원본: 긍정 5 / 부정 4 (비율 0.56) · 결과: 긍정 4 / 부정 0 (비율 1.0) → 차이 0.44, 방향은 둘 다 긍정
    const source = '기부 나눔 도움 감동 희망 논란 의혹 폭로 거짓';
    const body = '기부 나눔 도움 감동 안내';
    const r = checkHallucination(source, body);
    expect(r.sentimentMismatch).toBeGreaterThan(0.3);
    expect(r.warnings.find((w) => w.includes('감정 방향'))).toBeUndefined();
  });

  it('원본 긍정 → 결과 부정으로 방향이 뒤집히면 경고한다', () => {
    const source = '기부 나눔 도움 감동 희망 소중 진심 배려';
    const body = '논란 의혹 폭로 거짓 사기 기만 위선';
    const r = checkHallucination(source, body);
    expect(r.warnings.find((w) => w.includes('감정 방향 mismatch: 원본=긍정'))).toBeDefined();
  });
});
