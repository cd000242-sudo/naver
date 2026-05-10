/**
 * SPEC-CONVERSION-001 L2-2.7 — 경쟁 데이터 통합 오케스트레이터
 *
 * contentGenerator가 호출 가능한 *얇은* 통합 레이어:
 *   1. Feature flag COMPETITOR_DATA_V1 확인 (기본 OFF)
 *   2. PageLike 주입 → collectCompetitorProducts 실행
 *   3. 가격 분석 → buildPricePositioning
 *   4. 마크다운 블록 → buildCompetitorContextBlock
 *   5. 결과 + 메타 반환
 *
 * 본 모듈은 **가능하면 호출 안 하는 게 안전** — spike(L2-2.1) 통과 후 운영 투입.
 *
 * 메모리 [silent 폴백 금지]: 실패는 enabled=false 또는 fallbackReason으로 명시.
 * 메모리 [추정 효과 금지]: 사용 효과 약속 X — operationsDashboard로 calibrate.
 *
 * 파일 한도 150줄 준수.
 */

import {
  collectCompetitorProducts,
  isCompetitorCollectorEnabled,
  type CompetitorCollectorResult,
  type PageLike,
} from '../crawler/competitorDataCollector';
import { buildPricePositioning, type PricePositioningResult } from './pricePositioning';
import { buildCompetitorContextBlock } from './competitorContextBuilder';

export interface CompetitorIntegrationInput {
  readonly query: string;
  readonly targetPriceWon?: number;     // 분석 대상 제품 가격 (있어야 가격 포지셔닝 활성)
  readonly topN?: number;
  readonly maxProductsInBlock?: number;
  readonly forceFlag?: boolean;
  readonly fetcher: PageLike;           // DI: contentGenerator가 주입
}

export interface CompetitorIntegrationResult {
  readonly enabled: boolean;
  readonly contextBlock: string;        // additionalContext에 합성할 마크다운 (빈 문자열이면 noop)
  readonly collectorResult: CompetitorCollectorResult;
  readonly pricePositioning: PricePositioningResult | null;
  readonly fallbackReason?: string;
}

/**
 * 통합 호출. 호출자(contentGenerator)는 이 결과의 contextBlock을
 * draftWriter input의 additionalContext에 합성한다 (or chainedGeneration 호출 후).
 *
 * 빈 contextBlock은 그대로 noop — 호출자가 별도 분기 X.
 */
export async function runCompetitorIntegration(
  input: CompetitorIntegrationInput,
): Promise<CompetitorIntegrationResult> {
  if (!isCompetitorCollectorEnabled(input.forceFlag)) {
    return {
      enabled: false,
      contextBlock: '',
      collectorResult: {
        enabled: false,
        query: input.query,
        products: [],
        successRate: 0,
        elapsedMs: 0,
        fallbackReason: 'COMPETITOR_DATA_V1 미활성화',
      },
      pricePositioning: null,
      fallbackReason: 'COMPETITOR_DATA_V1 미활성화',
    };
  }

  const collectorResult = await collectCompetitorProducts({
    query: input.query,
    topN: input.topN,
    forceFlag: input.forceFlag,
    fetcher: input.fetcher,
  });

  let pricePos: PricePositioningResult | null = null;
  if (
    typeof input.targetPriceWon === 'number' &&
    input.targetPriceWon > 0 &&
    collectorResult.products.length > 0
  ) {
    pricePos = buildPricePositioning({
      targetPriceWon: input.targetPriceWon,
      competitorPricesWon: collectorResult.products.map((p) => p.priceWon),
    });
  }

  const contextBlock = buildCompetitorContextBlock(collectorResult, {
    maxProducts: input.maxProductsInBlock,
    pricePositioning: pricePos ?? undefined,
  });

  return {
    enabled: true,
    contextBlock,
    collectorResult,
    pricePositioning: pricePos,
    fallbackReason: collectorResult.fallbackReason,
  };
}
