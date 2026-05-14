/**
 * dynamicSerpProbe DOM 파싱 단위 테스트
 *
 * 실제 네이버 HTML 호출 없이 *모의 HTML*로 파싱 함수 검증.
 * 네트워크 의존 0.
 */

import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { detectSmartblock, extractCards } from '../analytics/dynamicSerpProbe';

describe('detectSmartblock', () => {
  it('스마트블록 클래스 있으면 감지', () => {
    const html = `<html><body>
      <div class="smart_block">
        <li class="item">A</li>
        <li class="item">B</li>
      </div>
    </body></html>`;
    const $ = cheerio.load(html);
    const result = detectSmartblock($);
    expect(result.has).toBe(true);
    expect(result.count).toBe(2);
  });

  it('AI 라벨 텍스트만 있어도 감지', () => {
    const html = `<html><body>
      <div>AI가 골라요</div>
    </body></html>`;
    const $ = cheerio.load(html);
    const result = detectSmartblock($);
    expect(result.has).toBe(true);
  });

  it('스마트블록 부재 시 has=false', () => {
    const html = `<html><body><div>일반 검색 결과</div></body></html>`;
    const $ = cheerio.load(html);
    const result = detectSmartblock($);
    expect(result.has).toBe(false);
    expect(result.count).toBe(0);
  });

  it('class*="sb_inner" 패턴 매칭', () => {
    const html = `<html><body>
      <div class="api_subject_bx sb_inner_wrap">
        <li>X</li>
      </div>
    </body></html>`;
    const $ = cheerio.load(html);
    const result = detectSmartblock($);
    expect(result.has).toBe(true);
  });
});

describe('extractCards', () => {
  function mockSerpHtml(cards: Array<{
    title: string;
    blogger: string;
    url: string;
    snippet: string;
    isInfluencer?: boolean;
  }>): string {
    const cardsHtml = cards.map(c => `
      <div class="total_wrap">
        <a class="api_txt_lines" href="${c.url}">${c.title}</a>
        <div class="user_box_inner">${c.blogger}${c.isInfluencer ? ' 인플루언서' : ''}</div>
        <div class="api_txt_lines dsc_txt">${c.snippet}</div>
      </div>
    `).join('\n');
    return `<html><body>${cardsHtml}</body></html>`;
  }

  it('블로그 카드 추출', () => {
    const html = mockSerpHtml([
      { title: '제품 후기', blogger: '리뷰어A', url: 'https://blog.naver.com/userA/123', snippet: '한 달 써본 결과' },
      { title: '비교 분석', blogger: '리뷰어B', url: 'https://blog.naver.com/userB/456', snippet: '5가지 비교' },
      { title: '추천', blogger: '리뷰어C', url: 'https://blog.naver.com/userC/789', snippet: '강추' },
    ]);
    const $ = cheerio.load(html);
    const cards = extractCards($, 10);
    expect(cards.length).toBe(3);
    expect(cards[0].position).toBe(1);
    expect(cards[0].title).toBe('제품 후기');
    expect(cards[0].blogger).toContain('리뷰어A');
  });

  it('인플루언서 표지 감지', () => {
    const html = mockSerpHtml([
      { title: 'A', blogger: 'X', url: 'https://blog.naver.com/x/1', snippet: '', isInfluencer: true },
      { title: 'B', blogger: 'Y', url: 'https://blog.naver.com/y/2', snippet: '' },
      { title: 'C', blogger: 'Z', url: 'https://blog.naver.com/z/3', snippet: '' },
    ]);
    const $ = cheerio.load(html);
    const cards = extractCards($, 10);
    const influencers = cards.filter(c => c.isInfluencer);
    expect(influencers.length).toBe(1);
    expect(influencers[0].title).toBe('A');
  });

  it('maxCards 제한', () => {
    const html = mockSerpHtml(Array.from({ length: 8 }, (_, i) => ({
      title: `Card${i}`,
      blogger: `B${i}`,
      url: `https://blog.naver.com/u${i}/${i}`,
      snippet: '',
    })));
    const $ = cheerio.load(html);
    const cards = extractCards($, 5);
    expect(cards.length).toBe(5);
  });

  it('네이버 블로그 URL 아니면 제외', () => {
    const html = `<html><body>
      <div class="total_wrap">
        <a class="api_txt_lines" href="https://example.com/post">외부 사이트</a>
        <div class="user_box_inner">X</div>
      </div>
      <div class="total_wrap">
        <a class="api_txt_lines" href="https://blog.naver.com/u/1">네이버 블로그</a>
        <div class="user_box_inner">Y</div>
      </div>
      <div class="total_wrap">
        <a class="api_txt_lines" href="https://cafe.naver.com/c/1">네이버 카페</a>
        <div class="user_box_inner">Z</div>
      </div>
    </body></html>`;
    const $ = cheerio.load(html);
    const cards = extractCards($, 10);
    // 외부 사이트 제외, 네이버 블로그 + 카페만
    expect(cards.length).toBe(2);
    expect(cards.every(c => c.url.includes('naver.com'))).toBe(true);
  });

  it('카드 3개 미만이면 빈 배열', () => {
    const html = `<html><body>
      <div class="total_wrap">
        <a class="api_txt_lines" href="https://blog.naver.com/a/1">Only one</a>
      </div>
    </body></html>`;
    const $ = cheerio.load(html);
    const cards = extractCards($, 10);
    // 카드 3개 미만이면 셀렉터 매칭 실패 → 빈 배열
    expect(cards.length).toBe(0);
  });

  it('title/snippet 100자/200자 잘림', () => {
    const longTitle = 'A'.repeat(150);
    const longSnippet = 'B'.repeat(300);
    const html = mockSerpHtml([
      { title: longTitle, blogger: 'X', url: 'https://blog.naver.com/x/1', snippet: longSnippet },
      { title: 'B', blogger: 'Y', url: 'https://blog.naver.com/y/2', snippet: '' },
      { title: 'C', blogger: 'Z', url: 'https://blog.naver.com/z/3', snippet: '' },
    ]);
    const $ = cheerio.load(html);
    const cards = extractCards($, 10);
    expect(cards[0].title.length).toBe(100);
    expect(cards[0].snippet.length).toBe(200);
  });
});
