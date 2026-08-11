/**
 * 황금지수 — **검색량이 높고 문서수가 낮은 정도.**
 *
 * 사장님 기준이고 여러 번 확인받았다:
 *   "검색량이 높고 문서수가 낮아야 황금키워드다."
 *   "황금키워드면서 광고가 많은 게 제일 베스트다."
 *
 * 그래서 등급은 **검색량 ÷ 문서수** 하나로만 매긴다. 광고는 등급에 안 섞는다 —
 * 섞으면 광고만 많고 밭은 꽉 찬 키워드가 '초황금'이 된다(실측: '증명사진 규격 변환'
 * 은 광고 7건이지만 검색 2,440에 문서 3,801로 밭이 더 두껍다).
 * 광고는 **같은 등급 안에서 앞뒤를 가르는 데** 쓴다.
 *
 * 눈금은 실측 분포에서 골랐다(2026-08-11 발행 27행):
 *   15.63 · 12.42 · 6.36 · 5.80 · 5.34 · 2.75 · … · 0.64 · 0.20 · 0.10
 *   5배 이상 5건 · 2배 이상 6건 — 위쪽이 얇아야 '초황금'이 뜻을 갖는다.
 *
 * 주의: 두 숫자는 잰 대상이 다르다. 검색량은 지난 한 달의 횟수이고 문서수는
 * 10년치 누적이다. 그래서 이 값은 "몇 배 유리한가"가 아니라 **줄 세우는 자**다.
 * 화면에도 배수를 자랑하지 않고 실측 두 숫자를 그대로 적는다.
 */

export type PreemptionTierId = 'ultra' | 'golden' | 'fair' | 'weak';

export interface PreemptionIndex {
  tier: PreemptionTierId;
  /** 화면에 쓸 이름. */
  label: string;
  /** 검색량 ÷ 문서수. 못 재면 null. 줄 세우기에 쓴다. */
  worth: number | null;
  /** 왜 이 단계인지 — 실측 숫자를 그대로 적는다. */
  reason: string;
}

/** 눈금. 위쪽이 얇아야 등급이 뜻을 갖는다(실측 27행에서 5배 이상 5건). */
export const PREEMPTION_INDEX_THRESHOLDS = {
  ultra: 5,
  golden: 2,
  fair: 0.5,
} as const;

const TIER_LABEL: Record<PreemptionTierId, string> = {
  ultra: '초황금',
  golden: '황금',
  fair: '적당',
  weak: '약함',
};

const num = (value: number) => value.toLocaleString('ko-KR');

export interface PreemptionIndexInput {
  searchVolume: number | null | undefined;
  documentCount: number | null | undefined;
}

/**
 * 실측 검색량·문서수로 등급을 낸다.
 *
 * 둘 중 하나라도 못 쟀으면 '약함'이 아니라 **판정하지 않는다**(worth = null).
 * 모르는 것을 약함으로 적으면 못 잰 것과 나쁜 것이 화면에서 같아진다.
 */
export function preemptionIndex(input: PreemptionIndexInput): PreemptionIndex {
  const volume = typeof input.searchVolume === 'number' ? input.searchVolume : null;
  const docs = typeof input.documentCount === 'number' ? input.documentCount : null;
  if (volume === null || docs === null || volume <= 0 || docs <= 0) {
    return { tier: 'weak', label: '판정 못함', worth: null, reason: '검색량이나 문서수를 재지 못했습니다' };
  }

  const worth = volume / docs;
  const T = PREEMPTION_INDEX_THRESHOLDS;
  const tier: PreemptionTierId = worth >= T.ultra ? 'ultra'
    : worth >= T.golden ? 'golden'
      : worth >= T.fair ? 'fair' : 'weak';

  return {
    tier,
    label: TIER_LABEL[tier],
    worth,
    reason: `월 검색 ${num(volume)}회에 문서 ${num(docs)}개`,
  };
}

/** 줄 세우기용 등급 순위. 작을수록 위. */
export const TIER_ORDER: Record<PreemptionTierId, number> = {
  ultra: 0, golden: 1, fair: 2, weak: 3,
};
