import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isSearchRedirectedToHome, looksLikeEmptySearchResult } from '../content/searchRedirectedHome';

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

describe('결과 없음 페이지도 자료로 쓰지 않는다', () => {
  /*
   * [2026-09-01 2차] 홈 리디렉션만 막았더니 다음 글에서 다른 얼굴로 나왔다.
   *
   * 이번에는 홈으로 튕기지 않고 검색 페이지에 그대로 머물렀는데,
   * 그 페이지가 "표시할 항목이 없습니다" + 사이드바 헤드라인이었다.
   * 모델은 그 화면을 해설하는 글을 썼다 — 냉장고 정리법 대신 검색 화면 설명이 나왔다.
   *
   * URL 로 쫓으면 계속 새 얼굴이 나온다. 내용으로 판정한다 —
   * 결과 없음 페이지는 어느 검색엔진이든 같은 말을 한다.
   */
  it('구글 뉴스 결과 없음 문구를 잡는다', () => {
    expect(looksLikeEmptySearchResult('표시할 항목이 없습니다. 내 브리핑 날씨 지역 뉴스')).toBe(true);
  });

  it('네이버 · 일반 검색의 결과 없음도 잡는다', () => {
    for (const s of [
      '검색결과가 없습니다. 다른 검색어를 입력해 주세요.',
      '조건에 맞는 검색결과가 없습니다',
      'No results found for your search',
      '일치하는 정보가 없습니다',
    ]) {
      expect(looksLikeEmptySearchResult(s)).toBe(true);
    }
  });

  it('정상 기사는 통과시킨다', () => {
    const article = '냉동실 성에는 냉기 전달을 방해합니다. 전원을 뽑고 아이스박스로 옮긴 뒤 자연 해동하세요.';
    expect(looksLikeEmptySearchResult(article)).toBe(false);
  });

  it('본문 안에서 그 표현을 인용한 긴 글은 잡지 않는다', () => {
    // 결과 없음 문구는 짧은 페이지에서만 의미가 있다. 긴 본문에 한 번 나오는 것은 인용이다.
    const long = `${'냉장고 정리 방법을 순서대로 설명합니다. '.repeat(90)}검색결과가 없습니다`;
    expect(looksLikeEmptySearchResult(long)).toBe(false);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(looksLikeEmptySearchResult('')).toBe(false);
    expect(() => looksLikeEmptySearchResult(undefined as never)).not.toThrow();
  });
});
