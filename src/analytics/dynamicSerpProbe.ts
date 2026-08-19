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
/**
 * 클래스 이름에 기대지 않고 순위를 얻는다 — 문서 등장 순서로 블로그 글 링크를 뽑는다.
 *
 * 왜: 네이버가 검색 화면을 새 디자인시스템(`sds-comps-*`)으로 바꾸면서 기존 카드
 * 셀렉터(.lst_total/.blog_area/.total_wrap)가 전부 0건이 됐다. 실측(2026-08-19)
 * HTML 415KB 안에 글 링크는 304개가 그대로 있었는데도 카드가 0개로 잡혔고,
 * 그 결과 노출 판정 117회가 전부 "상위 0개 중 미발견"으로 기록됐다.
 * 링크 순서는 디자인이 바뀌어도 남는다.
 */
export function extractCardsByLinkOrder($: cheerio.CheerioAPI, maxCards: number = 10): DynamicSerpCard[] {
  const html = $.html();
  const linkPattern = /https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/g;
  const seen = new Set<string>();
  const cards: DynamicSerpCard[] = [];

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    if (cards.length >= maxCards) break;
    const key = `${match[1]}/${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 같은 글을 가리키는 앵커가 여럿이다(썸네일·블로그명·제목). 가장 긴 텍스트가 제목이다.
    let title = '';
    $(`a[href*="${key}"]`).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > title.length) title = text;
    });

    cards.push({
      position: cards.length + 1,
      title: title.slice(0, 100),
      blogger: match[1].slice(0, 50),
      url: match[0],
      snippet: '',
      // 링크만으로는 인플루언서 표지를 알 수 없다 — 셀렉터 경로에서만 판별된다.
      isInfluencer: false,
    });
  }

  return cards;
}

export function extractCards($: cheerio.CheerioAPI, maxCards: number = 10): DynamicSerpCard[] {
  const cards: DynamicSerpCard[] = [];

  // Blog tab card selectors — ordered from most specific to broadest fallback.
  // Naver blog tab (where=blog) uses .lst_total > li.bx as the primary list container.
  const cardSelectors = [
    '.lst_total > li.bx',         // blog tab 2024+ primary
    '.lst_total .bx',             // blog tab 2024+ fallback
    '.total_wrap',                // integrated tab legacy
    '.api_subject_bx',            // integrated tab legacy
    '.total_area',                // integrated tab legacy
    '.blog_area',                 // dedicated blog tab legacy
    'li.bx',                      // broad fallback
    '[class*="total_wrap"]',      // class-substring fallback
  ];

  let cardElems: cheerio.Cheerio<any> | null = null;
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length >= 3) {
      cardElems = found;
      break;
    }
  }

  if (!cardElems) return extractCardsByLinkOrder($, maxCards);

  let position = 0;
  cardElems.each((_, el) => {
    if (position >= maxCards) return false;
    const $el = $(el);

    // Title + URL — blog tab 2024 uses .api_txt_lines as the title anchor
    const titleA = $el.find(
      'a.api_txt_lines, a.title_link, .total_tit a, .api_subject_bx_text a, .group_blog_sect a.title_link'
    ).first();
    const title = titleA.text().trim()
      || $el.find('.total_tit, .api_subject_bx_text, .title_txt').first().text().trim();
    const url = titleA.attr('href') || $el.find('a[href*="blog.naver.com"]').first().attr('href') || '';

    // Blogger name
    const blogger = $el.find(
      '.user_box_inner, .sub_name, .blog_name, .name_area, [class*="user_info"]'
    ).first().text().trim();

    // Intro snippet
    const snippet = $el.find(
      '.api_txt_lines.dsc_txt, .desc, .total_dsc, [class*="dsc_inner"], .dsc_txt_wrap'
    ).first().text().trim();

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

  // 셀렉터가 살아 있어도 카드가 거의 안 잡히면 마크업이 바뀐 것이다 — 링크 순서로 되짚는다.
  if (cards.length < 3) {
    const byOrder = extractCardsByLinkOrder($, maxCards);
    if (byOrder.length > cards.length) return byOrder;
  }

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
    // Use 'blog' tab to get blog-specific SERP cards reliably.
    // 'nexearch' returns the integrated tab which may redirect or return
    // a JS-rendered skeleton with no DOM content in a plain axios fetch.
    const response = await axios.get(NAVER_SEARCH_URL, {
      params: {
        where: 'blog',
        // [2026-08-19] 신 블로그탭 파라미터. where=blog 단독은 결과가 적게 온다(실측).
        ssc: 'tab.blog.all',
        query: keyword,
        sm: 'tab_hty.top',
      },
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Referer': `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`,
      },
      timeout,
      maxRedirects: 5,
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
