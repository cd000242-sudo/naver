/**
 * SPEC-CONVERSION-001 L4-2.3 — 성과 상위글 패턴 추출
 *
 * conversionStore의 누적 이벤트 + benchmarkAnalyzer 결과를 결합해
 * "전환률·CTR 상위 글의 공통 패턴"을 추출. RLHF 프롬프트 튜닝 입력.
 *
 * 결정론. 외부 LLM 미사용. 통계·휴리스틱.
 *
 * 메모리 [silent 폴백 금지]: 데이터 부족은 명시 reason.
 * 메모리 [추정 효과 금지]: 패턴 적용 시 효과 약속 X.
 *
 * 파일 한도 250줄 준수.
 */

import type {
  ConversionStore,
  ConversionAggregate,
} from './conversionStore';
import type { BenchmarkAnalysis } from '../content/benchmarkAnalyzer';

export interface PatternExtractorInput {
  readonly store: ConversionStore;
  readonly postIds: readonly string[];                  // 분석 대상 글 ID 목록
  readonly analyses?: Readonly<Record<string, BenchmarkAnalysis>>; // postId → analysis
  readonly topPercent?: number;                          // 0~1, 기본 0.2 (상위 20%)
  readonly metric?: 'clickRate' | 'conversionRate';      // 정렬 기준 (기본 conversionRate)
  readonly minSampleSize?: number;                       // 분석 가능 최소 글 수 (기본 5)
}

export interface PatternExtractorResult {
  readonly metric: string;
  readonly totalPosts: number;
  readonly topPosts: readonly TopPostStat[];
  readonly aggregatedPatterns: AggregatedPatterns;
  readonly fallbackReason?: string;
}

export interface TopPostStat {
  readonly postId: string;
  readonly metricValue: number;
  readonly aggregate: ConversionAggregate;
  readonly analysis?: BenchmarkAnalysis;
}

export interface AggregatedPatterns {
  readonly avgCharCount: number;
  readonly avgHeadingCount: number;
  readonly avgImageCount: number;
  readonly topStructureSignatures: readonly { signature: string; count: number }[];
  readonly topKeywords: readonly { term: string; postCount: number }[];
  readonly perCategory: Readonly<Record<string, number>>;
}

const DEFAULT_TOP_PERCENT = 0.2;
const DEFAULT_MIN_SAMPLE = 5;

export async function extractPatterns(
  input: PatternExtractorInput,
): Promise<PatternExtractorResult> {
  const metric = input.metric ?? 'conversionRate';
  const topPct = Math.max(0.05, Math.min(1, input.topPercent ?? DEFAULT_TOP_PERCENT));
  const minSample = Math.max(1, input.minSampleSize ?? DEFAULT_MIN_SAMPLE);

  if (input.postIds.length < minSample) {
    return emptyResult(metric, input.postIds.length, `INSUFFICIENT_SAMPLES: ${input.postIds.length} < ${minSample}`);
  }

  // 1. 각 postId의 aggregate 수집
  const stats: TopPostStat[] = [];
  for (const postId of input.postIds) {
    const ag = await input.store.aggregateByPost(postId);
    if (!ag) continue;
    const value = metric === 'clickRate' ? ag.clickRate : ag.conversionRate;
    stats.push({
      postId,
      metricValue: value,
      aggregate: ag,
      analysis: input.analyses?.[postId],
    });
  }

  if (stats.length < minSample) {
    return emptyResult(metric, stats.length, `NOT_ENOUGH_AGGREGATED: ${stats.length} < ${minSample}`);
  }

  // 2. 상위 N% 정렬·추출
  stats.sort((a, b) => b.metricValue - a.metricValue);
  const topCount = Math.max(1, Math.floor(stats.length * topPct));
  const topPosts = stats.slice(0, topCount);

  // 3. 분석 결과가 있는 글만 패턴 집계
  const withAnalysis = topPosts.filter((p): p is TopPostStat & { analysis: BenchmarkAnalysis } =>
    Boolean(p.analysis),
  );

  if (withAnalysis.length === 0) {
    return {
      metric,
      totalPosts: stats.length,
      topPosts,
      aggregatedPatterns: emptyPatterns(),
      fallbackReason: 'NO_BENCHMARK_ANALYSES_PROVIDED',
    };
  }

  return {
    metric,
    totalPosts: stats.length,
    topPosts,
    aggregatedPatterns: aggregatePatterns(withAnalysis),
  };
}

function aggregatePatterns(
  posts: readonly (TopPostStat & { analysis: BenchmarkAnalysis })[],
): AggregatedPatterns {
  const perSig = new Map<string, number>();
  const perKw = new Map<string, number>();
  const perCat: Record<string, number> = {};
  let charSum = 0;
  let headingSum = 0;
  let imgSum = 0;

  for (const p of posts) {
    const a = p.analysis;
    charSum += a.stats.charCount;
    headingSum += a.stats.headingCount;
    imgSum += a.stats.imageHintCount;
    if (a.structureSignature) {
      perSig.set(a.structureSignature, (perSig.get(a.structureSignature) ?? 0) + 1);
    }
    perCat[a.category] = (perCat[a.category] ?? 0) + 1;
    for (const kw of a.topKeywords.slice(0, 5)) {
      perKw.set(kw.term, (perKw.get(kw.term) ?? 0) + 1);
    }
  }

  const n = Math.max(1, posts.length);
  const topStructures = [...perSig.entries()]
    .map(([signature, count]) => ({ signature, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topKeywords = [...perKw.entries()]
    .map(([term, postCount]) => ({ term, postCount }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 15);

  return {
    avgCharCount: Math.round(charSum / n),
    avgHeadingCount: Math.round((headingSum / n) * 10) / 10,
    avgImageCount: Math.round((imgSum / n) * 10) / 10,
    topStructureSignatures: topStructures,
    topKeywords,
    perCategory: perCat,
  };
}

function emptyPatterns(): AggregatedPatterns {
  return {
    avgCharCount: 0,
    avgHeadingCount: 0,
    avgImageCount: 0,
    topStructureSignatures: [],
    topKeywords: [],
    perCategory: {},
  };
}

function emptyResult(
  metric: string,
  totalPosts: number,
  reason: string,
): PatternExtractorResult {
  return {
    metric,
    totalPosts,
    topPosts: [],
    aggregatedPatterns: emptyPatterns(),
    fallbackReason: reason,
  };
}

/**
 * 사람이 읽기 쉬운 한 줄 요약. 운영 대시보드에 노출용.
 */
export function summarizePatternResult(r: PatternExtractorResult): string {
  if (r.fallbackReason) return `RLHF: 분석 불가 — ${r.fallbackReason}`;
  return [
    `RLHF (${r.metric}): 상위 ${r.topPosts.length}/${r.totalPosts}`,
    `평균 ${r.aggregatedPatterns.avgCharCount}자 · 헤딩 ${r.aggregatedPatterns.avgHeadingCount}개 · 이미지 ${r.aggregatedPatterns.avgImageCount}개`,
    `top sig: ${r.aggregatedPatterns.topStructureSignatures.slice(0, 3).map((s) => s.signature).join(', ') || '-'}`,
  ].join(' | ');
}
