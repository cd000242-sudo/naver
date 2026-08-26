import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { orderFullTextCandidates } from '../content/fullTextCandidateOrder';

/**
 * [2026-08-27 사장님 지적] "블로그 상위노출된 걸 가져오는 이유가, 실시간 검색어로 뜨는
 * 키워드면 먼저 선점하고 있는 블로그가 있다고 생각했는데 — 이슈 키워드는 선점 싸움이라
 * 방금 나온 기사나 키워드라면 (선점 블로그가) 없다고 생각을 못 했네."
 *
 * 정확한 지적이고, 그 전제가 코드에 그대로 박혀 있었다.
 *   const candidates = [...mergedBlogs, ...newsLinks];   // 블로그가 먼저
 * 예산은 5편·8,000자다. 앞의 블로그 8개가 다 먹으면 뉴스 4개는 차례가 오지 않는다.
 *
 * 그 결과가 서인영 글이다 — 다이어트 글에 미니 컨트리맨 스펙(전장 4445mm, 204마력,
 * 4550만원)이 소제목 두 개를 차지했다. 기사에는 "서인영"은 있어도 "4445mm"는 없다.
 *
 * 기사가 1차 자료다. 블로그는 그걸 옮겨 적은 2차 자료이고, 종종 남의 글을 짜깁는다.
 * 형식이 닮았다는 이유로 2차 자료를 앞세울 이유가 없다 — 글의 형식은 프롬프트가 정한다.
 */
const news = (n: number) => Array.from({ length: n }, (_, i) => ({
  title: `기사${i + 1}`, link: `https://news.example.com/${i + 1}`, postdate: `2026082${i}`,
}));
const blogs = (n: number) => Array.from({ length: n }, (_, i) => ({
  title: `블로그${i + 1}`, link: `https://blog.naver.com/${i + 1}`, postdate: `2026082${i}`,
}));

describe('풀텍스트 수집 순서', () => {
  it('기사를 블로그보다 앞에 둔다', () => {
    const ordered = orderFullTextCandidates({ news: news(3), blogs: blogs(8) });
    expect(ordered[0].link).toContain('news.example.com');
    expect(ordered.slice(0, 3).every((c) => c.link.includes('news'))).toBe(true);
  });

  it('블로그도 버리지 않는다 — 기사 뒤에 그대로 붙는다', () => {
    const ordered = orderFullTextCandidates({ news: news(2), blogs: blogs(3) });
    expect(ordered).toHaveLength(5);
    expect(ordered.slice(2).every((c) => c.link.includes('blog'))).toBe(true);
  });

  it('기사가 없으면 블로그만으로 간다 — 개념 키워드는 기사가 없는 게 정상이다', () => {
    const ordered = orderFullTextCandidates({ news: [], blogs: blogs(4) });
    expect(ordered).toHaveLength(4);
  });

  it('둘 다 없으면 빈 목록', () => {
    expect(orderFullTextCandidates({ news: [], blogs: [] })).toEqual([]);
  });

  it('같은 링크는 한 번만 — 뉴스와 블로그 검색이 겹칠 수 있다', () => {
    const dup = { title: '겹침', link: 'https://news.example.com/1', postdate: '20260826' };
    const ordered = orderFullTextCandidates({ news: [dup], blogs: [dup] });
    expect(ordered).toHaveLength(1);
  });

  it('링크가 없는 항목은 버린다', () => {
    const ordered = orderFullTextCandidates({
      news: [{ title: '제목없음', link: '', postdate: '' } as never],
      blogs: blogs(1),
    });
    expect(ordered).toHaveLength(1);
  });

  it('http(s) 가 아닌 링크는 버린다', () => {
    const ordered = orderFullTextCandidates({
      news: [{ title: 'x', link: 'javascript:void(0)', postdate: '' } as never],
      blogs: blogs(1),
    });
    expect(ordered).toHaveLength(1);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => orderFullTextCandidates({ news: null as never, blogs: undefined as never }))
      .not.toThrow();
  });
});

describe('본선 배선', () => {
  const src = readFileSync(resolve(__dirname, '../sourceAssembler.ts'), 'utf-8');

  it('수집기가 순서 모듈을 쓴다', () => {
    expect(src).toMatch(/orderFullTextCandidates\(/);
  });

  it('블로그를 앞세우던 코드가 남아 있지 않다', () => {
    const codeOnly = src.split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
      .join('\n');
    expect(codeOnly).not.toMatch(/\[\.\.\.mergedBlogs, \.\.\.newsLinks\]/);
  });

  it('최신 기사도 함께 찾는다 — 이슈 키워드는 방금 나온 기사가 뼈대다', () => {
    expect(src).toMatch(/'news',\s*\d+,\s*'date'/);
  });
});
