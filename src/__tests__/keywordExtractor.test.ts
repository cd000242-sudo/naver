/**
 * SPEC-CONVERSION-001 L3-3.1 — keywordExtractor 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { extractKeywords, selectVisualKeywords } from '../content/keywordExtractor';

const longBody = [
  '# 강남 카페 후기',
  '',
  '카페 분위기가 깔끔했어요. '.repeat(15),
  '',
  '## 메뉴 구성',
  '',
  '메뉴는 단출했어요. 카페에서 라떼와 디저트를 시켰어요. '.repeat(10),
  '',
  '## 분위기',
  '',
  '카페 인테리어가 마음에 들었어요. 공간이 넓었어요. '.repeat(10),
].join('\n');

describe('extractKeywords — 정상 분석', () => {
  it('상위 키워드 + 빈도 + score', () => {
    const r = extractKeywords({ bodyText: longBody, title: '강남 카페 후기' });
    expect(r.keywords.length).toBeGreaterThan(0);
    const cafe = r.keywords.find((k) => k.term === '카페');
    expect(cafe).toBeDefined();
    expect(cafe!.count).toBeGreaterThan(5);
    expect(cafe!.inTitle).toBe(true);
    expect(cafe!.score).toBeGreaterThan(cafe!.count); // 제목 가중치 +5
  });

  it('totalTokens 누적', () => {
    const r = extractKeywords({ bodyText: longBody });
    expect(r.totalTokens).toBeGreaterThan(20);
  });

  it('maxKeywords 제한', () => {
    const r = extractKeywords({ bodyText: longBody, maxKeywords: 3 });
    expect(r.keywords).toHaveLength(3);
  });

  it('헤딩 토큰은 가중치 +3', () => {
    const r = extractKeywords({ bodyText: longBody });
    const menu = r.keywords.find((k) => k.term === '메뉴');
    if (menu) {
      // 메뉴는 헤딩에도 등장 → score > count
      expect(menu.score).toBeGreaterThan(menu.count);
    }
  });
});

describe('extractKeywords — fallback (silent 위조 X)', () => {
  it('100자 미만은 명시 reason + 빈 결과', () => {
    const r = extractKeywords({ bodyText: '짧은 본문' });
    expect(r.fallbackReason).toMatch(/BODY_TOO_SHORT/);
    expect(r.keywords).toEqual([]);
  });

  it('빈 본문도 안전', () => {
    const r = extractKeywords({ bodyText: '' });
    expect(r.fallbackReason).toMatch(/BODY_TOO_SHORT/);
  });
});

describe('extractKeywords — stopword·명사 분류', () => {
  it('stopword (하다·되다 등)는 제외', () => {
    const body = '하다 되다 있다 강남 카페 강남 카페 강남 카페 '.repeat(20);
    const r = extractKeywords({ bodyText: body });
    expect(r.keywords.find((k) => k.term === '하다')).toBeUndefined();
    expect(r.keywords.find((k) => k.term === '카페')).toBeDefined();
  });

  it('visualHint 분류 (구체/추상/unknown)', () => {
    const body = '제품 분위기 음식 만족감 카페 인테리어 '.repeat(20);
    const r = extractKeywords({ bodyText: body });
    const concrete = r.keywords.filter((k) => k.visualHint === 'concrete');
    expect(concrete.length).toBeGreaterThan(0);
  });
});

describe('selectVisualKeywords', () => {
  it('concrete 우선 정렬', () => {
    const body =
      '제품 만족감 분위기 만족감 카페 만족감 인테리어 만족감 음식 만족감 '.repeat(15);
    const r = extractKeywords({ bodyText: body, maxKeywords: 10 });
    const visual = selectVisualKeywords(r, 3);
    expect(visual.length).toBe(3);
    // 만족감(abstract)이 최상위 빈도라도 visual에서는 concrete가 앞으로
    const firstHint = r.keywords.find((k) => k.term === visual[0])?.visualHint;
    expect(['concrete', 'unknown']).toContain(firstHint);
  });

  it('빈 결과는 빈 배열', () => {
    expect(selectVisualKeywords({ keywords: [], totalTokens: 0 })).toEqual([]);
  });
});
