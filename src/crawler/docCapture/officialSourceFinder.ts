// src/crawler/docCapture/officialSourceFinder.ts
// Stage 1 of the doc-capture harness: AI source plan (program/agency/queries,
// per-heading capture goals) + official-domain page discovery via the Naver
// web/news search APIs, filtered to a government domain allowlist.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_TEXT_MODELS } from '../../runtime/modelRegistry.js';
import { trackGeminiUsage } from '../../gemini.js';
import { fetchNaverSearch } from '../shared/naverApiCredentials.js';
import type { DocHeadingInput, DocSourcePlan, OfficialPage } from './types.js';

const LOG = '[DocSourceFinder]';
const BODY_EXCERPT_CHARS = 240;

// ---------------------------------------------------------------------------
// Official domain policy (pure, unit-tested)
// ---------------------------------------------------------------------------

/** Tier 1: 정부 직할. Tier 2: 공단/공사 준공공. null: 비공식 → 제외. */
export function classifyOfficialDomain(url: string): 1 | 2 | null {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.endsWith('.go.kr') || host === 'gov.kr' || host.endsWith('.gov.kr') || host === 'korea.kr' || host.endsWith('.korea.kr')) {
    return 1;
  }
  if (host.endsWith('.or.kr')) return 2;
  return null;
}

/** PDF/파일 링크는 헤드리스 렌더 불가 — HTML 페이지만 캡처 대상. */
export function isCapturablePage(url: string): boolean {
  return !/\.(pdf|hwp|hwpx|docx?|xlsx?|zip)(\?|$)/i.test(url);
}

function stripTags(s: string): string {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

// ---------------------------------------------------------------------------
// AI source plan
// ---------------------------------------------------------------------------

export function buildFallbackSourcePlan(title: string, headings: DocHeadingInput[]): DocSourcePlan {
  const core = title.split(/\s+/).slice(0, 3).join(' ');
  return {
    programName: core,
    agency: '',
    officialQueries: [`${core} 공고`, `${core} 신청 방법 정부`, `${core} 지원 대상`],
    headingGoals: headings.map((h) => `${h.title} 관련 공식 안내 내용`),
    aiGenerated: false,
  };
}

export async function buildDocSourcePlan(
  title: string,
  headings: DocHeadingInput[],
  geminiApiKey?: string,
): Promise<DocSourcePlan> {
  const fallback = buildFallbackSourcePlan(title, headings);
  if (!geminiApiKey) return fallback;

  const sections = headings
    .map((h, i) => `${i + 1}. ${h.title}\n   본문: ${String(h.body || '').replace(/\s+/g, ' ').slice(0, BODY_EXCERPT_CHARS) || '(없음)'}`)
    .join('\n');
  const prompt = `당신은 한국 정부 지원사업·경제정책 전문 리서처입니다. 아래 블로그 글이 다루는 공식 제도를 파악하세요.

# 글 제목
${title}

# 소제목별 본문
${sections}

# 판정 항목
- programName: 이 글이 다루는 제도/지원사업의 공식 명칭
- agency: 주관 기관 (부처/공단, 모르면 빈 문자열)
- officialQueries: 정부 공식 페이지(공고문·안내 페이지)를 찾기 위한 검색어 3~5개 (기관명+제도명 조합, "공고"/"신청"/"안내" 포함)
- headingGoals: 각 소제목 아래에 캡처로 보여주면 좋을 공식 문서 내용 한 줄씩 (소제목 순서대로 ${headings.length}개. 예: "지원 대상·요건 표", "신청 기간과 방법 안내", "지원 금액 산정 기준")

# 출력 (JSON 하나만, 설명 금지)
{"programName":"...","agency":"...","officialQueries":["..."],"headingGoals":["..."]}`;

  try {
    const client = new GoogleGenerativeAI(geminiApiKey);
    const model = client.getGenerativeModel({
      model: GEMINI_TEXT_MODELS.FLASH,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    const usage = (result.response as any).usageMetadata;
    if (usage) {
      const p = usage.promptTokenCount || 0;
      const t = usage.totalTokenCount || 0;
      trackGeminiUsage(GEMINI_TEXT_MODELS.FLASH, p, t > p ? t - p : (usage.candidatesTokenCount || 0));
    }
    const cleaned = result.response.text().replace(/```(?:json)?/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 응답 없음');
    const parsed = JSON.parse(jsonMatch[0]) as Partial<DocSourcePlan>;
    const plan: DocSourcePlan = {
      programName: String(parsed.programName || '').trim() || fallback.programName,
      agency: String(parsed.agency || '').trim(),
      officialQueries: (Array.isArray(parsed.officialQueries) ? parsed.officialQueries : [])
        .map((q) => String(q).trim())
        .filter(Boolean)
        .slice(0, 5),
      headingGoals: headings.map((h, i) =>
        String((parsed.headingGoals as any)?.[i] || '').trim() || fallback.headingGoals[i],
      ),
      aiGenerated: true,
    };
    if (plan.officialQueries.length === 0) plan.officialQueries = fallback.officialQueries;
    console.log(`${LOG} ✅ AI 소스 플랜: "${plan.programName}" (${plan.agency || '기관 미상'}), 쿼리 ${plan.officialQueries.length}개`);
    return plan;
  } catch (error) {
    console.warn(`${LOG} ⚠️ AI 플랜 실패, 휴리스틱 폴백: ${(error as Error).message}`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Official page discovery (Naver web + news search, allowlist filtered)
// ---------------------------------------------------------------------------

interface NaverSearchItem { title?: string; link?: string }

export function rankOfficialPages(
  raw: Array<{ url: string; title: string }>,
  cap: number,
): OfficialPage[] {
  const seen = new Set<string>();
  const pages: OfficialPage[] = [];
  for (const item of raw) {
    const tier = classifyOfficialDomain(item.url);
    if (tier === null || !isCapturablePage(item.url)) continue;
    const key = item.url.split('#')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push({ url: item.url, title: item.title, domainTier: tier });
  }
  return pages.sort((a, b) => a.domainTier - b.domainTier).slice(0, cap);
}

export async function findOfficialPages(plan: DocSourcePlan, cap: number): Promise<OfficialPage[]> {
  const raw: Array<{ url: string; title: string }> = [];
  for (const query of plan.officialQueries) {
    for (const endpoint of ['webkr', 'news'] as const) {
      const data = await fetchNaverSearch<{ items?: NaverSearchItem[] }>(endpoint, { query, display: 15 });
      for (const item of data?.items || []) {
        if (item.link) raw.push({ url: item.link, title: stripTags(item.title || '') });
      }
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    }
    // Enough official candidates → stop burning API quota on remaining queries.
    if (rankOfficialPages(raw, cap * 3).length >= cap * 2) break;
  }
  const pages = rankOfficialPages(raw, cap);
  console.log(`${LOG} 🔎 공식 페이지 ${pages.length}개 발굴 (원시 ${raw.length}건 중)`);
  pages.forEach((p) => console.log(`${LOG}   [T${p.domainTier}] ${p.url.slice(0, 90)}`));
  return pages;
}
