/**
 * SPEC-CONVERSION-001 L3-2.4 — 트렌드 결과 캐시 (TTL 6시간)
 *
 * trendCollector 결과를 키워드별로 캐싱. 외부 API 비용·rate limit 완화.
 * chainCache.ts와 동일 LRU 패턴이지만 TTL 기본 6시간.
 *
 * 메모리 [silent 폴백 금지]: 만료 시 명시 miss.
 * 메모리 [추정 효과 금지]: hit rate 보장 X.
 *
 * 파일 한도 100줄 준수.
 */

export interface TrendCacheEntry<V> {
  readonly value: V;
  readonly cachedAt: number;
}

export interface TrendCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly maxSize: number;
  readonly ttlMs: number;
}

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;   // 6시간

export class TrendCache<V> {
  private readonly map = new Map<string, TrendCacheEntry<V>>();
  private hits = 0;
  private misses = 0;

  constructor(
    public readonly maxSize: number = DEFAULT_MAX_SIZE,
    public readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly nowFn: () => number = () => Date.now(),
  ) {
    if (maxSize <= 0 || !Number.isFinite(maxSize)) {
      throw new Error(`TREND_CACHE_MAX_SIZE_INVALID: ${maxSize}`);
    }
    if (ttlMs <= 0 || !Number.isFinite(ttlMs)) {
      throw new Error(`TREND_CACHE_TTL_INVALID: ${ttlMs}`);
    }
  }

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    if (this.nowFn() - e.cachedAt > this.ttlMs) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    // LRU bump
    this.map.delete(key);
    this.map.set(key, e);
    this.hits++;
    return e.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, cachedAt: this.nowFn() });
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): TrendCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.map.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}
