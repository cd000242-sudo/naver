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

// ============================================================================
// ✅ [v2.10.74] Phase 1 — 자료 부족 시 발행 거부 (입력 단계)
// ============================================================================

export interface FactCheckValidationResult {
  passed: boolean;
  reason?: string;
  rawText: string;
  totalChars: number;
  keywordCoverage: number; // 0~1
}

/**
 * 키워드 핵심 단어를 추출 (조사/어미 제거).
 */
function extractKeywordTerms(keyword: string): string[] {
  // 한글 조사/어미 제거 + 길이 2자 이상만
  const STOP_WORDS = new Set(['이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '은', '는', '한', '어', '아']);
  return keyword
    .split(/[\s,;]+/)
    .map((t) => t.replace(/[은는이가을를의에에서으로로와과도]+$/u, '').trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * 자료 검증 — 자료 부족 또는 키워드 무관 시 passed: false 반환.
 * caller는 passed=false면 사용자에게 alert 후 발행 차단.
 */
export async function validateFactCheckSource(
  keyword: string,
  options?: { minChars?: number; minKeywordCoverage?: number },
): Promise<FactCheckValidationResult> {
  const minChars = options?.minChars ?? 1000; // 자료 1000자 이상 필수
  const minCoverage = options?.minKeywordCoverage ?? 0.3; // 키워드 30% 이상 자료에 포함

  if (!keyword || !keyword.trim()) {
    return { passed: false, reason: '키워드 비어있음', rawText: '', totalChars: 0, keywordCoverage: 0 };
  }

  const result = await collectFactCheckSourceFromNaver(keyword.trim());

  if (result.totalChars < minChars) {
    return {
      passed: false,
      reason: `자료 부족 (${result.totalChars}자 < 최소 ${minChars}자). 더 구체적/명확한 키워드 또는 URL 입력이 필요합니다.`,
      rawText: result.rawText,
      totalChars: result.totalChars,
      keywordCoverage: 0,
    };
  }

  const terms = extractKeywordTerms(keyword);
  if (terms.length === 0) {
    return {
      passed: false,
      reason: '키워드에서 핵심 단어를 추출할 수 없음 (너무 짧거나 조사뿐)',
      rawText: result.rawText,
      totalChars: result.totalChars,
      keywordCoverage: 0,
    };
  }

  const matched = terms.filter((t) => result.rawText.includes(t));
  const coverage = matched.length / terms.length;

  if (coverage < minCoverage) {
    return {
      passed: false,
      reason: `키워드와 자료 매칭률 ${Math.round(coverage * 100)}% < 최소 ${Math.round(minCoverage * 100)}%. 검색 결과가 키워드와 무관합니다. 키워드를 재검토하거나 URL을 직접 입력해주세요.`,
      rawText: result.rawText,
      totalChars: result.totalChars,
      keywordCoverage: coverage,
    };
  }

  return {
    passed: true,
    rawText: result.rawText,
    totalChars: result.totalChars,
    keywordCoverage: coverage,
  };
}

// ============================================================================
// ✅ [v2.10.74] Phase 3 — 생성 후 자료 대조 검증
// ============================================================================

/**
 * 본문에서 검증 가능한 fact (숫자/날짜/금액) 추출.
 */
export function extractFactsFromContent(content: string): string[] {
  if (!content) return [];
  const facts: string[] = [];
  const patterns: RegExp[] = [
    // 퍼센트
    /\d+(?:\.\d+)?\s*%/g,
    // 금액 — 만/억/천 + 원/달러
    /\d+(?:,\d{3})*(?:\.\d+)?\s*(?:만|억|천)?\s*(?:원|달러)/g,
    // 날짜 — YYYY년 M월 D일 / M월 D일 / YYYY년
    /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g,
    /(?<!\d)\d{4}년/g,
    /\d{1,2}월\s*\d{1,2}일/g,
    // 단위 수치 — 배/명/개/시간/분/초
    /\d+(?:,\d{3})*(?:\.\d+)?\s*(?:배|명|개|시간|분|초)/g,
  ];
  for (const p of patterns) {
    const matches = content.match(p);
    if (matches) {
      for (const m of matches) facts.push(m.trim().replace(/\s+/g, ' '));
    }
  }
  return [...new Set(facts)];
}

export interface FactValidationReport {
  matchRate: number;        // 0~1
  totalFacts: number;
  matched: string[];
  unmatched: string[];
  passed: boolean;          // matchRate >= threshold
}

/**
 * 본문 fact 가 자료에 있는지 정규식 매칭.
 * - 매칭률 >= threshold (기본 0.7) → passed
 * - 미매칭 fact 는 caller에게 반환 (재생성 또는 alert 결정)
 */
export function validateFactsAgainstSource(
  generatedContent: string,
  sourceText: string,
  threshold: number = 0.7,
): FactValidationReport {
  const facts = extractFactsFromContent(generatedContent);
  if (facts.length === 0) {
    return { matchRate: 1, totalFacts: 0, matched: [], unmatched: [], passed: true };
  }
  const matched: string[] = [];
  const unmatched: string[] = [];
  // 정규화: 공백/콤마 차이 흡수
  const normalizedSource = sourceText.replace(/[\s,]/g, '');
  for (const f of facts) {
    const normalizedFact = f.replace(/[\s,]/g, '');
    if (normalizedSource.includes(normalizedFact) || sourceText.includes(f)) {
      matched.push(f);
    } else {
      unmatched.push(f);
    }
  }
  const matchRate = matched.length / facts.length;
  return {
    matchRate,
    totalFacts: facts.length,
    matched,
    unmatched,
    passed: matchRate >= threshold,
  };
}
