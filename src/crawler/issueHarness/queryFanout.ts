// src/crawler/issueHarness/queryFanout.ts
// AI body analysis → per-heading query fanout (Korean/English/fandom/event).
// One Gemini call per post; heuristic fallback keeps the harness working
// without an API key (English/fandom variants are simply skipped then).

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_TEXT_MODELS } from '../../runtime/modelRegistry.js';
import { trackGeminiUsage } from '../../gemini.js';
import type { HeadingQuerySet, IssueHeadingInput, IssueQueryPlan } from './types.js';

const LOG = '[IssueQueryFanout]';
const BODY_EXCERPT_CHARS = 280;

const HOOK_STOPWORDS = new Set([
  '소식', '이유', '진짜', '정말', '놀란', '충격', '화제', '근황', '공개',
  '숨겨진', '그것', '이것', '모두', '드디어', '결국', '과연', '바로',
  '대박', '최초', '단독', '이', '가', '은', '는', '을', '를', '에', '도',
  '와', '과', '의', '로', '까지', '부터', '했다', '합니다',
]);

/** Strip hook words/particles and keep the leading core tokens. */
export function generalizeIssueQuery(text: string, maxTokens = 4): string {
  if (!text) return '';
  const tokens = text
    .replace(/[?!.…,"'()[\]{}·•~-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !HOOK_STOPWORDS.has(t));
  return tokens.slice(0, maxTokens).join(' ').trim();
}

/** Heuristic plan used when Gemini is unavailable or fails. */
export function buildFallbackQueryPlan(
  title: string,
  headings: IssueHeadingInput[],
): IssueQueryPlan {
  const subject = generalizeIssueQuery(title, 2) || title.split(' ')[0] || '';
  const querySets: HeadingQuerySet[] = headings.map((h) => {
    const base = generalizeIssueQuery(`${subject} ${h.title}`, 4) || subject;
    return {
      heading: h.title,
      koreanQuery: base,
      englishQuery: '',
      fandomQuery: subject ? `${subject} 직찍` : '',
      eventQuery: '',
      broaderQuery: subject,
    };
  });
  return { mainSubject: subject, romanizedSubject: '', querySets, aiGenerated: false };
}

function buildPrompt(title: string, headings: IssueHeadingInput[]): string {
  const sections = headings
    .map((h, i) => {
      const body = String(h.body || '').replace(/\s+/g, ' ').trim().slice(0, BODY_EXCERPT_CHARS);
      return `${i + 1}. 소제목: ${h.title}\n   본문: ${body || '(없음)'}`;
    })
    .join('\n');

  return `당신은 연예/스포츠/이슈 이미지 검색 전문가입니다. 글 제목·소제목·본문을 분석해 소제목별 이미지 검색어 4종을 생성하세요.

# 글 제목
${title}

# 소제목별 본문
${sections}

# 규칙
1. 핵심 인물/팀을 파악 (동명이인·동음이의어 구분: 본문 문맥 사용)
2. koreanQuery: 인물명 + 본문이 실제로 묘사하는 장면의 핵심어 (2~4단어)
3. englishQuery: 로마자 인물명 + 영문 이슈 키워드 (해외 검색용, 예: "Son Heung-min Tottenham")
4. fandomQuery: 팬 촬영 원본을 찾는 검색어 (예: "인물명 직찍", "인물명 출근길", "인물명 공항")
5. eventQuery: 인물명 없이 행사/경기 현장 검색어 (예: "골든디스크 2026", 해당 없으면 빈 문자열)
6. mainSubject: 핵심 인물/팀 한글명, romanizedSubject: 그 로마자 표기

# 응답 형식 (JSON만 출력, 설명 금지)
{
  "mainSubject": "...",
  "romanizedSubject": "...",
  "sets": [
    {"index": 1, "koreanQuery": "...", "englishQuery": "...", "fandomQuery": "...", "eventQuery": "..."}
  ]
}`;
}

/**
 * Build the per-heading query plan.
 * Gemini Flash 1-call; falls back to heuristics on any failure.
 */
export async function buildIssueQueryPlan(
  title: string,
  headings: IssueHeadingInput[],
  geminiApiKey?: string,
): Promise<IssueQueryPlan> {
  const fallback = buildFallbackQueryPlan(title, headings);
  if (!geminiApiKey) {
    console.log(`${LOG} Gemini 키 없음 → 휴리스틱 플랜 사용`);
    return fallback;
  }

  try {
    const client = new GoogleGenerativeAI(geminiApiKey);
    // Thinking-capable Gemini 3.x consumes output budget on reasoning tokens —
    // JSON mode + a generous cap keep the answer from truncating mid-array.
    const model = client.getGenerativeModel({
      model: GEMINI_TEXT_MODELS.FLASH,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(buildPrompt(title, headings));
    const text = result.response.text().trim();

    const usage = (result.response as any).usageMetadata;
    if (usage) {
      const p = usage.promptTokenCount || 0;
      const t = usage.totalTokenCount || 0;
      trackGeminiUsage(GEMINI_TEXT_MODELS.FLASH, p, t > p ? t - p : (usage.candidatesTokenCount || 0));
    }

    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 응답 없음');
    const parsed = JSON.parse(jsonMatch[0]) as {
      mainSubject?: string;
      romanizedSubject?: string;
      sets?: Array<{ index: number; koreanQuery?: string; englishQuery?: string; fandomQuery?: string; eventQuery?: string }>;
    };

    const subject = String(parsed.mainSubject || '').trim() || fallback.mainSubject;
    const querySets: HeadingQuerySet[] = headings.map((h, i) => {
      const match = (parsed.sets || []).find((s) => s.index === i + 1);
      const fb = fallback.querySets[i];
      return {
        heading: h.title,
        koreanQuery: String(match?.koreanQuery || '').trim() || fb.koreanQuery,
        englishQuery: String(match?.englishQuery || '').trim(),
        fandomQuery: String(match?.fandomQuery || '').trim() || fb.fandomQuery,
        eventQuery: String(match?.eventQuery || '').trim(),
        broaderQuery: subject,
      };
    });

    console.log(`${LOG} ✅ AI 쿼리 팬아웃 완료: ${querySets.length}개 소제목 × 4변형 (주체: ${subject})`);
    return {
      mainSubject: subject,
      romanizedSubject: String(parsed.romanizedSubject || '').trim(),
      querySets,
      aiGenerated: true,
    };
  } catch (error) {
    console.warn(`${LOG} ⚠️ AI 팬아웃 실패, 휴리스틱 폴백: ${(error as Error).message}`);
    return fallback;
  }
}
