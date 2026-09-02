import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compareTitleWithSerp } from '../analytics/serpTitleBenchmark';

/**
 * [2026-09-02 사장님] "사람들이 제목으로 정하는 걸 참고해서 대량으로 학습하고 내 거랑 대조."
 * 프로브가 가져온 상위 글 제목과 내 제목을 형태(구절 온전성·앞쪽 배치·길이)로 대조한다.
 */
const KW = '종아리 마사지기';
const TOP = [
  '종아리 마사지기 추천, 부모님 선물로 고른 이유',
  '종아리 마사지기 효과 있을까? 한 달 써본 결과',
  '바지형 종아리 마사지기 비교 — 압박 위치가 다르다',
  '종아리 마사지기 고르는 기준 3가지',
  '어르신 선물 종아리 마사지기, 소음부터 확인',
  '닥터웰 DR-5180 후기 — 종아리 마사지기 처음이라면',
  '공기압 안마기 vs 종아리 마사지기 차이',
  '종아리 마사지기 부작용? 사용 전 알아둘 것',
];

describe('상위 글 제목 대조', () => {
  it('상위 다수가 검색어를 그대로 쓰는데 내 제목이 토막 나 있으면 첫 번째 고칠 점으로 말한다', () => {
    const r = compareTitleWithSerp('닥터웰 에어웨이브 DR-5180 공기압 마사지기, 종아리 압박 위치 후기', KW, TOP);
    expect(r.sampleSize).toBe(8);
    expect(r.intactShare).toBeGreaterThanOrEqual(0.5);
    expect(r.ourIntact).toBe(false);
    expect(r.verdict).toBe('lagging');
    expect(r.lines[0]).toMatch(/상위 8개 중 \d+개가 "종아리 마사지기" 를 그대로/u);
  });

  it('내 제목도 검색어를 그대로 앞쪽에 뒀으면 aligned', () => {
    const r = compareTitleWithSerp('종아리 마사지기 부모님 선물, 압박 위치부터 볼 것', KW, TOP);
    expect(r.verdict).toBe('aligned');
    expect(r.ourFront).toBe(true);
    expect(r.lines[0]).toMatch(/내 제목도 그렇습니다/u);
  });

  it('구절은 있는데 뒤로 밀렸으면 앞으로 옮기라고 한다', () => {
    const r = compareTitleWithSerp('어르신 선물로 고민하다 고른 바지형 공기압 안마기 중에서 종아리 마사지기', KW, TOP);
    expect(r.ourIntact).toBe(true);
    expect(r.ourFront).toBe(false);
    expect(r.verdict).toBe('lagging');
    expect(r.lines[0]).toMatch(/앞으로 옮기세요/u);
  });

  it('상위 글 중앙값보다 1.5배 길면 잘린다고 말한다', () => {
    const long = '종아리 마사지기 부모님 선물로 고르면서 압박 위치와 소음과 보관과 설명서와 배송까지 전부 확인한 기록을 정리해 봅니다';
    const r = compareTitleWithSerp(long, KW, TOP);
    expect(r.lines.some((l) => l.includes('잘립니다'))).toBe(true);
  });

  it('상위 글 대부분이 검색어를 안 쓰면 off-keyword — 제목이 아니라 키워드 문제라고 말한다 (헬스헬퍼 실측)', () => {
    const r = compareTitleWithSerp('헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]', '헬스헬퍼 맥스컷 프로 크롬', [
      '맥스컷 후기, 식후 혈당 관리에 도움 됐을까', '헬스헬퍼 맥스컷 한 달 복용기', '가르시니아 다이어트 보조제 비교',
      '식후 나른함 줄이는 방법', '맥스컷 프로 성분 정리', '다이어트 보조제 고르는 기준', '혈당 관리 영양제 추천', '헬스헬퍼 제품 정리',
    ]);
    expect(r.verdict).toBe('off-keyword');
    expect(r.lines[0]).toMatch(/키워드를 다시 보세요/u);
    expect(r.lines.join(' ')).not.toMatch(/내 제목도 그렇습니다/u);
  });
  it('표본이 3개 미만이면 판정하지 않는다', () => {
    const r = compareTitleWithSerp('종아리 마사지기 추천', KW, TOP.slice(0, 2));
    expect(r.verdict).toBe('insufficient');
    expect(r.lines).toEqual([]);
  });
});

describe('배선: 벤치마크가 제목 대조를 얹고, 핸들러가 내 제목을 넘긴다', () => {
  it('analyzeBenchmark 가 ourTitle 을 받아 상위 글 제목과 대조한다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'analytics', 'benchmarkAnalyzer.ts'), 'utf-8').replace(/\r/g, '');
    expect(src).toMatch(/ourTitle\?: string/u);
    expect(src).toMatch(/compareTitleWithSerp\(/u);
    expect(src).toMatch(/posts\.map\(\(p\) => p\.item\.title\)/u);
  });

  it('serp:benchmark 핸들러가 req.ourTitle 을 넘긴다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'main', 'ipc', 'serpProbeHandlers.ts'), 'utf-8').replace(/\r/g, '');
    expect(src).toMatch(/analyzeBenchmark\([^)]*serpReport,\s*req\.ourTitle/u);
  });
});
