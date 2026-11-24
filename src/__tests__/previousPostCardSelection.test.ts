import { describe, expect, it } from 'vitest';
import {
  popularityScore,
  relevanceScore,
  selectPreviousPostCards,
  tokenizeForRelevance,
} from '../shared/previousPostCardSelection.js';
import type { PreviousPostCandidate } from '../shared/previousPostPolicy.js';

const now = Date.parse('2026-11-24T00:00:00Z');
const scope = { blogId: 'my_blog', categoryId: '7' };

function post(no: number, title: string, extra: Partial<PreviousPostCandidate> & { daysAgo?: number } = {}): PreviousPostCandidate {
  const { daysAgo = no, ...rest } = extra;
  return {
    id: `naver:my_blog:${no}`,
    title,
    publishedUrl: `https://blog.naver.com/my_blog/${no}`,
    publishedBlogId: 'my_blog',
    publishedCategoryId: '7',
    publishedAt: new Date(now - daysAgo * 86400000).toISOString(),
    publishMode: 'publish',
    isPublished: true,
    ...rest,
  };
}

const urlOf = (no: number) => `https://blog.naver.com/my_blog/${no}`;

describe('relevance and popularity scores', () => {
  it('tokenizes Korean, English and digits with at least two characters', () => {
    expect(tokenizeForRelevance('아이폰 17 프로 후기, a iOS26!')).toEqual(['아이폰', '17', '프로', '후기', 'ios26']);
  });
  it('counts shared words and absorbs short particle differences', () => {
    const query = tokenizeForRelevance('아이폰 배터리 교체 비용');
    expect(relevanceScore(query, '아이폰을 배터리까지 바꿔 봤다')).toBe(2);
    expect(relevanceScore(query, '갤럭시 충전기 비교')).toBe(0);
    // A long suffix is a different word, not a particle.
    expect(relevanceScore(tokenizeForRelevance('서울'), '서울대학교병원 주차')).toBe(0);
  });
  it('adds public likes and comments, treating missing values as zero', () => {
    expect(popularityScore({ sympathyCount: 4, commentCount: 3 })).toBe(7);
    expect(popularityScore({})).toBe(0);
  });
});

describe('selectPreviousPostCards', () => {
  const candidates = [
    post(1, '오늘 점심 메뉴', { sympathyCount: 1 }),
    post(2, '아이폰 배터리 교체 후기', { sympathyCount: 0 }),
    post(3, '아이폰 케이스 추천', { sympathyCount: 2 }),
    post(4, '주말 등산 코스', { sympathyCount: 40, commentCount: 10 }),
    post(5, '김치찌개 끓이는 법', { sympathyCount: 3 }),
  ];

  it('assigns two related posts and one popular post without repeating a post', () => {
    const picks = selectPreviousPostCards({ candidates, scope, title: '아이폰 배터리 성능 확인법', now });
    expect(picks.map(p => p.url)).toEqual([urlOf(2), urlOf(3), urlOf(4)]);
    expect(picks.map(p => p.reason)).toEqual(['related', 'related', 'popular']);
    expect(new Set(picks.map(p => p.url)).size).toBe(3);
  });

  it('fills a related slot with the latest post when nothing overlaps', () => {
    const picks = selectPreviousPostCards({ candidates, scope, title: '전혀 다른 주제', now });
    expect(picks[0]).toMatchObject({ url: urlOf(1), reason: 'latest' });
    expect(picks[1]).toMatchObject({ url: urlOf(2), reason: 'latest' });
    expect(picks[2]).toMatchObject({ url: urlOf(4), reason: 'popular' });
  });

  it('is deterministic for the same input', () => {
    const input = { candidates, scope, title: '아이폰', keywords: ['배터리'], now };
    expect(selectPreviousPostCards(input)).toEqual(selectPreviousPostCards(input));
  });

  it('uses keywords as part of relevance', () => {
    const picks = selectPreviousPostCards({ candidates, scope, title: '하루 기록', keywords: ['김치찌개'], now });
    expect(picks[0].url).toBe(urlOf(5));
  });

  it('pushes recently attached cards back while enough fresh candidates exist', () => {
    const picks = selectPreviousPostCards({
      candidates, scope, title: '아이폰 배터리 성능 확인법', now,
      recentUrls: [urlOf(2), urlOf(4)],
    });
    expect(picks.map(p => p.url)).not.toContain(urlOf(2));
    expect(picks.map(p => p.url)).not.toContain(urlOf(4));
    expect(picks.map(p => p.url)).toEqual([urlOf(3), urlOf(1), urlOf(5)]);
  });

  it('reuses the least recently attached cards first when candidates run short', () => {
    const few = [post(1, '하나'), post(2, '둘'), post(3, '셋'), post(4, '넷')];
    // Most recent first: 1 was used last, 3 the longest ago.
    const picks = selectPreviousPostCards({ candidates: few, scope, title: '없음', now, recentUrls: [urlOf(1), urlOf(2), urlOf(3)] });
    expect(picks.map(p => p.url)).toEqual([urlOf(4), urlOf(3), urlOf(2)]);
  });

  it('prefers the same category and fills from other categories of the same blog', () => {
    const mixed = [
      post(1, '아이폰 배터리', { publishedCategoryId: '9' }),
      post(2, '여행 준비물'),
      post(3, '아이폰 충전', { publishedCategoryId: '9', sympathyCount: 50 }),
    ];
    const picks = selectPreviousPostCards({ candidates: mixed, scope, title: '아이폰 배터리', now });
    expect(picks[0].url).toBe(urlOf(2));
    expect(picks[0].categoryId).toBe('7');
    expect(picks.map(p => p.url).sort()).toEqual([urlOf(1), urlOf(2), urlOf(3)].sort());
    expect(picks.find(p => p.url === urlOf(1))?.categoryId).toBe('9');
  });

  it('returns only what exists when fewer candidates are available', () => {
    expect(selectPreviousPostCards({ candidates: [post(1, '하나')], scope, now })).toHaveLength(1);
    expect(selectPreviousPostCards({ candidates: [], scope, now })).toEqual([]);
  });

  it('never selects another blog, private, scheduled, future or self posts', () => {
    const unsafe = [
      post(1, '다른 블로그', { publishedUrl: 'https://blog.naver.com/other/1', publishedBlogId: 'other' }),
      post(2, '비공개', { isPublished: false }),
      post(3, '예약', { publishMode: 'schedule' }),
      post(4, '미래', { daysAgo: -1 }),
      post(5, '자기 자신'),
      post(6, '정상'),
    ];
    const picks = selectPreviousPostCards({ candidates: unsafe, scope, now, excludePostId: 'naver:my_blog:5' });
    expect(picks.map(p => p.url)).toEqual([urlOf(6)]);
  });

  it('deduplicates the same post coming from both lookups', () => {
    const dup = [post(1, '하나'), { ...post(1, '하나'), publishedUrl: 'https://m.blog.naver.com/PostView.naver?blogId=my_blog&logNo=1' }];
    expect(selectPreviousPostCards({ candidates: dup, scope, now })).toHaveLength(1);
  });

  it('keeps a manually chosen post as the first card and picks two more', () => {
    const pinned = post(5, '김치찌개 끓이는 법');
    const picks = selectPreviousPostCards({ candidates, scope, title: '아이폰 배터리', now, pinned, recentUrls: [urlOf(5)] });
    expect(picks[0]).toMatchObject({ url: urlOf(5), reason: 'pinned' });
    expect(picks.map(p => p.reason)).toEqual(['pinned', 'related', 'popular']);
    expect(picks.slice(1).map(p => p.url)).not.toContain(urlOf(5));
  });

  it('keeps the first card in the same category even when only other categories are fresh', () => {
    const mixed = [post(1, '같은 카테고리'), post(2, '다른 카테고리', { publishedCategoryId: '9' })];
    const picks = selectPreviousPostCards({ candidates: mixed, scope, now, recentUrls: [urlOf(1)] });
    expect(picks[0].url).toBe(urlOf(1));
  });

  it('honors a smaller card count', () => {
    expect(selectPreviousPostCards({ candidates, scope, now, count: 1 })).toHaveLength(1);
  });
});
