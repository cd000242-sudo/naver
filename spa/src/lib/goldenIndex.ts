/**
 * 황금지수 — 등급 SSoT 를 사장님 4단계로 접은 것.
 *
 * **정본은 leword-app/src/utils/grade.ts 다.** 여기 임계값은 그 사본이며,
 * 화면이 따로 판정하지 않게 하려고 옮겨 둔 것이다. 정본이 바뀌면 여기도 바꾼다.
 * 화면마다 제 나름의 지수를 만들면 같은 키워드가 발굴에선 SSS, 분석에선 '보통'이
 * 된다 — 등급 정의가 네 곳으로 갈라져 회귀의 근본 원인이 됐던 그 사고다.
 *
 * 지수의 정체: 검색량 ÷ 문서수. 재서 나눈 값이지 만든 값이 아니다.
 */

export type Grade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

export const GRADE_THRESHOLDS = {
  /** classic SSS: 고볼륨 저경쟁 (검색량 1000+, 문서수 5000↓, 비율 5+, 점수 85+) */
  sssClassic: { volumeMin: 1000, docsMax: 5000, ratioMin: 5, scoreMin: 85 },
  ss: { volumeMin: 500, docsMax: 10000, ratioMin: 3, scoreMin: 75 },
  s: { volumeMin: 300, ratioMin: 2, scoreMin: 65 },
  a: { volumeMin: 100, scoreMin: 55 },
  b: { scoreMin: 45 },
  c: { scoreMin: 30 },
} as const;

const T = GRADE_THRESHOLDS;

export function isClassicSss(volume: number, docs: number, ratio: number): boolean {
  return volume >= T.sssClassic.volumeMin && docs > 0 && docs <= T.sssClassic.docsMax && ratio >= T.sssClassic.ratioMin;
}

export function isWinnableSss(_volume: number, _docs: number, _ratio: number): boolean {
  return false;
}

export function isGoldenSss(volume: number, docs: number, ratio: number): boolean {
  return isClassicSss(volume, docs, ratio);
}

export function classifyGradeByMetrics(volume: number, docs: number, ratio: number): Grade {
  if (volume <= 0 || docs <= 0 || !Number.isFinite(ratio) || ratio <= 0) return 'C';
  if (isGoldenSss(volume, docs, ratio)) return 'SSS';
  if (volume >= 500 && docs <= 10000 && ratio >= 3) return 'SS';
  if (volume >= 300 && docs <= 15000 && ratio >= 2) return 'S';
  if (volume >= 100 && docs <= 30000) return 'A';
  if (volume >= 30 && docs <= 80000) return 'B';
  return 'C';
}

export type GoldenTier = 'ultra' | 'golden' | 'fair' | 'weak';

export interface GoldenIndex {
  tier: GoldenTier;
  /** 화면에 쓸 이름. */
  label: string;
  /** 검색량 ÷ 문서수. 못 재면 null. */
  ratio: number | null;
  /** 어느 등급에서 왔는지. 다른 화면과 대조할 때 쓴다. */
  grade: Grade;
  /** 왜 이 단계인지 — 실측 숫자를 그대로 담는다. */
  reason: string;
}

const TIER_LABEL: Record<GoldenTier, string> = {
  ultra: '초황금',
  golden: '황금',
  fair: '적당',
  weak: '약함',
};

/** 등급 SSoT 의 래더를 사장님 4단계로 접는다. 임계값을 여기서 새로 정하지 않는다. */
const TIER_BY_GRADE: Record<Grade, GoldenTier> = {
  SSS: 'ultra',
  SS: 'golden',
  S: 'fair',
  A: 'weak',
  B: 'weak',
  C: 'weak',
  D: 'weak',
};

const num = (value: number) => value.toLocaleString('ko-KR');

/**
 * 실측 검색량·문서수로 황금지수를 낸다.
 *
 * 둘 중 하나라도 못 쟀으면 판정하지 않는다(null) — 모르는 것을 '약함'으로
 * 적으면 못 잰 것과 나쁜 것이 화면에서 같아진다.
 */
export function goldenIndex(
  searchVolume: number | null | undefined,
  documentCount: number | null | undefined,
): GoldenIndex | null {
  if (typeof searchVolume !== 'number' || !Number.isFinite(searchVolume)) return null;
  if (typeof documentCount !== 'number' || !Number.isFinite(documentCount)) return null;
  if (documentCount <= 0) return null;

  const ratio = searchVolume / documentCount;
  const grade = classifyGradeByMetrics(searchVolume, documentCount, ratio);
  const tier = TIER_BY_GRADE[grade];

  return {
    tier,
    label: TIER_LABEL[tier],
    ratio,
    grade,
    reason: `월 검색 ${num(searchVolume)}회에 문서 ${num(documentCount)}개 — 한 편이 ${ratio.toFixed(1)}대 1로 붙는다`,
  };
}
