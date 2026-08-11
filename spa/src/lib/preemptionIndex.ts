/**
 * 선점 보드 전용 등급 — 광고 · 검색량 · 정면 글 수로 가른다.
 *
 * ## 왜 황금지수(goldenIndex)를 그대로 못 쓰나
 *
 * 그건 검색량 ÷ 문서수다. SSS 기준이 비율 5배인데, 이 보드의 롱테일에서는
 * 실측 45건의 **최대가 0.476** 이었다 — 1을 넘은 것조차 0건이다. 이유는 두 숫자가
 * 잰 대상이 달라서다: 검색량은 지난 **한 달**의 횟수이고, 문서수는 **10년치 누적**에서
 * 그 단어들이 어딘가 들어간 글 수다(정확구문도 아니다).
 *
 * 그래서 보드의 전 행이 '약함' 으로 나왔고, 화면에 '약함 0.0' 만 반복됐다.
 * 아무것도 못 가르는 등급은 없느니만 못하다.
 *
 * ## 무엇으로 가르나 (사장님 기준, 2026-08-11)
 *
 *   "상위에 광고가 많이 떠 있다면 그 키워드는 돈이 되는 키워드다 — 광고주가 많으니까.
 *    광고가 많고 검색량은 높으면서 문서수는 낮은 그런 키워드들을 상위에."
 *
 * 셋 다 실측이다. 특히 **정면 글 수**가 사장님이 말한 '문서수' 의 진짜 뜻이다 —
 * '크레마 이북리더기 미피' 는 문서수 525건이지만 그 주제를 정면으로 다룬 글은
 * 상위 10개 중 3건이었다. 겨루는 상대는 525가 아니라 3이다.
 *
 * 점수를 만들어 합치지 않는다. 세 조건을 **몇 개 넘겼는지**로만 접는다 —
 * 가중치를 매기는 순간 그 가중치가 곧 지어낸 값이 된다.
 */

export type PreemptionTierId = 'ultra' | 'golden' | 'fair' | 'weak';

export interface PreemptionIndex {
  tier: PreemptionTierId;
  /** 화면에 쓸 이름. */
  label: string;
  /** 왜 이 단계인지 — 넘긴 조건을 실측 숫자로 그대로 적는다. */
  reasons: string[];
  /** 못 잰 축. 있으면 판정을 낮춰 잡는다(모르는 것을 만족으로 세지 않는다). */
  missing: string[];
}

/**
 * 눈금. 실측 분포에서 골랐다(2026-08-11):
 *   광고    치아보험 10 · 노트북받침대 3 · 오퍼레이터24 1 → 5 이상이면 광고주가 붙은 자리
 *   검색량  보드 후보 중앙값이 400 대 → 500 이상이면 수요가 붙었다고 본다
 *   정면 글 게이트가 이미 2건 이상을 막는다 → 0건이면 자리가 진짜 비어 있다
 */
export const PREEMPTION_INDEX_THRESHOLDS = {
  adsMin: 5,
  volumeMin: 500,
  facingMax: 0,
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
  /** 상단 파워링크 광고 건수. 못 쟀으면 null/undefined. */
  adCount: number | null | undefined;
  /** 상위 10개 중 그 주제를 정면으로 다룬 글 수. */
  facingPosts: number | null | undefined;
  /** 정면 글을 몇 개 중에서 셌는가. 표본을 모르면 '0건'이 의미가 없다. */
  sampledTitles: number | null | undefined;
}

/**
 * 세 조건 중 몇 개를 넘겼는지로 단계를 접는다.
 * 3개 → 초황금 · 2개 → 황금 · 1개 → 적당 · 0개 → 약함.
 */
export function preemptionIndex(input: PreemptionIndexInput): PreemptionIndex {
  const T = PREEMPTION_INDEX_THRESHOLDS;
  const reasons: string[] = [];
  const missing: string[] = [];

  if (typeof input.adCount === 'number') {
    if (input.adCount >= T.adsMin) reasons.push(`상단 광고 ${input.adCount}건 — 광고주가 돈을 넣는 자리`);
  } else {
    missing.push('광고를 못 쟀다');
  }

  if (typeof input.searchVolume === 'number') {
    if (input.searchVolume >= T.volumeMin) reasons.push(`월 검색 ${num(input.searchVolume)}회`);
  } else {
    missing.push('검색량을 못 쟀다');
  }

  /*
   * 표본을 모르면 '정면 0건' 이 "아무도 안 썼다" 인지 "못 읽었다" 인지 알 수 없다.
   * 그래서 표본 수가 있어야만 이 조건을 센다.
   */
  if (typeof input.facingPosts === 'number' && typeof input.sampledTitles === 'number' && input.sampledTitles > 0) {
    if (input.facingPosts <= T.facingMax) {
      reasons.push(`상위 ${input.sampledTitles}개 중 정면으로 다룬 글 ${input.facingPosts}건`);
    }
  } else {
    missing.push('정면 글을 못 쟀다');
  }

  const met = reasons.length;
  const tier: PreemptionTierId = met >= 3 ? 'ultra' : met === 2 ? 'golden' : met === 1 ? 'fair' : 'weak';
  return { tier, label: TIER_LABEL[tier], reasons, missing };
}
