/**
 * SPEC-CONVERSION-001 L2-2.5 + L2-2.6 — 경쟁 데이터 → 프롬프트 컨텍스트 블록 변환
 *
 * collectCompetitorProducts 결과 + buildPricePositioning 결과를 받아
 * draftWriter의 additionalContext에 주입할 수 있는 마크다운 블록을 생성한다.
 *
 * Fallback (L2-2.6):
 *   - 수집 비활성/실패/0건 → 빈 문자열 반환 (호출자가 그대로 무시 — silent 위조 X)
 *   - 가격 포지셔닝 분석 불가 → 가격 포지셔닝 줄만 생략, 제품 리스트는 출력
 *
 * 메모리 [silent 폴백 금지]: fallback 시 reason 노출하지 않음 (호출자가 결과 객체로 확인).
 *   본 모듈은 *블록 생성기*만 책임. 분석 결과 자체는 collector·positioning 모듈에 있음.
 *
 * 메모리 [추정 효과 금지]: 경쟁 데이터로 "전환률 +X%" 추측 X — 사실 기반 인용만.
 */

import type { CompetitorProduct, CompetitorCollectorResult } from '../crawler/competitorDataCollector';
import type { PricePositioningResult } from './pricePositioning';

const MAX_PRODUCTS_IN_BLOCK = 5;

export interface CompetitorContextOptions {
  readonly maxProducts?: number;
  readonly pricePositioning?: PricePositioningResult;
}

/**
 * 경쟁 수집 결과를 LLM 프롬프트 블록으로 변환.
 * 결과가 비어 있거나 실패면 빈 문자열 반환 — 호출자는 그대로 추가하면 noop.
 */
export function buildCompetitorContextBlock(
  collectorResult: CompetitorCollectorResult,
  options?: CompetitorContextOptions,
): string {
  if (!collectorResult.enabled) return '';
  if (collectorResult.products.length === 0) return '';

  const max = Math.max(1, Math.min(MAX_PRODUCTS_IN_BLOCK, options?.maxProducts ?? MAX_PRODUCTS_IN_BLOCK));
  const top = collectorResult.products.slice(0, max);

  const lines: string[] = [
    '## [경쟁 제품 데이터 — 본문에 인용 가능, 환각 금지]',
    `검색어: "${collectorResult.query}" (수집 ${collectorResult.products.length}건, 성공률 ${(collectorResult.successRate * 100).toFixed(0)}%)`,
    '',
    '| 순위 | 제품명 | 가격 | 평점 | 리뷰 |',
    '|---|---|---|---|---|',
  ];
  for (const p of top) {
    lines.push(formatProductRow(p));
  }

  const pp = options?.pricePositioning;
  if (pp && pp.sentence) {
    lines.push('', '## [가격 포지셔닝]', pp.sentence);
  }

  lines.push(
    '',
    '## [경쟁 데이터 활용 규칙]',
    '- 위 표의 가격·평점·리뷰 수는 *수집된 사실*. 본문에 자연스럽게 1~2회 인용 가능.',
    '- 표에 없는 수치·고유명사·평가는 절대 추가 금지 (환각 차단).',
    '- 특정 브랜드 비하 금지. "비슷한 가격대 제품들"·"카테고리 평균" 식 일반화 권장.',
  );

  return lines.join('\n');
}

function formatProductRow(p: CompetitorProduct): string {
  const name = p.name.length > 30 ? `${p.name.slice(0, 30)}…` : p.name;
  const price = p.priceWon > 0 ? `${p.priceWon.toLocaleString()}원` : '미수집';
  const rating = p.rating !== null ? `${p.rating.toFixed(1)}점` : '-';
  const review = p.reviewCount !== null ? `${p.reviewCount.toLocaleString()}건` : '-';
  return `| ${p.rank} | ${name} | ${price} | ${rating} | ${review} |`;
}
