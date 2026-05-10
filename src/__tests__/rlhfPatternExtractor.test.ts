/**
 * SPEC-CONVERSION-001 L4-2.3 — rlhfPatternExtractor 단위 테스트.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractPatterns,
  summarizePatternResult,
} from '../monitor/rlhfPatternExtractor';
import { InMemoryConversionStore, type ConversionEvent } from '../monitor/conversionStore';
import type { BenchmarkAnalysis } from '../content/benchmarkAnalyzer';

function event(postId: string, type: ConversionEvent['eventType'], value?: number, ts?: string): ConversionEvent {
  return {
    postId,
    eventType: type,
    timestamp: ts ?? new Date('2026-05-10T10:00:00Z').toISOString(),
    value,
  };
}

function fakeAnalysis(postId: string, signature: string, charCount: number, headings: number, kwTerms: string[]): BenchmarkAnalysis {
  return {
    url: `https://x/${postId}`,
    category: 'food',
    title: `글 ${postId}`,
    stats: {
      charCount, wordCount: 0,
      headingCount: headings,
      avgHeadingDistance: 0,
      paragraphCount: 0,
      imageHintCount: 3,
    },
    headings: [],
    topKeywords: kwTerms.map((term, i) => ({ term, count: 10 - i, density: 0.01 })),
    structureSignature: signature,
    analyzedAt: new Date().toISOString(),
  };
}

describe('extractPatterns — 정상', () => {
  let store: InMemoryConversionStore;
  beforeEach(() => { store = new InMemoryConversionStore(); });

  it('상위 20% conversion rate 글 추출', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    // 각 글에 impression·click·purchase 이벤트 시뮬레이션
    // a: conversion 50%, 나머지: 10%
    await store.recordBatch([
      // a: 10 imp, 10 click, 5 purchase
      ...Array(10).fill(0).map(() => event('a', 'impression')),
      ...Array(10).fill(0).map(() => event('a', 'click')),
      ...Array(5).fill(0).map(() => event('a', 'purchase', 10000)),
      // b~e: 10 imp, 10 click, 1 purchase
      ...['b', 'c', 'd', 'e'].flatMap((id) => [
        ...Array(10).fill(0).map(() => event(id, 'impression')),
        ...Array(10).fill(0).map(() => event(id, 'click')),
        event(id, 'purchase', 5000),
      ]),
    ]);

    const r = await extractPatterns({
      store, postIds: ids, topPercent: 0.2, minSampleSize: 3,
    });
    // analyses 미주입 → fallbackReason은 NO_BENCHMARK_ANALYSES_PROVIDED지만
    // topPosts·totalPosts는 정상 반환
    expect(r.fallbackReason).toBe('NO_BENCHMARK_ANALYSES_PROVIDED');
    expect(r.totalPosts).toBe(5);
    expect(r.topPosts).toHaveLength(1);
    expect(r.topPosts[0].postId).toBe('a');
    expect(r.topPosts[0].metricValue).toBeCloseTo(0.5, 5);
  });

  it('clickRate 정렬', async () => {
    const ids = ['x', 'y', 'z'];
    await store.recordBatch([
      // x: imp 10, click 5
      ...Array(10).fill(0).map(() => event('x', 'impression')),
      ...Array(5).fill(0).map(() => event('x', 'click')),
      // y: imp 10, click 1
      ...Array(10).fill(0).map(() => event('y', 'impression')),
      event('y', 'click'),
      // z: imp 10, click 0
      ...Array(10).fill(0).map(() => event('z', 'impression')),
    ]);
    const r = await extractPatterns({
      store, postIds: ids, metric: 'clickRate', topPercent: 0.4, minSampleSize: 2,
    });
    expect(r.topPosts[0].postId).toBe('x');
  });

  it('analyses 주입 시 패턴 집계', async () => {
    const ids = ['a', 'b', 'c'];
    for (const id of ids) {
      await store.recordBatch([
        ...Array(10).fill(0).map(() => event(id, 'impression')),
        ...Array(5).fill(0).map(() => event(id, 'click')),
        event(id, 'purchase', 10000),
      ]);
    }
    const analyses: Record<string, BenchmarkAnalysis> = {
      a: fakeAnalysis('a', '1-2-2-2-2', 2400, 5, ['카페', '인테리어', '메뉴']),
      b: fakeAnalysis('b', '1-2-2-2-2', 2300, 5, ['카페', '맛집']),
      c: fakeAnalysis('c', '1-2-2-3', 2000, 4, ['요리']),
    };
    const r = await extractPatterns({
      store, postIds: ids, analyses, minSampleSize: 2, topPercent: 1,
    });
    expect(r.aggregatedPatterns.avgCharCount).toBeGreaterThan(0);
    expect(r.aggregatedPatterns.topStructureSignatures[0].signature).toBe('1-2-2-2-2');
    expect(r.aggregatedPatterns.topKeywords.find((k) => k.term === '카페')).toBeDefined();
  });
});

describe('extractPatterns — fallback', () => {
  let store: InMemoryConversionStore;
  beforeEach(() => { store = new InMemoryConversionStore(); });

  it('샘플 미만은 fallback reason', async () => {
    const r = await extractPatterns({
      store, postIds: ['a'], minSampleSize: 5,
    });
    expect(r.fallbackReason).toMatch(/INSUFFICIENT_SAMPLES/);
  });

  it('aggregate 못 만든 글들은 카운트 X', async () => {
    // 이벤트 없는 postIds
    const r = await extractPatterns({
      store, postIds: ['no1', 'no2', 'no3'], minSampleSize: 2,
    });
    expect(r.fallbackReason).toMatch(/NOT_ENOUGH_AGGREGATED/);
  });

  it('analyses 주입 안 하면 NO_BENCHMARK_ANALYSES_PROVIDED', async () => {
    const ids = ['a', 'b'];
    for (const id of ids) {
      await store.record(event(id, 'click'));
      await store.record(event(id, 'impression'));
    }
    const r = await extractPatterns({
      store, postIds: ids, minSampleSize: 1, topPercent: 1,
    });
    expect(r.fallbackReason).toMatch(/NO_BENCHMARK_ANALYSES_PROVIDED/);
  });
});

describe('summarizePatternResult', () => {
  it('fallback이면 분석 불가 명시', () => {
    expect(summarizePatternResult({
      metric: 'conversionRate', totalPosts: 0, topPosts: [],
      aggregatedPatterns: { avgCharCount: 0, avgHeadingCount: 0, avgImageCount: 0, topStructureSignatures: [], topKeywords: [], perCategory: {} },
      fallbackReason: 'TEST',
    })).toMatch(/분석 불가.*TEST/);
  });
});
