/**
 * SPEC-CONVERSION-001 L3-2 — seasonResolver + trendCache + trendCollector 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveSeason, buildSeasonPromptBlock } from '../trend/seasonResolver';
import { TrendCache } from '../trend/trendCache';
import {
  collectTrend,
  isTrendInjectEnabled,
  buildTrendPromptBlock,
  type TrendFetcher,
} from '../trend/trendCollector';

describe('resolveSeason — 계절 분기', () => {
  it('3~5월은 봄', () => {
    const ctx = resolveSeason(new Date('2026-04-15'));
    expect(ctx.season).toBe('spring');
    expect(ctx.seasonLabel).toBe('봄');
  });
  it('6~8월은 여름', () => {
    expect(resolveSeason('2026-07-10').season).toBe('summer');
  });
  it('9~11월은 가을', () => {
    expect(resolveSeason('2026-10-15').season).toBe('autumn');
  });
  it('12~2월은 겨울', () => {
    expect(resolveSeason('2026-01-05').season).toBe('winter');
    expect(resolveSeason('2026-12-25').season).toBe('winter');
  });
  it('잘못된 날짜는 throw', () => {
    expect(() => resolveSeason('not-a-date')).toThrow(/SEASON_INVALID_DATE/);
  });
});

describe('resolveSeason — 한국 시즌 이벤트', () => {
  it('5월은 가정의 달', () => {
    const ev = resolveSeason('2026-05-08').events;
    expect(ev).toContain('가정의 달');
  });
  it('11월 25일은 수능 기간 + 연말 쇼핑', () => {
    const ev = resolveSeason('2026-11-25').events;
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.join('|')).toMatch(/수능|블랙프라이데이/);
  });
  it('해를 넘기는 이벤트(12/20~1/10)', () => {
    expect(resolveSeason('2026-12-31').events).toContain('연말연시·새해');
    expect(resolveSeason('2026-01-05').events).toContain('연말연시·새해');
  });
  it('이벤트 없는 날 (예: 6월 20일)', () => {
    const ev = resolveSeason('2026-06-20').events;
    expect(ev.length).toBe(0);
  });
});

describe('buildSeasonPromptBlock', () => {
  it('이벤트 있을 때 블록 생성', () => {
    const block = buildSeasonPromptBlock(resolveSeason('2026-05-08'));
    expect(block).toContain('봄');
    expect(block).toContain('가정의 달');
  });
  it('이벤트 없을 때도 안전 출력', () => {
    const block = buildSeasonPromptBlock(resolveSeason('2026-06-20'));
    expect(block).toContain('일반 톤');
  });
});

describe('TrendCache', () => {
  it('miss → set → hit', () => {
    const c = new TrendCache<string>(10, 1000);
    expect(c.get('a')).toBeUndefined();
    c.set('a', 'A');
    expect(c.get('a')).toBe('A');
    expect(c.stats().hits).toBe(1);
  });

  it('TTL 만료', () => {
    let now = 0;
    const c = new TrendCache<string>(10, 100, () => now);
    c.set('a', 'A');
    expect(c.get('a')).toBe('A');
    now = 200;
    expect(c.get('a')).toBeUndefined();
  });

  it('maxSize 초과 evict', () => {
    const c = new TrendCache<string>(2, 1_000_000);
    c.set('a', 'A');
    c.set('b', 'B');
    c.set('c', 'C');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe('B');
    expect(c.get('c')).toBe('C');
  });

  it('잘못된 maxSize·TTL은 throw', () => {
    expect(() => new TrendCache(0)).toThrow(/MAX_SIZE_INVALID/);
    expect(() => new TrendCache(10, 0)).toThrow(/TTL_INVALID/);
  });
});

describe('isTrendInjectEnabled', () => {
  beforeEach(() => { delete process.env.TREND_INJECT_V1; });
  it('forceFlag=true → ON', () => expect(isTrendInjectEnabled(true)).toBe(true));
  it('forceFlag=false → OFF', () => expect(isTrendInjectEnabled(false)).toBe(false));
  it('env 미설정 → OFF', () => expect(isTrendInjectEnabled()).toBe(false));
  it('env=on → ON', () => {
    process.env.TREND_INJECT_V1 = 'on';
    expect(isTrendInjectEnabled()).toBe(true);
  });
});

describe('collectTrend — 정상·OFF·캐시', () => {
  function mockFetcher(keywords: any[], source: 'datalab' | 'autocomplete' | 'mock' = 'datalab'): TrendFetcher {
    return { fetch: vi.fn(async () => ({ keywords, source })) };
  }

  beforeEach(() => { delete process.env.TREND_INJECT_V1; });

  it('flag OFF → enabled=false, 호출 없음', async () => {
    const f = mockFetcher([]);
    const r = await collectTrend({ seedTerm: '카페', forceFlag: false, fetcher: f });
    expect(r.enabled).toBe(false);
    expect(r.fallbackReason).toMatch(/미활성화/);
    expect((f.fetch as any).mock.calls).toHaveLength(0);
  });

  it('flag ON 정상 fetch', async () => {
    const f = mockFetcher([
      { term: '강남 카페', rank: 1, trend: 'rising', relativeScore: 90 },
      { term: '맛집 추천', rank: 2, trend: 'stable' },
    ]);
    const r = await collectTrend({ seedTerm: '카페', forceFlag: true, fetcher: f });
    expect(r.enabled).toBe(true);
    expect(r.keywords).toHaveLength(2);
    expect(r.source).toBe('datalab');
  });

  it('빈 seedTerm은 명시 fallback', async () => {
    const r = await collectTrend({ seedTerm: '   ', forceFlag: true, fetcher: mockFetcher([]) });
    expect(r.fallbackReason).toMatch(/TREND_SEED_EMPTY/);
  });

  it('fetch 실패는 명시 reason', async () => {
    const failing: TrendFetcher = {
      fetch: vi.fn(async () => { throw new Error('API rate limit'); }),
    };
    const r = await collectTrend({ seedTerm: '카페', forceFlag: true, fetcher: failing });
    expect(r.fallbackReason).toMatch(/TREND_FETCH_FAILED.*rate limit/);
    expect(r.keywords).toEqual([]);
  });

  it('cache hit 시 source=cache + fetcher 호출 안 함', async () => {
    const cache = new TrendCache<any>(10, 1_000_000);
    const f = mockFetcher([{ term: 'X', rank: 1, trend: 'rising' }]);
    await collectTrend({ seedTerm: '카페', forceFlag: true, fetcher: f, cache });
    const r2 = await collectTrend({ seedTerm: '카페', forceFlag: true, fetcher: f, cache });
    expect(r2.source).toBe('cache');
    expect((f.fetch as any).mock.calls).toHaveLength(1); // 한 번만 호출
  });
});

describe('buildTrendPromptBlock', () => {
  it('keywords 있을 때 블록 생성', () => {
    const block = buildTrendPromptBlock({
      enabled: true,
      seedTerm: '카페',
      keywords: [{ term: '강남 카페', rank: 1, trend: 'rising', relativeScore: 95 }],
      fetchedAt: '2026-05-10T00:00:00.000Z',
      elapsedMs: 100,
      source: 'datalab',
    });
    expect(block).toContain('강남 카페');
    expect(block).toContain('↑');
    expect(block).toContain('95');
    expect(block).toContain('환각 차단');
  });

  it('비활성·빈 결과는 빈 문자열', () => {
    const r = {
      enabled: false, seedTerm: 'x', keywords: [], fetchedAt: 'x', elapsedMs: 0,
      source: 'mock' as const,
    };
    expect(buildTrendPromptBlock(r)).toBe('');
  });
});
