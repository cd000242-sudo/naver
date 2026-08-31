import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isSearchRedirectedToHome } from '../content/searchRedirectedHome';

/**
 * [2026-09-01 라이브 로그] 냉장고 글에 뉴스 헤드라인이 통째로 실렸다.
 *
 *   본문: "네팔 대홍수 현장에서 실종 한국인 9명 (…) 46분 전 개각 보도,
 *          VOA 밴스 부통령 발언 (…) 등 전헤드라인 및 의견 시사 주제를 들으며
 *          파먹기 작업 동선을 유지할 수 있습니다."
 *
 * 로그가 원인을 그대로 보여준다.
 *
 *   [크롤링] 리디렉션됨:
 *     https://news.google.com/search?q=추석+연휴+대비:+냉장고+파먹기+식재료+정리...
 *     → https://news.google.com/home?hl=ko&gl=KR&ceid=KR:ko
 *
 * 그 키워드로 검색 결과가 없자 구글 뉴스가 홈으로 튕겼고, 크롤러는 그 홈 화면의
 * 오늘자 헤드라인을 자료로 긁어왔다. 리디렉션은 로그만 찍고 그대로 진행했다.
 *
 * 더 나쁜 것은 그다음이다. 헤드라인 옆의 상대 시각이 냉장고 사실로 둔갑했다.
 *   "46분 전 개각 보도"   -> "불과 46분 만에 다시 미세한 성에 결정이 형성될 수 있습니다"
 *   "10시간 전 / 11시간 전" -> "10시간에서 11시간 정도 지나야 내부 온도가 안정됩니다"
 *
 * 근거 게이트로는 못 잡는다. 그 숫자가 실제로 자료에 있기 때문이다.
 * 자료가 들어오는 문에서 막아야 한다.
 */
describe('검색 페이지가 홈으로 튕기면 자료로 쓰지 않는다', () => {
  it('실측 사례를 잡는다 — 구글 뉴스 검색이 홈으로', () => {
    expect(isSearchRedirectedToHome(
      'https://news.google.com/search?q=%EC%B6%94%EC%84%9D&hl=ko',
      'https://news.google.com/home?hl=ko&gl=KR&ceid=KR:ko',
    )).toBe(true);
  });

  it('루트로 튕긴 경우도 잡는다', () => {
    expect(isSearchRedirectedToHome(
      'https://news.google.com/search?q=abc',
      'https://news.google.com/',
    )).toBe(true);
  });

  it('네이버 검색이 메인으로 튕겨도 잡는다', () => {
    expect(isSearchRedirectedToHome(
      'https://search.naver.com/search.naver?query=abc',
      'https://www.naver.com/',
    )).toBe(true);
  });
});

describe('정상 리디렉션은 통과시킨다', () => {
  it('검색 결과가 실제 기사로 이동한 것은 정상이다', () => {
    expect(isSearchRedirectedToHome(
      'https://news.google.com/search?q=abc',
      'https://www.starnewskorea.com/star/2026/08/26/2026082619221749833',
    )).toBe(false);
  });

  it('단축 URL 이 기사로 풀린 것은 정상이다', () => {
    expect(isSearchRedirectedToHome(
      'https://naver.me/abcd',
      'https://blog.naver.com/leader/224396329248',
    )).toBe(false);
  });

  it('애초에 검색 페이지가 아니면 판정하지 않는다', () => {
    expect(isSearchRedirectedToHome(
      'https://example.com/article/1',
      'https://example.com/',
    )).toBe(false);
  });

  it('리디렉션이 없으면 판정하지 않는다', () => {
    const u = 'https://news.google.com/search?q=abc';
    expect(isSearchRedirectedToHome(u, u)).toBe(false);
  });

  it('잘못된 값에 던지지 않는다', () => {
    expect(() => isSearchRedirectedToHome('', '')).not.toThrow();
    expect(isSearchRedirectedToHome(undefined as never, undefined as never)).toBe(false);
    expect(isSearchRedirectedToHome('not a url', 'also not')).toBe(false);
  });
});

describe('두 크롤링 경로 모두 막혀 있다', () => {
  /*
   * fetch 경로와 Puppeteer 경로가 각각 리디렉션을 처리한다.
   * 한쪽만 막으면 다른 쪽으로 그대로 들어온다 — 이미지 모델 폴백에서 겪은 실수다.
   */
  it('fetch 경로와 Puppeteer 경로가 모두 판정한다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'sourceAssembler.ts'), 'utf-8');
    const hits = src.match(/isSearchRedirectedToHome\(/gu) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
