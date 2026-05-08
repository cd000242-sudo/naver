/**
 * naverFactCheckRAG.ts — 네이버 검색 API 기반 fact-check RAG (v2.10.73)
 *
 * 목적: 키워드형 글 생성 시 LLM 환각 차단
 *   기존 흐름: 키워드 → LLM 자체 학습 데이터로 본문 작성 → 환각 발생 가능
 *   새 흐름: 키워드 → 네이버 블로그/뉴스/지식인 검색 → 결과 텍스트 추출 →
 *           LLM 프롬프트 [Article Content]로 주입 → LLM이 실제 자료 기반으로만 작성
 *
 * 사용법:
 *   const rawText = await collectFactCheckSourceFromNaver('자동차세 연납 4.57% 할인');
 *   source.rawText = rawText;  // contentGenerator에 주입
 *
 * 비용: 네이버 검색 API 무료 (일일 25,000건 한도)
 */

import { searchBlog, searchNews, searchKin, searchWebDoc, type BlogItem, type NewsItem, type KinItem, type WebDocItem } from './naverSearchApi.js';

export interface FactCheckSourceOptions {
  /** 블로그 검색 결과 N개 (기본 5) */
  blogCount?: number;
  /** 뉴스 검색 결과 N개 (기본 3) */
  newsCount?: number;
  /** 지식인 검색 결과 N개 (기본 3) */
  kinCount?: number;
  /** 웹문서 검색 결과 N개 (기본 0 — 신뢰도 낮음) */
  webDocCount?: number;
  /** 결과 텍스트 최대 길이 (기본 5000자, LLM 토큰 절약) */
  maxLength?: number;
}

export interface FactCheckSourceResult {
  rawText: string;
  sources: Array<{ type: 'blog' | 'news' | 'kin' | 'webdoc'; title: string; description: string; postdate?: string }>;
  totalChars: number;
  searchQuery: string;
  truncated: boolean;
}

/**
 * HTML 태그 제거 + entity 디코딩
 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/?[bB]>/g, '')           // 네이버 검색 결과의 <b> 강조
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')  // 일반 HTML 태그
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 네이버 검색 결과 → fact-check rawText 조립
 *
 * LLM에게 주입될 형식:
 *   [블로그 1] 제목 — 요약
 *   [블로그 2] 제목 — 요약
 *   [뉴스 1] 제목 (2026-05-08) — 요약
 *   ...
 *
 * 이 텍스트가 base.prompt의 [Article Content] 섹션으로 주입되어,
 * LLM이 자체 지식 대신 이 자료 기반으로만 본문 작성 → 환각 차단.
 */
export async function collectFactCheckSourceFromNaver(
  keyword: string,
  options?: FactCheckSourceOptions,
): Promise<FactCheckSourceResult> {
  const blogCount = options?.blogCount ?? 5;
  const newsCount = options?.newsCount ?? 3;
  const kinCount = options?.kinCount ?? 3;
  const webDocCount = options?.webDocCount ?? 0;
  const maxLength = options?.maxLength ?? 5000;

  const sources: FactCheckSourceResult['sources'] = [];
  const sections: string[] = [];

  // 병렬 검색 (각 API 호출 독립)
  const [blogRes, newsRes, kinRes, webDocRes] = await Promise.allSettled([
    blogCount > 0 ? searchBlog({ query: keyword, display: blogCount, sort: 'sim' }) : Promise.resolve(null),
    newsCount > 0 ? searchNews({ query: keyword, display: newsCount, sort: 'date' }) : Promise.resolve(null),
    kinCount > 0 ? searchKin({ query: keyword, display: kinCount, sort: 'sim' }) : Promise.resolve(null),
    webDocCount > 0 ? searchWebDoc({ query: keyword, display: webDocCount }) : Promise.resolve(null),
  ]);

  // 블로그
  if (blogRes.status === 'fulfilled' && blogRes.value?.items) {
    const blogs = blogRes.value.items as BlogItem[];
    if (blogs.length > 0) {
      sections.push('[네이버 블로그 검색 결과]');
      blogs.forEach((b, i) => {
        const title = stripHtml(b.title);
        const desc = stripHtml(b.description);
        sections.push(`(블로그${i + 1}) ${title}\n${desc}`);
        sources.push({ type: 'blog', title, description: desc, postdate: b.postdate });
      });
    }
  }

  // 뉴스
  if (newsRes.status === 'fulfilled' && newsRes.value?.items) {
    const news = newsRes.value.items as NewsItem[];
    if (news.length > 0) {
      sections.push('\n[네이버 뉴스 검색 결과]');
      news.forEach((n, i) => {
        const title = stripHtml(n.title);
        const desc = stripHtml(n.description);
        const date = (n.pubDate || '').split(' ').slice(0, 4).join(' ');
        sections.push(`(뉴스${i + 1}) ${title}${date ? ` [${date}]` : ''}\n${desc}`);
        sources.push({ type: 'news', title, description: desc, postdate: date });
      });
    }
  }

  // 지식인
  if (kinRes.status === 'fulfilled' && kinRes.value?.items) {
    const kins = kinRes.value.items as KinItem[];
    if (kins.length > 0) {
      sections.push('\n[지식iN 질문 결과]');
      kins.forEach((k, i) => {
        const title = stripHtml(k.title);
        const desc = stripHtml(k.description);
        sections.push(`(지식iN${i + 1}) ${title}\n${desc}`);
        sources.push({ type: 'kin', title, description: desc });
      });
    }
  }

  // 웹문서 (옵션)
  if (webDocRes.status === 'fulfilled' && webDocRes.value?.items) {
    const docs = webDocRes.value.items as WebDocItem[];
    if (docs.length > 0) {
      sections.push('\n[웹문서 검색 결과]');
      docs.forEach((d, i) => {
        const title = stripHtml(d.title);
        const desc = stripHtml(d.description);
        sections.push(`(웹문서${i + 1}) ${title}\n${desc}`);
        sources.push({ type: 'webdoc', title, description: desc });
      });
    }
  }

  let rawText = sections.join('\n\n');
  let truncated = false;
  if (rawText.length > maxLength) {
    rawText = rawText.slice(0, maxLength) + '\n\n... (자료 너무 많아 일부 생략)';
    truncated = true;
  }

  return {
    rawText,
    sources,
    totalChars: rawText.length,
    searchQuery: keyword,
    truncated,
  };
}

/**
 * 사용자 친화 헬퍼: 키워드만 받아서 rawText만 반환 (안전 wrap).
 * 검색 실패 시 빈 문자열 반환 (caller가 fallback 처리).
 */
export async function fetchFactCheckRawText(keyword: string): Promise<string> {
  if (!keyword || !keyword.trim()) return '';
  try {
    const result = await collectFactCheckSourceFromNaver(keyword.trim());
    if (result.totalChars < 100) {
      console.warn(`[NaverFactCheckRAG] ⚠️ 자료 너무 적음 (${result.totalChars}자) — LLM 환각 위험. keyword="${keyword}"`);
      return '';
    }
    console.log(`[NaverFactCheckRAG] ✅ 네이버 자료 수집 완료: ${result.totalChars}자, ${result.sources.length}개 소스 (블로그/뉴스/지식인)`);
    return result.rawText;
  } catch (err: any) {
    console.warn(`[NaverFactCheckRAG] ⚠️ 검색 실패 → LLM 자체 지식 사용:`, err?.message || err);
    return '';
  }
}
