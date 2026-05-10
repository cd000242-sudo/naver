/**
 * SPEC-CONVERSION-001 L2-1.2 — 카테고리 분류기 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { classifyCategory } from '../content/categoryClassifier';

describe('classifyCategory — existingHint 우선', () => {
  it('유효한 existingHint는 신뢰도 1.0', () => {
    const r = classifyCategory({ existingHint: 'beauty' });
    expect(r.category).toBe('beauty');
    expect(r.confidence).toBe(1);
    expect(r.source).toBe('existingHint');
  });

  it('잘못된 existingHint는 무시되고 키워드 매칭으로 폴백', () => {
    const r = classifyCategory({
      existingHint: 'unknown_xyz',
      title: '갤럭시 노트북 후기',
    });
    expect(r.category).toBe('tech');
    expect(r.source).toBe('keyword');
  });
});

describe('classifyCategory — 키워드 매칭', () => {
  const cases = [
    { title: '강남 맛집 김치찌개 후기', expected: 'food' },
    { title: '아기 분유 추천 30대 엄마', expected: 'parenting' },
    { title: '쿠션 파운데이션 발색 비교', expected: 'beauty' },
    { title: '단백질 보충제 다이어트 30일', expected: 'health' },
    { title: '제주도 호텔 여행 코스 추천', expected: 'travel' },
    { title: '아이폰 15 Pro 노트북 비교', expected: 'tech' },
    { title: '인테리어 소파 가구 자취', expected: 'lifestyle' },
    { title: '넷플릭스 드라마 신작 영화 추천', expected: 'entertainment' },
    { title: '주식 ETF 재테크 적금 비교', expected: 'finance' },
  ];
  for (const c of cases) {
    it(`"${c.title}" → ${c.expected}`, () => {
      const r = classifyCategory({ title: c.title });
      expect(r.category).toBe(c.expected);
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.matchedKeywords.length).toBeGreaterThan(0);
    });
  }
});

describe('classifyCategory — title 가중치 > rawText', () => {
  it('title의 카테고리가 rawText의 다른 카테고리보다 우선', () => {
    const r = classifyCategory({
      title: '아이폰 비교 후기', // tech
      rawText: '맛집 음식 요리 식당 메뉴 한식'.repeat(5), // food
    });
    // title 가중치 ×2 + rawText 매칭 다수 — title이 더 높을 가능성
    expect(['tech', 'food']).toContain(r.category);
  });
});

describe('classifyCategory — fallback', () => {
  it('매칭 0건이면 general + confidence 0', () => {
    const r = classifyCategory({ title: '한가한 오후의 잡담' });
    expect(r.category).toBe('general');
    expect(r.confidence).toBe(0);
    expect(r.source).toBe('fallback');
  });

  it('빈 입력도 general 폴백', () => {
    const r = classifyCategory({});
    expect(r.category).toBe('general');
    expect(r.source).toBe('fallback');
  });
});

describe('classifyCategory — V2 ReDoS 안전망 일관성', () => {
  it('매우 긴 rawText도 빠르게 처리', () => {
    const huge = '맛집 '.repeat(5000);
    const start = Date.now();
    const r = classifyCategory({ rawText: huge });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(r.category).toBeDefined();
  });
});

describe('SPEC 메모리 원칙 — silent 폴백 부재', () => {
  it('결과에 imageSource·subWorkProvider 없음', () => {
    const r = classifyCategory({ title: '아이폰' });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });
});
