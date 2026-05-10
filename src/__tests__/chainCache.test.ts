/**
 * SPEC-CONVERSION-001 L2-1.9 — chainCache 단위 테스트.
 * LRU 동작·TTL·키 결정론·통합 메트릭 검증.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChainCache,
  buildClassifyKey,
  buildPersonaKey,
  classifyCache,
  personaCache,
  getChainCacheStats,
  clearAllChainCaches,
} from '../content/chainCache';
import { runChainedGeneration } from '../content/chainedGeneration';

describe('ChainCache — LRU 동작', () => {
  it('miss는 undefined, set 후 hit 반환', () => {
    const c = new ChainCache<number>(10);
    expect(c.get('a')).toBeUndefined();
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
  });

  it('maxSize 초과 시 가장 오래된 키 evict', () => {
    const c = new ChainCache<number>(3);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    c.set('d', 4); // 'a' evicted
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.get('d')).toBe(4);
  });

  it('get 호출 시 LRU bump — 최근 사용 항목은 evict 대상에서 빠짐', () => {
    const c = new ChainCache<number>(3);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    c.get('a'); // bump 'a' to most recent
    c.set('d', 4); // 'b' evicted (가장 오래된)
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });

  it('TTL 만료 시 miss 처리', async () => {
    const c = new ChainCache<number>(10, 30); // 30ms TTL
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(c.get('a')).toBeUndefined();
  });

  it('stats에 hits/misses/hitRate 노출', () => {
    const c = new ChainCache<number>(10);
    c.set('a', 1);
    c.get('a'); // hit
    c.get('a'); // hit
    c.get('b'); // miss
    const s = c.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(2 / 3, 5);
    expect(s.size).toBe(1);
    expect(s.maxSize).toBe(10);
  });

  it('maxSize 0 또는 음수는 throw', () => {
    expect(() => new ChainCache<number>(0)).toThrow(/maxSize must be positive/);
    expect(() => new ChainCache<number>(-1)).toThrow(/maxSize must be positive/);
    expect(() => new ChainCache<number>(NaN)).toThrow(/maxSize must be positive/);
  });

  it('clear는 항목·통계 모두 리셋', () => {
    const c = new ChainCache<number>(10);
    c.set('a', 1);
    c.get('a');
    c.get('b');
    c.clear();
    expect(c.stats()).toMatchObject({ hits: 0, misses: 0, size: 0 });
  });
});

describe('buildClassifyKey — 결정론 해시', () => {
  it('같은 입력은 같은 키', () => {
    const a = buildClassifyKey({ title: 'X', rawText: 'Y', productHint: 'Z' });
    const b = buildClassifyKey({ title: 'X', rawText: 'Y', productHint: 'Z' });
    expect(a).toBe(b);
  });

  it('다른 입력은 다른 키 (충돌 회피)', () => {
    const a = buildClassifyKey({ title: 'X' });
    const b = buildClassifyKey({ title: 'Y' });
    expect(a).not.toBe(b);
  });

  it('rawText 200자 초과는 키 폭주 방지 위해 잘라냄', () => {
    const long = 'A'.repeat(500);
    const longer = 'A'.repeat(500) + 'B'.repeat(500); // 앞 200자만 비교 — 동일 키
    const a = buildClassifyKey({ title: 'X', rawText: long });
    const b = buildClassifyKey({ title: 'X', rawText: longer });
    expect(a).toBe(b);
  });

  it('빈 입력도 안전 (모든 필드 undefined)', () => {
    expect(() => buildClassifyKey({})).not.toThrow();
    const k = buildClassifyKey({});
    expect(k).toMatch(/^c:/);
  });
});

describe('buildPersonaKey — 결정론 해시', () => {
  it('같은 입력은 같은 키', () => {
    const a = buildPersonaKey({ category: 'food', productHint: '카페' });
    const b = buildPersonaKey({ category: 'food', productHint: '카페' });
    expect(a).toBe(b);
  });

  it('toneOverride·userVoice가 키에 반영됨', () => {
    const a = buildPersonaKey({ category: 'food' });
    const b = buildPersonaKey({ category: 'food', toneOverride: 'casual' });
    const c = buildPersonaKey({ category: 'food', userVoice: ['댓글'] });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
});

describe('chainedGeneration 통합 — 캐시 적중 검증', () => {
  beforeEach(() => clearAllChainCaches());

  it('동일 입력 재호출 시 classify·persona 캐시 hit', async () => {
    const input = {
      forceFlag: true,
      title: '강남 김치찌개 맛집',
      productHint: '한식 맛집',
    };

    const r1 = await runChainedGeneration(input);
    expect(r1.metrics[0].note).not.toContain('cached');
    expect(r1.metrics[1].note).not.toContain('cached');

    const r2 = await runChainedGeneration(input);
    expect(r2.metrics[0].note).toContain('cached');
    expect(r2.metrics[1].note).toContain('cached');

    const stats = getChainCacheStats();
    expect(stats.classify.hits).toBe(1);
    expect(stats.classify.misses).toBe(1);
    expect(stats.persona.hits).toBe(1);
    expect(stats.persona.misses).toBe(1);
  });

  it('다른 입력은 캐시 miss (서로 다른 키)', async () => {
    await runChainedGeneration({ forceFlag: true, title: '맛집 후기' });
    await runChainedGeneration({ forceFlag: true, title: '카페 후기' });
    const stats = getChainCacheStats();
    expect(stats.classify.misses).toBe(2);
    expect(stats.classify.hits).toBe(0);
  });

  it('feature flag OFF면 캐시도 사용 안 함 (early return)', async () => {
    const r = await runChainedGeneration({ forceFlag: false, title: '주제' });
    expect(r.enabled).toBe(false);
    const stats = getChainCacheStats();
    // Stage 1·2 자체를 안 돌리므로 hits·misses 모두 0
    expect(stats.classify.hits + stats.classify.misses).toBe(0);
    expect(stats.persona.hits + stats.persona.misses).toBe(0);
  });
});

describe('SPEC 메모리 원칙', () => {
  it('캐시 hit 시에도 결과는 결정론 (같은 객체 또는 동일 값)', () => {
    classifyCache.clear();
    personaCache.clear();
    const input = { title: '강남 카페' };
    const k = buildClassifyKey(input);
    classifyCache.set(k, { category: 'food', confidence: 0.5, matchedKeywords: ['카페'], source: 'keyword' });
    const r1 = classifyCache.get(k);
    const r2 = classifyCache.get(k);
    expect(r1).toEqual(r2);
  });
});
