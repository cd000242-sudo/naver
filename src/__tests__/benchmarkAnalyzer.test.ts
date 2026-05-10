/**
 * SPEC-CONVERSION-001 L2-4.3 — benchmarkAnalyzer 단위 테스트.
 * 헤딩 추출·토큰화·집계·짧은 본문 fallback 검증.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeBenchmark,
  extractHeadings,
  tokenizeKorean,
  topKeywords,
  aggregateBenchmarks,
} from '../content/benchmarkAnalyzer';

const sampleBody = [
  '# 강남 김치찌개 맛집 후기',
  '',
  '김치찌개를 먹으러 갔다. 분위기가 깔끔했다. '.repeat(20),
  '',
  '## 찾아간 계기',
  '',
  '김치찌개에 진심인 편이라 검색해서 찾았다. '.repeat(15),
  '',
  '## 메뉴 구성',
  '',
  '김치찌개와 반찬이 나왔다. 메뉴는 단출했다. '.repeat(15),
  '',
  '![사진](https://x/1.jpg)',
  '',
  '## 결론',
  '',
  '재방문 의사가 있다. '.repeat(20),
].join('\n');

describe('extractHeadings', () => {
  it('# ## ### 헤딩 모두 레벨·텍스트·위치 반환', () => {
    const heads = extractHeadings(sampleBody);
    expect(heads.length).toBeGreaterThanOrEqual(4);
    expect(heads[0]).toMatchObject({ level: 1, text: '강남 김치찌개 맛집 후기', position: 0 });
    expect(heads[1].level).toBe(2);
  });

  it('빈 입력은 빈 배열', () => {
    expect(extractHeadings('')).toEqual([]);
  });

  it('# 없으면 빈 배열', () => {
    expect(extractHeadings('일반 본문 텍스트')).toEqual([]);
  });
});

describe('tokenizeKorean', () => {
  it('한글 2자+ · 영문 3자+ 추출, stopword 제거', () => {
    const tokens = tokenizeKorean('김치찌개 정말 맛있다. cafe 분위기는 깔끔했다.');
    expect(tokens).toContain('김치찌개');
    expect(tokens).toContain('맛있다');
    expect(tokens).toContain('cafe');
    expect(tokens).toContain('깔끔했다');
    expect(tokens).not.toContain('정말'); // stopword
  });

  it('빈 입력은 빈 배열', () => {
    expect(tokenizeKorean('')).toEqual([]);
  });
});

describe('topKeywords', () => {
  it('빈도 상위 N개 반환', () => {
    const tokens = ['김치찌개', '김치찌개', '김치찌개', '맛집', '맛집', '분위기'];
    const top = topKeywords(tokens, 2);
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ term: '김치찌개', count: 3 });
    expect(top[1]).toMatchObject({ term: '맛집', count: 2 });
    expect(top[0].density).toBeCloseTo(3 / 6, 5);
  });

  it('빈 토큰은 빈 결과', () => {
    expect(topKeywords([])).toEqual([]);
  });
});

describe('analyzeBenchmark — 정상 분석', () => {
  it('charCount·헤딩·키워드·구조 시그니처 반환', () => {
    const a = analyzeBenchmark({
      url: 'https://blog.naver.com/x/1',
      category: 'food',
      title: '강남 김치찌개 맛집 후기',
      bodyText: sampleBody,
    });
    expect(a.stats.charCount).toBeGreaterThan(500);
    expect(a.stats.headingCount).toBeGreaterThanOrEqual(4);
    expect(a.stats.imageHintCount).toBeGreaterThanOrEqual(1);
    expect(a.headings.length).toBeGreaterThan(0);
    expect(a.topKeywords.length).toBeGreaterThan(0);
    expect(a.structureSignature).toMatch(/^[0-9-]+$/);
    expect(a.fallbackReason).toBeUndefined();
  });

  it('avgHeadingDistance가 0보다 큼', () => {
    const a = analyzeBenchmark({
      url: 'x', category: 'food', title: 't', bodyText: sampleBody,
    });
    expect(a.stats.avgHeadingDistance).toBeGreaterThan(0);
  });
});

describe('analyzeBenchmark — fallback (silent 위조 X)', () => {
  it('200자 미만은 fallbackReason 명시', () => {
    const a = analyzeBenchmark({
      url: 'x', category: 'food', title: 't', bodyText: '짧은 본문',
    });
    expect(a.fallbackReason).toMatch(/BODY_TOO_SHORT/);
    expect(a.stats.charCount).toBe(0);
    expect(a.headings).toEqual([]);
  });

  it('빈 본문도 안전 처리', () => {
    const a = analyzeBenchmark({
      url: 'x', category: 'food', title: 't', bodyText: '',
    });
    expect(a.fallbackReason).toMatch(/BODY_TOO_SHORT/);
  });
});

describe('aggregateBenchmarks', () => {
  it('빈 배열은 zero 통계', () => {
    const ag = aggregateBenchmarks([]);
    expect(ag.totalSamples).toBe(0);
    expect(ag.avgCharCount).toBe(0);
    expect(ag.topStructureSignatures).toEqual([]);
  });

  it('카테고리별 카운트 + 시그니처 빈도', () => {
    const a1 = analyzeBenchmark({ url: '1', category: 'food', title: 't', bodyText: sampleBody });
    const a2 = analyzeBenchmark({ url: '2', category: 'food', title: 't', bodyText: sampleBody });
    const a3 = analyzeBenchmark({ url: '3', category: 'tech', title: 't', bodyText: sampleBody });
    const ag = aggregateBenchmarks([a1, a2, a3]);
    expect(ag.totalSamples).toBe(3);
    expect(ag.perCategoryCount.food).toBe(2);
    expect(ag.perCategoryCount.tech).toBe(1);
    expect(ag.topStructureSignatures.length).toBeGreaterThan(0);
    expect(ag.avgCharCount).toBeGreaterThan(0);
  });

  it('짧은 본문(invalid) 분석 결과는 집계에서 제외', () => {
    const valid = analyzeBenchmark({ url: '1', category: 'food', title: 't', bodyText: sampleBody });
    const invalid = analyzeBenchmark({ url: '2', category: 'food', title: 't', bodyText: 'x' });
    const ag = aggregateBenchmarks([valid, invalid]);
    expect(ag.totalSamples).toBe(1); // valid only
  });
});
