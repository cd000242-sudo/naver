/**
 * SPEC-CONVERSION-001 L3-2.1 — 네이버 검색어 트렌드 수집기
 *
 * 네이버 데이터랩 API(공식) 또는 search.naver.com 자동완성 크롤링.
 * 본 모듈은 *결과 인터페이스*와 *DI 기반 fetcher*를 정의. 실제 API 키 또는
 * 셀렉터는 호출자(contentGenerator 또는 spike)가 주입.
 *
 * Feature flag: TREND_INJECT_V1 (기본 OFF). spike 검증 후 운영 투입.
 *
 * 메모리 [silent 폴백 금지]: API 실패는 명시 reason.
 * 메모리 [추정 효과 금지]: 트렌드 반영 효과 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import { TrendCache } from './trendCache';

const FEATURE_FLAG_ENV = 'TREND_INJECT_V1';

export interface TrendKeyword {
  readonly term: string;
  readonly rank: number;            // 1-based
  readonly trend: 'rising' | 'stable' | 'falling' | 'unknown';
  readonly relativeScore?: number;  // 0~100 (있을 때만)
}

export interface TrendFetchResult {
  readonly enabled: boolean;
  readonly seedTerm: string;
  readonly keywords: readonly TrendKeyword[];
  readonly fetchedAt: string;
  readonly elapsedMs: number;
  readonly source: 'datalab' | 'autocomplete' | 'mock' | 'cache';
  readonly fallbackReason?: string;
}

/**
 * 호출자가 주입할 fetcher 인터페이스. naver datalab API client 또는 mock.
 */
export interface TrendFetcher {
  fetch(seedTerm: string): Promise<{
    keywords: readonly TrendKeyword[];
    source: 'datalab' | 'autocomplete' | 'mock';
  }>;
}

export interface TrendCollectorInput {
  readonly seedTerm: string;
  readonly fetcher: TrendFetcher;
  readonly forceFlag?: boolean;
  readonly cache?: TrendCache<TrendFetchResult>;   // 선택 (없으면 캐시 미사용)
}

export function isTrendInjectEnabled(forceFlag?: boolean): boolean {
  if (forceFlag === true) return true;
  if (forceFlag === false) return false;
  const v = (process.env[FEATURE_FLAG_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on';
}

export async function collectTrend(input: TrendCollectorInput): Promise<TrendFetchResult> {
  const start = Date.now();
  const enabled = isTrendInjectEnabled(input.forceFlag);

  if (!enabled) {
    return {
      enabled: false,
      seedTerm: input.seedTerm,
      keywords: [],
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      source: 'mock',
      fallbackReason: `Feature flag ${FEATURE_FLAG_ENV} 미활성화`,
    };
  }

  if (!input.seedTerm || !input.seedTerm.trim()) {
    return {
      enabled: true,
      seedTerm: input.seedTerm ?? '',
      keywords: [],
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      source: 'mock',
      fallbackReason: 'TREND_SEED_EMPTY',
    };
  }

  const cacheKey = input.seedTerm.trim().toLowerCase();
  if (input.cache) {
    const hit = input.cache.get(cacheKey);
    if (hit) {
      return {
        ...hit,
        source: 'cache',
        fetchedAt: hit.fetchedAt,
        elapsedMs: Date.now() - start,
      };
    }
  }

  try {
    const fetched = await input.fetcher.fetch(input.seedTerm);
    const result: TrendFetchResult = {
      enabled: true,
      seedTerm: input.seedTerm,
      keywords: fetched.keywords,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      source: fetched.source,
    };
    if (input.cache) input.cache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      enabled: true,
      seedTerm: input.seedTerm,
      keywords: [],
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      source: 'mock',
      fallbackReason: `TREND_FETCH_FAILED: ${(err as Error)?.message ?? 'unknown'}`,
    };
  }
}

/**
 * 트렌드 결과를 LLM 프롬프트 블록으로 변환. 결과가 비어 있으면 빈 문자열.
 */
export function buildTrendPromptBlock(result: TrendFetchResult): string {
  if (!result.enabled) return '';
  if (result.keywords.length === 0) return '';

  const lines: string[] = [
    `## [최근 트렌드 — ${result.seedTerm} 관련]`,
    `(출처: ${result.source}, 수집 ${result.fetchedAt.slice(0, 10)})`,
  ];
  for (const kw of result.keywords.slice(0, 10)) {
    const trendIcon = kw.trend === 'rising' ? '↑' : kw.trend === 'falling' ? '↓' : '→';
    lines.push(`  • ${kw.rank}. ${kw.term} ${trendIcon}${kw.relativeScore !== undefined ? ` (${kw.relativeScore})` : ''}`);
  }
  lines.push('', '## [트렌드 활용 규칙]');
  lines.push('- 위 키워드를 본문에 자연스럽게 1~2회 인용 가능 (강제 X).');
  lines.push('- 트렌드 키워드를 모든 헤딩에 욱여넣지 말 것 (SEO 스팸).');
  lines.push('- 표에 없는 트렌드는 추측 금지 (환각 차단).');
  return lines.join('\n');
}
