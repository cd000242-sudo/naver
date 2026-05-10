/**
 * SPEC-CONVERSION-001 L2-1.9 — Stage별 캐싱 (LRU + 옵션 TTL)
 *
 * 5단계 체인드 파이프라인의 비용·지연 절감용 캐시.
 *
 * 캐시 대상:
 *   - Stage 1 (categoryClassifier): 결정론 — 같은 입력은 같은 카테고리.
 *   - Stage 2 (personaBuilder): 결정론 — 같은 입력은 같은 페르소나.
 *   - Stage 3·5 (LLM): 본 모듈 미적용 (LLM 응답은 비결정·비용 캐시는 별도 정책 필요).
 *
 * 메모리 [silent 폴백 금지]: 캐시 hit/miss는 명시 메트릭으로 노출.
 * 메모리 [추정 효과 금지]: hit rate 보장 X — 운영 데이터로 calibrate.
 *
 * 파일 한도 150줄 준수.
 */

import type { CategoryClassifierInput, CategoryClassifierResult } from './categoryClassifier';
import type { PersonaBuilderInput, PersonaProfile } from './personaBuilder';

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly maxSize: number;
  readonly hitRate: number; // 0~1
}

interface CacheEntry<V> {
  value: V;
  insertedAt: number;
}

/**
 * 작은 LRU 캐시. Map 삽입 순서를 활용해 O(1) get/set.
 * TTL은 옵션 — 결정론 stage는 미사용.
 */
export class ChainCache<V> {
  private readonly map = new Map<string, CacheEntry<V>>();
  private hitCount = 0;
  private missCount = 0;

  constructor(
    public readonly maxSize: number = 200,
    private readonly ttlMs?: number,
  ) {
    if (!Number.isFinite(maxSize) || maxSize <= 0) {
      throw new Error(`ChainCache: maxSize must be positive integer, got ${maxSize}`);
    }
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }
    if (this.ttlMs !== undefined && Date.now() - entry.insertedAt > this.ttlMs) {
      this.map.delete(key);
      this.missCount++;
      return undefined;
    }
    // LRU bump — 최근 사용 항목을 끝으로 이동
    this.map.delete(key);
    this.map.set(key, entry);
    this.hitCount++;
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, insertedAt: Date.now() });
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
    this.hitCount = 0;
    this.missCount = 0;
  }

  stats(): CacheStats {
    const total = this.hitCount + this.missCount;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      size: this.map.size,
      maxSize: this.maxSize,
      hitRate: total === 0 ? 0 : this.hitCount / total,
    };
  }
}

// ── 키 빌더 (결정론 해시) ─────────────────────────────────────

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h | 0;
  }
  return (h >>> 0).toString(36);
}

export function buildClassifyKey(input: CategoryClassifierInput): string {
  // rawText는 앞 200자만 — ReDoS·키 폭주 방지
  const parts = [
    input.title ?? '',
    input.productHint ?? '',
    input.existingHint ?? '',
    (input.rawText ?? '').slice(0, 200),
  ];
  return `c:${djb2(parts.join('|'))}`;
}

export function buildPersonaKey(input: PersonaBuilderInput): string {
  const parts = [
    String(input.category ?? ''),
    input.productHint ?? '',
    input.toneOverride ?? '',
    (input.userVoice ?? []).join('|').slice(0, 300),
  ];
  return `p:${djb2(parts.join('::'))}`;
}

// ── 글로벌 캐시 인스턴스 (체인 파이프라인 공유) ─────────────

export const classifyCache = new ChainCache<CategoryClassifierResult>(200);
export const personaCache = new ChainCache<PersonaProfile>(200);

export interface AllChainCacheStats {
  readonly classify: CacheStats;
  readonly persona: CacheStats;
}

export function getChainCacheStats(): AllChainCacheStats {
  return {
    classify: classifyCache.stats(),
    persona: personaCache.stats(),
  };
}

export function clearAllChainCaches(): void {
  classifyCache.clear();
  personaCache.clear();
}
