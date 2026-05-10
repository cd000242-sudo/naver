/**
 * SPEC-CONVERSION-001 L2-2.5 + L3-1.6 + L3-2.3 — 체인드 draft 통합 러너
 *
 * 호출자(contentGenerator)가 한 함수 호출로 다음 흐름 수행:
 *   1. runChainedGeneration → Stage 1·2 (분류·페르소나)
 *   2. (선택) 경쟁 데이터 → contextBlock
 *   3. (선택) RAG retrieval → 유사 벤치마크 contextBlock
 *   4. (선택) 트렌드·시즌 → contextBlock
 *   5. writeDraft → Stage 3 본문 초안 (모든 블록 합성)
 *   6. recordChainedGenRun → 메트릭 누적
 *
 * 각 옵션 블록은 *완전 선택*. 미주입 시 noop, prompt 변경 X.
 * 본 러너는 Stage 4·5(factGate·optimize)는 수행 X — 호출자 책임.
 *
 * 메모리 [silent 폴백 금지]: 각 단계 실패는 명시 reason 노출.
 * 메모리 [추정 효과 금지]: 결과 품질 약속 X.
 *
 * 파일 한도 250줄 준수.
 */

import {
  runChainedGeneration,
  type ChainedGenerationResult,
  type ChainedSourceInput,
} from './chainedGeneration';
import { writeDraft, type DraftResult, type LLMProvider, type LLMCompleteOptions } from './draftWriter';
import {
  runCompetitorIntegration,
  type CompetitorIntegrationResult,
} from './competitorIntegration';
import type { PageLike } from '../crawler/competitorDataCollector';
import { recordChainedGenRun } from '../monitor/chainedGenMetrics';
import type { Retriever, RetrievedDocument } from '../rag/retriever';
import type { SearchOptions } from '../rag/vectorStore';
import {
  collectTrend,
  buildTrendPromptBlock,
  type TrendFetcher,
  type TrendFetchResult,
} from '../trend/trendCollector';
import { TrendCache } from '../trend/trendCache';
import { resolveSeason, buildSeasonPromptBlock, type SeasonContext } from '../trend/seasonResolver';

export interface ChainedDraftRunnerInput {
  readonly chainInput: ChainedSourceInput;
  readonly topic: string;
  readonly minChars: number;
  readonly maxChars?: number;
  readonly extraContext?: string;
  readonly llmProvider: LLMProvider;
  readonly llmOptions?: LLMCompleteOptions;

  readonly competitor?: {
    readonly fetcher: PageLike;
    readonly query: string;
    readonly targetPriceWon?: number;
    readonly forceFlag?: boolean;
  };

  // L3-1.6 — RAG 유사 글 retrieval
  readonly rag?: {
    readonly retriever: Retriever;
    readonly query: string;                 // retrieval 쿼리 (보통 topic 또는 title)
    readonly searchOptions?: SearchOptions;
  };

  // L3-2.3 — 트렌드·시즌 주입
  readonly trend?: {
    readonly fetcher: TrendFetcher;
    readonly seedTerm: string;
    readonly forceFlag?: boolean;
    readonly cache?: TrendCache<TrendFetchResult>;
  };
  readonly seasonDate?: Date | string;        // resolveSeason 입력. 미주어지면 시즌 블록 X
}

export interface ChainedDraftRunnerResult {
  readonly chainResult: ChainedGenerationResult;
  readonly competitor: CompetitorIntegrationResult | null;
  readonly ragHits: readonly RetrievedDocument[] | null;
  readonly trend: TrendFetchResult | null;
  readonly season: SeasonContext | null;
  readonly draft: DraftResult;
  readonly contextBlocksUsed: {
    readonly competitor: boolean;
    readonly rag: boolean;
    readonly trend: boolean;
    readonly season: boolean;
    readonly extra: boolean;
  };
}

const RAG_BLOCK_MAX_HITS = 5;

function buildRagPromptBlock(hits: readonly RetrievedDocument[]): string {
  if (hits.length === 0) return '';
  const lines: string[] = [
    '## [유사 성공글 — 본문 구조·키워드 참고용, 인용 금지]',
    '아래는 비슷한 주제의 성공 사례. 구조·소제목·강조 패턴만 참고. 본문 텍스트 그대로 인용 금지.',
  ];
  for (let i = 0; i < Math.min(RAG_BLOCK_MAX_HITS, hits.length); i++) {
    const h = hits[i];
    const md = h.metadata ?? {};
    const title = (md.title as string) ?? `(제목 없음 #${i + 1})`;
    const sig = (md.structureSignature as string) ?? '?';
    lines.push(`  ${i + 1}. "${title}" — 구조 ${sig}, 유사도 ${(h.score * 100).toFixed(0)}%`);
  }
  lines.push('', '## [활용 규칙]', '- 위 글의 구조 시그니처를 참고하되 본문은 *완전히 새로* 쓸 것.', '- 인용·복제 금지 (저작권).');
  return lines.join('\n');
}

export async function runChainedDraft(
  input: ChainedDraftRunnerInput,
): Promise<ChainedDraftRunnerResult> {
  // 1. Stage 1·2
  const chainResult = await runChainedGeneration(input.chainInput);
  recordChainedGenRun(chainResult);

  if (!chainResult.enabled) {
    throw new Error(
      `CHAINED_DRAFT_DISABLED: ${chainResult.fallbackReason ?? 'CHAINED_GEN_V1 미활성화'}`,
    );
  }

  // 2. competitor (선택)
  let competitorResult: CompetitorIntegrationResult | null = null;
  let competitorBlock = '';
  if (input.competitor) {
    competitorResult = await runCompetitorIntegration({
      query: input.competitor.query,
      targetPriceWon: input.competitor.targetPriceWon,
      forceFlag: input.competitor.forceFlag,
      fetcher: input.competitor.fetcher,
    });
    competitorBlock = competitorResult.contextBlock;
  }

  // 3. RAG (선택)
  let ragHits: RetrievedDocument[] | null = null;
  let ragBlock = '';
  if (input.rag) {
    try {
      ragHits = await input.rag.retriever.search(input.rag.query, input.rag.searchOptions);
      ragBlock = buildRagPromptBlock(ragHits);
    } catch (err) {
      // silent 폴백 X — 빈 결과 + 콘솔 명시
      console.warn(`[chainedDraftRunner] RAG retrieval 실패 (블록 미주입): ${(err as Error).message}`);
      ragHits = [];
      ragBlock = '';
    }
  }

  // 4. trend (선택)
  let trendResult: TrendFetchResult | null = null;
  let trendBlock = '';
  if (input.trend) {
    trendResult = await collectTrend({
      seedTerm: input.trend.seedTerm,
      forceFlag: input.trend.forceFlag,
      fetcher: input.trend.fetcher,
      cache: input.trend.cache,
    });
    trendBlock = buildTrendPromptBlock(trendResult);
  }

  // 5. season (선택)
  let seasonContext: SeasonContext | null = null;
  let seasonBlock = '';
  if (input.seasonDate !== undefined) {
    try {
      seasonContext = resolveSeason(input.seasonDate);
      seasonBlock = buildSeasonPromptBlock(seasonContext);
    } catch (err) {
      console.warn(`[chainedDraftRunner] resolveSeason 실패: ${(err as Error).message}`);
    }
  }

  // 6. additionalContext 합성 (순서: competitor → rag → trend → season → extra)
  const parts: string[] = [];
  if (competitorBlock) parts.push(competitorBlock);
  if (ragBlock) parts.push(ragBlock);
  if (trendBlock) parts.push(trendBlock);
  if (seasonBlock) parts.push(seasonBlock);
  if (input.extraContext && input.extraContext.trim()) parts.push(input.extraContext);
  const additionalContext = parts.length > 0 ? parts.join('\n\n') : undefined;

  // 7. Stage 3 — 본문 초안
  const draft = await writeDraft({
    chainResult,
    topic: input.topic,
    minChars: input.minChars,
    maxChars: input.maxChars,
    additionalContext,
    llmProvider: input.llmProvider,
    llmOptions: input.llmOptions,
  });

  return {
    chainResult,
    competitor: competitorResult,
    ragHits,
    trend: trendResult,
    season: seasonContext,
    draft,
    contextBlocksUsed: {
      competitor: Boolean(competitorBlock),
      rag: Boolean(ragBlock),
      trend: Boolean(trendBlock),
      season: Boolean(seasonBlock),
      extra: Boolean(input.extraContext && input.extraContext.trim()),
    },
  };
}
