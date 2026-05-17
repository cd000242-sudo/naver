/**
 * SERP Probe — 끝판왕 Phase 3.1 (v2.10.183)
 *
 * 네이버 통합탭/블로그탭 상위 노출 글을 *실측* 분석한다.
 *   - 추정 효과 금지 (메모리 정렬) — Playwright/axios 프레임 분석으로 실제 데이터 측정
 *   - 우리 글 vs 노출 글의 *직접 비교* 가능
 *
 * 흐름:
 *   1. 네이버 검색 API로 상위 N개 글 URL/메타 가져오기 (안정적)
 *   2. 각 글 본문을 PostView URL로 fetch (iframe 우회)
 *   3. qualityEvaluator의 동일 evaluator로 신호 측정
 *   4. 평균/중앙값 산출 → 우리 글과 비교 가능한 baseline 생성
 *
 * 비교 가능한 신호 (qualityEvaluator 그대로 재사용):
 *   - 키워드 밀도, 본문 길이, H2/H3 구조
 *   - AI 클리셰 개수, 직접 경험 표현 개수
 *   - 구체 수치(단위) 개수, burstiness
 *   - 어미 다양성, 자기 정정 마커
 */

import axios from 'axios';
import { evaluate, type EvaluationInput, type EvaluationResult, type Mode } from '../content/qualityEvaluator';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SerpItem {
  title: string;
  link: string;          // 원본 link (blog.naver.com/userid/logNo)
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;      // YYYYMMDD
}

export interface ProbedPost {
  item: SerpItem;
  body: string;          // 추출된 본문 텍스트
  bodyLength: number;
  evaluation: EvaluationResult | null;  // qualityEvaluator로 측정 (실패 시 null)
  fetchError?: string;
}

export interface SerpProbeReport {
  keyword: string;
  mode: Mode;
  probedAt: string;
  itemCount: number;
  successCount: number;
  posts: ProbedPost[];
  baseline: {
    avgFinalScore: number;
    avgModeScore: number;
    avgSafetyScore: number;
    avgHumanlikeScore: number;
    avgBodyLength: number;
    avgConcreteNumbers: number;        // 구체 수치 평균
    avgDirectExperience: number;        // 직접 경험 표현 평균
    avgAiClicheCount: number;           // AI 클리셰 평균 (낮을수록 좋음)
    medianFinalScore: number;
  } | null;
}

export interface SerpProbeOptions {
  display?: number;          // 상위 N개 (기본 10, 최대 30)
  sort?: 'sim' | 'date';     // 정렬 (기본 sim = 정확도)
  fetchTimeout?: number;     // 본문 fetch 타임아웃 (기본 8000ms)
  mode?: Mode;               // 평가 모드 (기본 'seo')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네이버 검색 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function searchNaverBlog(
  keyword: string,
  clientId: string,
  clientSecret: string,
  display: number = 10,
  sort: 'sim' | 'date' = 'sim',
): Promise<SerpItem[]> {
  const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
    params: { query: keyword, display: Math.min(30, Math.max(1, display)), sort },
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    timeout: 10000,
  });
  const items = response.data?.items || [];
  return items.map((it: any) => ({
    title: stripHtmlTags(it.title || ''),
    link: it.link || '',
    description: stripHtmlTags(it.description || ''),
    bloggername: it.bloggername || '',
    bloggerlink: it.bloggerlink || '',
    postdate: it.postdate || '',
  }));
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 블로그 본문 fetch (PostView URL 직접)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * blog.naver.com/{blogId}/{logNo} → PostView.naver?blogId=..&logNo=.. 정규화
 *   iframe 회피용 — 직접 본문 페이지 fetch 가능
 */
export function normalizeNaverBlogUrl(url: string): string | null {
  // 이미 PostView면 그대로
  if (/PostView\.naver/i.test(url)) return url;
  const match = url.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/i);
  if (!match) return null;
  const [, blogId, logNo] = match;
  return `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&from=postList`;
}

/**
 * 네이버 블로그 PostView HTML에서 본문 텍스트 추출.
 *   - HTML 태그 제거
 *   - 스크립트/스타일 블록 제거
 *   - 메타데이터(제목 등) 제외하고 본문만
 *   - cheerio 같은 라이브러리 의존 없이 정규식만으로 처리
 */
export function extractBodyFromHtml(html: string): string {
  if (!html) return '';
  let text = html;
  // Remove script, style, noscript blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Priority 1: se-text-paragraph (Naver SmartEditor 3)
  const seBlocks = text.match(/<div[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>[\s\S]*?<\/div>/gi) ?? [];
  if (seBlocks.length >= 3) {
    text = seBlocks.join('\n');
  } else {
    // Priority 2: se-module-text (SmartEditor 2 fallback) -- avoids nav/footer noise
    const seModules = text.match(/<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>[\s\S]*?<\/div>/gi) ?? [];
    if (seModules.length >= 2) {
      text = seModules.join('\n');
    } else {
      // Priority 3: strip obvious noise containers before falling back to full body
      text = text.replace(/<(header|footer|nav|aside)[^>]*>[\s\S]*?<\/\1>/gi, '');
      // Strip common sidebar/ad/widget class containers
      text = text.replace(/<[^>]*class="[^"]*(?:gnb|lnb|snb|sidebar|widget|relate|banner)[^"]*"[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, '');
    }
  }

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Normalize HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  // Collapse whitespace
  text = text.replace(/[ \u200b]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text;
}

async function fetchPostBody(url: string, timeoutMs: number = 8000): Promise<string> {
  const normalizedUrl = normalizeNaverBlogUrl(url) ?? url;
  const response = await axios.get(normalizedUrl, {
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    responseType: 'text',
    maxRedirects: 5,
  });
  return extractBodyFromHtml(String(response.data || ''));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인: SERP 프로브 실행
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function probeSerp(
  keyword: string,
  clientId: string,
  clientSecret: string,
  options: SerpProbeOptions = {},
): Promise<SerpProbeReport> {
  const display = options.display ?? 10;
  const sort = options.sort ?? 'sim';
  const fetchTimeout = options.fetchTimeout ?? 8000;
  const mode = options.mode ?? 'seo';

  const probedAt = new Date().toISOString();
  const items = await searchNaverBlog(keyword, clientId, clientSecret, display, sort);

  const posts: ProbedPost[] = [];
  for (const item of items) {
    try {
      const body = await fetchPostBody(item.link, fetchTimeout);
      const bodyLength = body.length;
      let evaluation: EvaluationResult | null = null;
      if (bodyLength >= 100) {
        const evalInput: EvaluationInput = {
          body,
          title: item.title,
          headings: [],
          rawText: '',
          primaryKeyword: keyword,
          mode,
        };
        evaluation = evaluate(evalInput);
      }
      posts.push({ item, body, bodyLength, evaluation });
    } catch (err) {
      posts.push({
        item,
        body: '',
        bodyLength: 0,
        evaluation: null,
        fetchError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successPosts = posts.filter(p => p.evaluation !== null);
  const baseline = successPosts.length > 0
    ? computeBaseline(successPosts)
    : null;

  return {
    keyword,
    mode,
    probedAt,
    itemCount: items.length,
    successCount: successPosts.length,
    posts,
    baseline,
  };
}

function computeBaseline(posts: ProbedPost[]): SerpProbeReport['baseline'] {
  const finalScores: number[] = [];
  let modeSum = 0;
  let safetySum = 0;
  let humanSum = 0;
  let bodyLenSum = 0;
  let concreteSum = 0;
  let expSum = 0;
  let aiClicheSum = 0; // inverse of noAiCliche score (higher = more cliche)
  let aiClicheCount = 0; // separate counter to avoid dilution when field is absent
  let count = 0;

  for (const p of posts) {
    if (!p.evaluation) continue;
    finalScores.push(p.evaluation.finalScore);
    modeSum += p.evaluation.modeScore.score;
    safetySum += p.evaluation.safetyScore.score;
    humanSum += p.evaluation.humanlikeScore.score;
    bodyLenSum += p.bodyLength;
    const md = p.evaluation.modeScore.details as Record<string, number>;
    const hd = p.evaluation.humanlikeScore.details as Record<string, number>;
    if (typeof md.concreteNumberCount === 'number') concreteSum += md.concreteNumberCount;
    if (typeof hd.directExperience === 'number') expSum += hd.directExperience;
    if (typeof hd.noAiCliche === 'number') {
      aiClicheSum += Math.max(0, 15 - hd.noAiCliche); // clamp to 0 so negative scores don't distort
      aiClicheCount++;
    }
    count++;
  }

  finalScores.sort((a, b) => a - b);
  const median = finalScores[Math.floor(finalScores.length / 2)] ?? 0;

  return {
    avgFinalScore: Math.round(finalScores.reduce((a, b) => a + b, 0) / count),
    avgModeScore: Math.round(modeSum / count),
    avgSafetyScore: Math.round(safetySum / count),
    avgHumanlikeScore: Math.round(humanSum / count),
    avgBodyLength: Math.round(bodyLenSum / count),
    avgConcreteNumbers: Math.round((concreteSum / count) * 10) / 10,
    avgDirectExperience: Math.round((expSum / count) * 10) / 10,
    avgAiClicheCount: aiClicheCount > 0 ? Math.round((aiClicheSum / aiClicheCount) * 10) / 10 : 0,
    medianFinalScore: median,
  };
}
