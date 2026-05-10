/**
 * SPEC-CONVERSION-001 L2-2.4 — 가격 포지셔닝 문장 생성 유틸
 *
 * 경쟁 제품 가격 분포(min/median/max)를 받아 "이 제품의 가격이 시장에서 어느 위치"
 * 인지를 1~2문장으로 자연스럽게 표현. 결정론(LLM 미사용).
 *
 * 메모리 [silent 폴백 금지]: 데이터 부족 시 빈 문자열 반환 + 로그 (위조 X).
 * 메모리 [추정 효과 금지]: "전환률 +X%" 약속 X — 표현 생성만.
 *
 * 파일 한도 150줄 준수.
 */

export interface PricePositioningInput {
  /** 분석 대상 제품 가격 (원). 0 이하면 invalid. */
  readonly targetPriceWon: number;
  /** 경쟁 제품 가격 배열 (원). 분석 가능하려면 최소 3건 권장. */
  readonly competitorPricesWon: readonly number[];
  /** 0~1, 분석 신뢰 임계 — 경쟁 데이터 N건 미만이면 결과 빈 문자열 */
  readonly minSampleSize?: number;
}

export type PriceTier = 'lowest' | 'below_median' | 'median' | 'above_median' | 'highest' | 'unknown';

export interface PricePositioningResult {
  readonly tier: PriceTier;
  readonly sentence: string;
  readonly stats: {
    readonly sampleSize: number;
    readonly min: number;
    readonly median: number;
    readonly max: number;
    readonly target: number;
  } | null;
  readonly reason?: string;
}

const DEFAULT_MIN_SAMPLE = 3;

function median(arr: readonly number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
}

function clampPositive(arr: readonly number[]): number[] {
  return arr.filter((x) => Number.isFinite(x) && x > 0);
}

function formatPriceWon(won: number): string {
  if (won >= 10_000) {
    const man = won / 10_000;
    return man === Math.round(man) ? `${man}만원` : `${man.toFixed(1)}만원`;
  }
  return `${won.toLocaleString()}원`;
}

function classifyTier(target: number, sortedPrices: readonly number[]): PriceTier {
  const n = sortedPrices.length;
  if (n === 0) return 'unknown';
  const med = median(sortedPrices);
  const min = sortedPrices[0];
  const max = sortedPrices[n - 1];
  const tolerance = Math.max(med * 0.05, 500); // 5% 또는 500원 이내는 median 동급
  if (target <= min) return 'lowest';
  if (target >= max) return 'highest';
  if (Math.abs(target - med) <= tolerance) return 'median';
  return target < med ? 'below_median' : 'above_median';
}

function buildSentence(tier: PriceTier, target: number, med: number, min: number, max: number): string {
  switch (tier) {
    case 'lowest':
      return `이 제품은 비슷한 카테고리에서 가장 저렴한 편이에요 (시장 최저가 ${formatPriceWon(min)} 수준).`;
    case 'below_median':
      return `이 제품은 평균(${formatPriceWon(med)}) 대비 저렴한 편이라 가성비를 따지는 분께 맞아요.`;
    case 'median':
      return `이 제품은 시장 평균선(${formatPriceWon(med)})에 근접한 무난한 가격대예요.`;
    case 'above_median':
      return `이 제품은 평균(${formatPriceWon(med)})보다 높은 편이라 품질·기능을 우선 고려하는 분께 맞아요.`;
    case 'highest':
      return `이 제품은 비슷한 카테고리에서 가장 비싼 편이에요 (시장 상한 ${formatPriceWon(max)} 수준).`;
    default:
      return '';
  }
}

export function buildPricePositioning(input: PricePositioningInput): PricePositioningResult {
  const minSample = input.minSampleSize ?? DEFAULT_MIN_SAMPLE;
  const target = input.targetPriceWon;

  if (!Number.isFinite(target) || target <= 0) {
    return {
      tier: 'unknown',
      sentence: '',
      stats: null,
      reason: 'targetPriceWon이 유효하지 않음 (0 이하 또는 NaN)',
    };
  }

  const cleanPrices = clampPositive(input.competitorPricesWon);
  if (cleanPrices.length < minSample) {
    return {
      tier: 'unknown',
      sentence: '',
      stats: null,
      reason: `경쟁 가격 데이터 ${cleanPrices.length}건 (최소 ${minSample}건 필요)`,
    };
  }

  const sorted = [...cleanPrices].sort((a, b) => a - b);
  const tier = classifyTier(target, sorted);
  const med = median(sorted);
  const sentence = buildSentence(tier, target, med, sorted[0], sorted[sorted.length - 1]);

  return {
    tier,
    sentence,
    stats: {
      sampleSize: sorted.length,
      min: sorted[0],
      median: med,
      max: sorted[sorted.length - 1],
      target,
    },
  };
}
