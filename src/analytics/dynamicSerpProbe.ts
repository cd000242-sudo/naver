/**
 * Dynamic SERP Probe — 끝판왕 Phase 3.11 (v2.10.194)
 *
 * 네이버 통합탭(검색 결과 페이지)을 *실제로 fetch + DOM 파싱*하여
 * 검색 API(serpProbe)로 안 보이는 동적 정보를 추출.
 *
 * 추출 정보:
 *   1. **AI 스마트블록 노출 여부** — 통합탭 상단 AI 추천 영역
 *   2. **실제 노출 순위** — API sim 정렬과 다를 수 있음
 *   3. **인플루언서 vs 일반 비율** — 통합탭 카드 종류
 *   4. **첫 N개 카드 메타** — 제목, 블로그명, 도입부
 *
 * 추정 효과 0 — 실제 통합탭 DOM에서 직접 추출.
 *
 * 안전:
 *   - axios + cheerio (Playwright 없이) — 빠름 + 봇 차단 위험 낮음
 *   - User-Agent 정규화 (데스크톱 Chrome)
 *   - Accept-Language: ko-KR
 *   - 타임아웃 10초 (느린 응답 차단)
 *   - HTML 구조 변경 대비 (정규식 + cheerio dual fallback)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DynamicSerpCard {
  readonly position: number;
  readonly title: string;
  readonly blogger: string;
  readonly url: string;
  readonly snippet: string;
  readonly isInfluencer: boolean;
}

export interface DynamicSerpReport {
  readonly keyword: string;
  readonly probedAt: string;
  readonly hasSmartblock: boolean;       // AI 스마트블록 노출 여부
  readonly smartblockCount: number;      // 스마트블록 내 글 수
  readonly totalCards: number;           // 통합탭 총 카드 수
  readonly influencerCount: number;
  readonly cards: readonly DynamicSerpCard[];
  readonly fetchSuccess: boolean;
  readonly fetchError?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTML 파싱 함수 (테스트 가능)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 네이버 검색 HTML에서 AI 스마트블록 노출 감지.
 *   - 2026년 통합탭 기준 클래스명: api_subject_bx, smart_block, smartblock 등
 *   - 또는 "AI가 골라요"/"smart_block_inner"/"sb_inner" 텍스트/클래스 패턴
 */
export function detectSmartblock($: cheerio.CheerioAPI): { has: boolean; count: number } {
  // 다양한 클래스 패턴 매칭 (HTML 구조 변경 대비 dual fallback)
  const selectors = [
    '.smart_block',
    '.smartblock',
    '.api_subject_bx[data-smart-block]',
    '[class*="smart_block"]',
    '[class*="sb_inner"]',
  ];

  let smartblockContainer: cheerio.Cheerio<any> | null = null;
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length > 0) {
      smartblockContainer = found.first();
      break;
    }
  }

  // 텍스트 fallback — "AI가 골라요" 같은 라벨
  const html = $.html();
  const hasAiLabel = /AI[\s·]?가\s*골라요|AI\s*추천|스마트블록|SmartBlock/i.test(html);

  if (!smartblockContainer && !hasAiLabel) {
    return { has: false, count: 0 };
  }

  // 스마트블록 내 카드 개수 추정 (li, a[href*=blog] 등)
  let count = 0;
  if (smartblockContainer) {
    count = smartblockContainer.find('li, .item, .api_subject_bx_inner').length;
  }
  // 최소 1개 (감지됐으니 적어도 1개)
  if (count === 0 && hasAiLabel) count = 1;

  return { has: true, count };
}

/**
 * 통합탭에서 블로그 카드 목록 추출.
 *   - 카드 셀렉터: .total_wrap, .api_subject_bx, .total_area, .blog_area 등
 *   - 인플루언서 표지: "인플루언서" 텍스트 또는 .ifr_inner 등 클래스
 */
export function extractCards($: cheerio.CheerioAPI, maxCards: number = 10): DynamicSerpCard[] {
  const cards: DynamicSerpCard[] = [];

  // 블로그/카페 통합탭 카드 셀렉터 (다양한 패턴)
  const cardSelectors = [
    '.total_wrap',
    '.api_subject_bx',
    '.total_area',
    '.blog_area',
    '.bx',
    '[class*="total_wrap"]',
  ];

  let cardElems: cheerio.Cheerio<any> | null = null;
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length >= 3) {
      cardElems = found;
      break;
    }
  }

  if (!cardElems) return cards;

  let position = 0;
  cardElems.each((_, el) => {
    if (position >= maxCards) return false;
    const $el = $(el);

    // 제목 + URL
    const titleA = $el.find('a.api_txt_lines, a.title_link, .total_tit a, .api_subject_bx_text a').first();
    const title = titleA.text().trim() || $el.find('.total_tit, .api_subject_bx_text').first().text().trim();
    const url = titleA.attr('href') || '';

    // 블로거명
    const blogger = $el.find('.user_box_inner, .sub_name, .blog_name, [class*="user_info"]').first().text().trim();

    // 도입부/snippet
    const snippet = $el.find('.api_txt_lines.dsc_txt, .desc, .total_dsc, [class*="dsc_inner"]').first().text().trim();

    // 인플루언서 여부
    const cardHtml = $.html($el as any);
    const isInfluencer = /인플루언서|Influencer|ifr_/i.test(cardHtml);

    // URL 있는 경우만 유효 카드로 카운트 (네이버 블로그 URL 패턴)
    const isNaverBlog = /blog\.naver\.com|cafe\.naver\.com|in\.naver\.com/i.test(url);

    if (title && isNaverBlog) {
      cards.push({
        position: ++position,
        title: title.slice(0, 100),
        blogger: blogger.slice(0, 50),
        url,
        snippet: snippet.slice(0, 200),
        isInfluencer,
      });
    }
    return undefined;
  });

  return cards;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 fetch + 분석
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function probeDynamicSerp(
  keyword: string,
  options: { maxCards?: number; timeout?: number } = {},
): Promise<DynamicSerpReport> {
  const maxCards = options.maxCards ?? 10;
  const timeout = options.timeout ?? 10000;
  const probedAt = new Date().toISOString();

  try {
    const response = await axios.get(NAVER_SEARCH_URL, {
      params: {
        where: 'nexearch',
        query: keyword,
        sm: 'top_hty',
      },
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      timeout,
      maxRedirects: 3,
      responseType: 'text',
    });

    const html = String(response.data || '');
    const $ = cheerio.load(html);

    const sb = detectSmartblock($);
    const cards = extractCards($, maxCards);
    const influencerCount = cards.filter(c => c.isInfluencer).length;

    return {
      keyword,
      probedAt,
      hasSmartblock: sb.has,
      smartblockCount: sb.count,
      totalCards: cards.length,
      influencerCount,
      cards,
      fetchSuccess: true,
    };
  } catch (err) {
    return {
      keyword,
      probedAt,
      hasSmartblock: false,
      smartblockCount: 0,
      totalCards: 0,
      influencerCount: 0,
      cards: [],
      fetchSuccess: false,
      fetchError: err instanceof Error ? err.message : String(err),
    };
  }
}
