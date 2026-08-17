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
    // 주체를 앞에 두고 소제목 핵심어를 뒤에 붙인다 (주체 앵커 유지).
    const base = generalizeIssueQuery(`${subject} ${h.title}`, 4) || subject;
    return {
      heading: h.title,
      koreanQuery: base,
      englishQuery: '',
      fandomQuery: subject ? `${subject} 직찍` : '',
      eventQuery: '',
      broaderQuery: subject,
      recommendedImages: 1,
    };
  });
  return {
    mainSubject: subject,
    romanizedSubject: '',
    contextSummary: '',
    programName: '',
    querySets,
    aiGenerated: false,
  };
}

function buildPrompt(title: string, headings: IssueHeadingInput[], intro?: string): string {
  const sections = headings
    .map((h, i) => {
      const body = String(h.body || '').replace(/\s+/g, ' ').trim().slice(0, BODY_EXCERPT_CHARS);
      return `${i + 1}. 소제목: ${h.title}\n   본문: ${body || '(없음)'}`;
    })
    .join('\n');

  const introBlock = String(intro || '').replace(/\s+/g, ' ').trim().slice(0, 600);

  return `당신은 연예/스포츠/이슈 이미지 검색 전문가입니다. 글 전체를 읽고 "무슨 사건인지" 먼저 파악한 뒤, 그 사건에 맞는 이미지 검색어를 만드세요.

# 글 제목
${title}
${introBlock ? `\n# 서론(사건 맥락)\n${introBlock}\n` : ''}
# 소제목별 본문
${sections}

# 1단계: 사건 파악 (가장 중요)
- mainSubject: 핵심 인물/팀 한글명 (동명이인은 본문 문맥으로 구분)
- romanizedSubject: 그 로마자 표기
- programName: 사건의 무대가 된 방송 프로그램·행사 고유명사. 본문에 있으면 반드시 정확히
  (예: "미운 우리 새끼", "나 혼자 산다", "골든디스크"). 없으면 빈 문자열
- contextSummary: 무슨 일인지 1~2문장으로. 반드시 본문에 나온 구체 사실만
  (예: "배우 한다감이 시험관 시술로 임신에 성공했고, 미운 우리 새끼 방송에서 남편이
  눈물을 보인 장면이 화제가 됐다")

# 2단계: 소제목별 검색어 (사건 맥락 기준)
⚠️ 소제목 문구를 그대로 검색어로 쓰지 마세요. 소제목은 후킹용 표현이라 시각적 주체가
없습니다 (예: "44세부터 46세 겨울까지" → 이대로 검색하면 엉뚱한 사진이 나옴).
반드시 mainSubject + (programName 또는 사건 핵심어)로 조합하세요.

- koreanQuery: mainSubject + 사건/프로그램 핵심어 (예: "한다감 미운 우리 새끼 임신")
- englishQuery: 로마자 인물명 + 영문 이슈어 (해외 소스용, 없으면 빈 문자열)
- fandomQuery: 그 인물의 실제 모습을 찾는 검색어 (예: "한다감 직찍", "한다감 방송 캡처")
- eventQuery: 프로그램/행사 현장 검색어 (예: "미운 우리 새끼 한다감", 없으면 빈 문자열)
- imageCount: 이 소제목에 필요한 이미지 수 (기본 1). 본문이 여러 장면·단계·비교를
  다뤄 1장으로 부족할 때만 2~3. 확신 없으면 1.

# 응답 형식 (JSON만 출력, 설명 금지)
{
  "mainSubject": "...",
  "romanizedSubject": "...",
  "programName": "...",
  "contextSummary": "...",
  "sets": [
    {"index": 1, "koreanQuery": "...", "englishQuery": "...", "fandomQuery": "...", "eventQuery": "...", "imageCount": 1}
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
  intro?: string,
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

    const result = await model.generateContent(buildPrompt(title, headings, intro));
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
      programName?: string;
      contextSummary?: string;
      sets?: Array<{ index: number; koreanQuery?: string; englishQuery?: string; fandomQuery?: string; eventQuery?: string; imageCount?: number }>;
    };

    const subject = String(parsed.mainSubject || '').trim() || fallback.mainSubject;
    const programName = String(parsed.programName || '').trim();
    const querySets: HeadingQuerySet[] = headings.map((h, i) => {
      const match = (parsed.sets || []).find((s) => s.index === i + 1);
      const fb = fallback.querySets[i];
      const countRaw = Number(match?.imageCount);
      // [2026-08-17] 주체 앵커 강제 — 라이브 실측: "44세부터 46세 겨울까지" 같은
      // 후킹형 소제목에서 주체(인물명) 없는 쿼리가 나가 고양이·패션화보가 수집됐다.
      // 한글/직찍/행사 쿼리는 반드시 주체를 포함시킨다 (영문은 로마자 주체가 따로 있음).
      const anchor = (q: string): string => {
        const query = q.trim();
        if (!query) return '';
        if (!subject) return query;
        return query.includes(subject) ? query : `${subject} ${query}`;
      };
      return {
        heading: h.title,
        koreanQuery: anchor(String(match?.koreanQuery || '').trim() || fb.koreanQuery),
        englishQuery: String(match?.englishQuery || '').trim(),
        fandomQuery: anchor(String(match?.fandomQuery || '').trim() || fb.fandomQuery),
        eventQuery: anchor(String(match?.eventQuery || '').trim()),
        broaderQuery: subject,
        // 기본 1장 — AI가 명시적으로 2~3을 권한 경우만 반영 (범위 밖은 1로 클램프)
        recommendedImages: Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= 3 ? countRaw : 1,
      };
    });

    const contextSummary = String(parsed.contextSummary || '').trim();
    console.log(
      `${LOG} ✅ AI 쿼리 팬아웃 완료: ${querySets.length}개 소제목 (주체: ${subject}${programName ? `, 프로그램: ${programName}` : ''})`,
    );
    if (contextSummary) console.log(`${LOG} 📖 사건 맥락: ${contextSummary.slice(0, 120)}`);
    return {
      mainSubject: subject,
      romanizedSubject: String(parsed.romanizedSubject || '').trim(),
      contextSummary,
      programName,
      querySets,
      aiGenerated: true,
    };
  } catch (error) {
    console.warn(`${LOG} ⚠️ AI 팬아웃 실패, 휴리스틱 폴백: ${(error as Error).message}`);
    return fallback;
  }
}
