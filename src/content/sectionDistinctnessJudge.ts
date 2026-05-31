// Semantic section-distinctness judge (SPEC-REVIEW-001 확장 — 갭 C 시맨틱 버전).
//
// Problem: a hollow ungrounded article restates the SAME idea across H2 sections with
// varied wording ("매년 다르다 / 일찍 가라 / 비 온다"). Cheap lexical signals fail —
// section-overlap measured 0.096 on the hollow article vs 0.098 on a genuinely good
// one (good scored HIGHER), so lexical redundancy cannot separate the two classes.
//
// Approach: ask the generation provider itself (Gemini is free for most users) whether
// each section conveys a DISTINCT information unit. This is opt-in: default OFF, one
// extra call per generation max, ungrounded keyword path only. The LLM caller is
// injected (dependency injection) so the module is fully unit-testable with a mock and
// never depends on a live provider in tests.
//
// Safety: FAIL-OPEN. Any parse error / call failure / too-few-sections → distinct=true
// (never blocks or false-flags generation on a judge hiccup).
//
// Gated by CONTENT_SEMANTIC_DISTINCTNESS_JUDGE (default OFF).
//
// Related:
//   - src/content/generalContentGuard.ts (prompt-level "각 H2는 서로 다른 새 정보 단위")
//   - src/contentPlatitudeDetector.ts (lexical sibling detector)

/** provider 호출(callGemini 등)이 system/user를 가르는 마커. 콘텐츠를 user로 보내기 위함. */
const PROVIDER_PROMPT_MARKER = '[원본 텍스트]';

/** 판정에 필요한 최소 섹션 수 — 미만이면 판정 생략(fail-open distinct). */
const MIN_SECTIONS_TO_JUDGE = 3;

/** 섹션당 프롬프트에 싣는 본문 길이 — 토큰/비용 절감. */
const PER_SECTION_BODY_CHARS = 220;

export interface DistinctnessDetectableContent {
  headings?: Array<{ title?: string; body?: string; content?: string }>;
}

export interface DistinctnessVerdict {
  /** 각 섹션이 서로 다른 정보 단위인가 (fail-open 시 true) */
  distinct: boolean;
  /** 모델이 지목한 중복 섹션 번호 (1-base) */
  redundantSections: number[];
  /** 사유 (로그/사용자 표시용) */
  reason: string;
  /** 판정 대상 섹션 수 */
  sectionCount: number;
  /** 실제 LLM 판정이 이뤄졌는가 (false = 생략/실패로 fail-open) */
  judged: boolean;
}

/** 의존성 주입용 LLM 호출 함수 — 프롬프트를 받아 원문 응답을 반환. */
export type DistinctnessLLMCaller = (prompt: string) => Promise<string>;

/**
 * 옵트인 플래그. 기본 OFF — 켠 사용자만 1회 추가 호출 비용을 진다.
 * 켜는 값: '1' | 'true' | 'on'. 그 외/미설정은 OFF.
 */
export function isSemanticDistinctnessJudgeEnabled(): boolean {
  const raw = process.env.CONTENT_SEMANTIC_DISTINCTNESS_JUDGE;
  if (raw == null) return false;
  const normalised = String(raw).trim().toLowerCase();
  return normalised === '1' || normalised === 'true' || normalised === 'on';
}

/**
 * 판정 프롬프트를 만든다. 섹션이 MIN_SECTIONS_TO_JUDGE 미만이면 null (판정 불필요).
 */
export function buildDistinctnessPrompt(content: DistinctnessDetectableContent): string | null {
  const sections = collectSections(content);
  if (sections.length < MIN_SECTIONS_TO_JUDGE) return null;

  const sectionBlock = sections
    .map((s, i) => `${i + 1}. ${s.title}\n${s.body.slice(0, PER_SECTION_BODY_CHARS)}`)
    .join('\n\n');

  const instructions =
    '당신은 블로그 글의 정보 밀도를 평가하는 편집자입니다.\n'
    + '아래 H2 소제목과 본문을 보고, 각 섹션이 "서로 다른 정보 단위"를 담고 있는지 판정하세요.\n'
    + '- 같은 주장·정보를 표현만 바꿔 반복하면 redundant(중복)입니다.\n'
    + '- 장소·수치·방법·사례 등 구체 정보가 섹션마다 실제로 다르면 distinct(변별)입니다.\n'
    + '- 애매하면 distinct로 판정하세요(과잉 차단 금지).';

  const responseSpec =
    '\n\n반드시 아래 JSON 한 줄로만 답하세요. 다른 텍스트 금지:\n'
    + '{"distinct": true 또는 false, "redundantSections": [중복 섹션 번호 배열], "reason": "한 줄 사유"}';

  return `${instructions}\n\n${PROVIDER_PROMPT_MARKER}\n[섹션]\n${sectionBlock}${responseSpec}`;
}

/**
 * 섹션 변별성을 LLM으로 판정한다. FAIL-OPEN — 어떤 실패든 distinct=true.
 *
 * @param content - headings 보유 구조화 콘텐츠
 * @param callLLM - 주입된 provider 호출 함수 (Gemini 등)
 */
export async function judgeSectionDistinctness(
  content: DistinctnessDetectableContent,
  callLLM: DistinctnessLLMCaller,
): Promise<DistinctnessVerdict> {
  const sectionCount = collectSections(content).length;
  const prompt = buildDistinctnessPrompt(content);

  if (prompt == null) {
    return failOpen(sectionCount, '섹션 부족 — 판정 생략');
  }

  let raw: string;
  try {
    raw = await callLLM(prompt);
  } catch (err) {
    return failOpen(sectionCount, `판정 호출 실패(fail-open): ${(err as Error)?.message ?? err}`);
  }

  const parsed = parseVerdict(raw);
  if (!parsed) {
    return failOpen(sectionCount, '판정 응답 파싱 실패(fail-open)');
  }

  return {
    distinct: parsed.distinct,
    redundantSections: parsed.redundantSections,
    reason: parsed.reason || (parsed.distinct ? '섹션 변별 양호' : '섹션 중복 감지'),
    sectionCount,
    judged: true,
  };
}

// ── helpers ──────────────────────────────────────────────────────────

function collectSections(content: DistinctnessDetectableContent): Array<{ title: string; body: string }> {
  if (!Array.isArray(content.headings)) return [];
  return content.headings
    .map((h) => ({
      title: (h.title ?? '').trim(),
      body: (typeof h.body === 'string' ? h.body : typeof h.content === 'string' ? h.content : '').trim(),
    }))
    .filter((s) => s.body.length >= 20);
}

/** 응답에서 첫 JSON 객체를 추출·검증. 실패 시 null. */
function parseVerdict(
  raw: string,
): { distinct: boolean; redundantSections: number[]; reason: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let obj: any;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (typeof obj?.distinct !== 'boolean') return null;

  const redundantSections = Array.isArray(obj.redundantSections)
    ? obj.redundantSections.filter((n: unknown) => typeof n === 'number' && Number.isFinite(n))
    : [];
  const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : '';

  return { distinct: obj.distinct, redundantSections, reason };
}

function failOpen(sectionCount: number, reason: string): DistinctnessVerdict {
  return { distinct: true, redundantSections: [], reason, sectionCount, judged: false };
}
