// Throughline judge — does the article hold the question its title raised, all the way to the end?
//
// [2026-09-06 사장님] "도입에서 던진 문제를 끝까지 붙잡는 구성과 분명한 관점", "제목의 공감을
// 본문이 끝까지 이어받아야 해". R2 put the stance (finalVerdict) into the schema; this module
// asks a cheap side model, once per article, whether the draft actually carried it:
//   intro      — receives the reader situation the title touched
//   body       — builds evidence toward the stance without flipping it
//   conclusion — answers the opening question with the stance, not a summary
//
// Why a model, not a lexical check: vocabulary overlap between stance and conclusion was measured
// twice in this codebase and failed both times (sectionDistinctnessJudge.ts:4-6 records the same
// failure class; the 9/6 sample flagged 25~33% of good conclusions). Only a reader can tell
// "returns to the judgement" from "repeats the words".
//
// Contract:
//   - selected-engine route only (resolveSideTaskRoute) — no vendor fallback
//   - subscription CLIs are skipped (they take minutes, the judge budget is seconds)
//   - FAIL-OPEN on any failure; never blocks publishing
//   - no consumer of its own: it hands a directive to the existing regen/patch path. A miss in the
//     intro is warn-only because patch rewrites body+conclusion, never the intro.

/** Splits system/user for provider callers; content goes after it. */
const PROVIDER_PROMPT_MARKER = '[원본 텍스트]';
/** Per-heading body sample — the judge reads flow, not detail. */
const PER_HEADING_BODY_CHARS = 160;
const REASON_MAX_CHARS = 200;
const FIX_MAX_CHARS = 300;
const JUDGE_MAX_TOKENS = 500;

export type ThroughlineBreak = 'intro' | 'body' | 'conclusion' | 'none';

export interface ThroughlineContent {
  readonly selectedTitle?: unknown;
  readonly introduction?: unknown;
  readonly conclusion?: unknown;
  readonly finalVerdict?: unknown;
  readonly __blueprintAngle?: unknown;
  readonly headings?: ReadonlyArray<{ readonly title?: string; readonly body?: string; readonly content?: string }>;
}

export interface ThroughlineJudgement {
  /** True only when a model actually answered; false = skipped or failed (fail-open). */
  readonly judged: boolean;
  readonly holds: boolean;
  readonly breakAt: ThroughlineBreak;
  readonly reason: string;
  readonly fix: string;
  /** A miss the patch path can act on (body/conclusion). Intro misses are warn-only. */
  readonly patchable: boolean;
  readonly engine: string;
}

export type ThroughlineRoute = {
  readonly engine: string;
  readonly subscription?: boolean;
  readonly callModel: (prompt: string, options?: { maxTokens?: number; timeoutMs?: number }) => Promise<string>;
} | null;

/** Default ON. THROUGHLINE_JUDGE_V1=false|0|off rolls the judge back without a release. */
export function isThroughlineJudgeEnabled(): boolean {
  const raw = process.env.THROUGHLINE_JUDGE_V1;
  if (raw == null) return true;
  const n = String(raw).trim().toLowerCase();
  return n !== 'false' && n !== '0' && n !== 'off';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function headingLines(content: ThroughlineContent): string[] {
  if (!Array.isArray(content.headings)) return [];
  return content.headings
    .map((h) => ({ title: text(h.title), body: text(typeof h.body === 'string' ? h.body : h.content) }))
    .filter((h) => h.title)
    .map((h, i) => `${i + 1}. ${h.title}\n${h.body.slice(0, PER_HEADING_BODY_CHARS)}`);
}

/** Null when the draft lacks what a flow judgement needs (title, conclusion, headings). */
export function buildThroughlinePrompt(content: ThroughlineContent): string | null {
  const title = text(content.selectedTitle);
  const conclusion = text(content.conclusion);
  const headings = headingLines(content);
  if (!title || !conclusion || headings.length === 0) return null;

  const question = text(content.__blueprintAngle);
  const verdict = text(content.finalVerdict);
  const intro = text(content.introduction);

  const instructions =
    '당신은 블로그 글의 흐름을 보는 편집자입니다. 제목이 던진 질문(독자 상황)을 글이 끝까지 붙잡고 있는지만 판정하세요.\n'
    + '기준 세 가지:\n'
    + '1. 도입(intro): 제목이 건드린 독자 상황·질문을 받아 세우는가. 제목과 무관한 일반론으로 시작하면 실패.\n'
    + '2. 본문(body): 필자의 판단을 향해 근거를 쌓는가. 판단과 무관한 정보 나열이거나 판단이 중간에 뒤집히면 실패.\n'
    + '3. 결론(conclusion): 도입의 질문에 필자의 판단으로 답하며 매듭짓는가. 본문 요약 되풀이·새 주제·"결론적으로/정리하면" 식 정리는 실패.\n'
    + '- 표현이 달라도 같은 판단으로 돌아왔으면 통과입니다. 단어 겹침을 보지 마세요.\n'
    + '- 애매하면 통과로 판정하세요. 실패는 독자가 "이 글이 무슨 말을 하려던 거지" 하고 느낄 때만입니다.';

  const material = [
    `[제목]\n${title}`,
    question ? `[도입이 받을 질문]\n${question}` : '',
    verdict ? `[필자의 판단]\n${verdict}` : '',
    intro ? `[도입]\n${intro}` : '',
    `[본문 소제목과 첫 부분]\n${headings.join('\n\n')}`,
    `[결론]\n${conclusion}`,
  ].filter(Boolean).join('\n\n');

  const responseSpec =
    '\n\n반드시 아래 JSON 한 줄로만 답하세요. 다른 텍스트 금지:\n'
    + '{"holds": true 또는 false, "breakAt": "intro" 또는 "body" 또는 "conclusion" 또는 "none", "reason": "한 줄 사유", "fix": "실패한 자리를 어떻게 고칠지 한두 문장(실패 시만)"}';

  return `${instructions}\n\n${PROVIDER_PROMPT_MARKER}\n${material}${responseSpec}`;
}

function normaliseBreak(value: unknown): ThroughlineBreak {
  return value === 'intro' || value === 'body' || value === 'conclusion' ? value : 'none';
}

function parseJudgement(raw: string): { holds: boolean; breakAt: ThroughlineBreak; reason: string; fix: string } | null {
  const match = typeof raw === 'string' ? raw.match(/\{[\s\S]*\}/) : null;
  if (!match) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof obj?.holds !== 'boolean') return null;
  return {
    holds: obj.holds,
    breakAt: obj.holds ? 'none' : normaliseBreak(obj.breakAt),
    reason: text(obj.reason).slice(0, REASON_MAX_CHARS),
    fix: text(obj.fix).slice(0, FIX_MAX_CHARS),
  };
}

function failOpen(reason: string, engine = ''): ThroughlineJudgement {
  return { judged: false, holds: true, breakAt: 'none', reason, fix: '', patchable: false, engine };
}

/**
 * One side-model call. Any failure returns holds=true/judged=false so the article flows on
 * exactly as before this module existed.
 */
export async function judgeThroughline(
  content: ThroughlineContent,
  resolveRoute: () => Promise<ThroughlineRoute>,
): Promise<ThroughlineJudgement> {
  const prompt = buildThroughlinePrompt(content);
  if (prompt == null) return failOpen('입력 부족(제목·결론·소제목) — 판정 생략');

  const route = await resolveRoute().catch(() => null);
  if (!route) return failOpen('선택 엔진 키 없음 — 판정 생략');
  if (route.subscription) return failOpen('에이전트 모드 생략(구독 CLI 는 분 단위)', route.engine);

  let raw: string;
  try {
    raw = await route.callModel(prompt, { maxTokens: JUDGE_MAX_TOKENS });
  } catch (err) {
    return failOpen(`판정 호출 실패(fail-open): ${(err as Error)?.message ?? err}`, route.engine);
  }

  const parsed = parseJudgement(raw);
  if (!parsed) return failOpen('판정 응답 파싱 실패(fail-open)', route.engine);

  return {
    judged: true,
    holds: parsed.holds,
    breakAt: parsed.breakAt,
    reason: parsed.reason || (parsed.holds ? '질문을 끝까지 붙잡음' : '질문을 놓침'),
    fix: parsed.fix,
    patchable: !parsed.holds && parsed.breakAt !== 'intro',
    engine: route.engine,
  };
}

const BREAK_LABEL: Record<ThroughlineBreak, string> = {
  intro: '도입',
  body: '본문',
  conclusion: '결론',
  none: '글 전체',
};

/** Directive for the regen prompt or the patch rewrite. Empty unless the judge saw a miss. */
export function buildThroughlineDirective(j: ThroughlineJudgement): string {
  if (!j.judged || j.holds) return '';
  const fix = j.fix ? ` ${j.fix}` : '';
  return `[흐름 관통] 제목이 던진 질문을 ${BREAK_LABEL[j.breakAt]}에서 놓쳤다: ${j.reason}.${fix} 결론은 본문 요약이 아니라 필자의 판단으로 돌아와 매듭짓는다.`;
}

export function describeThroughline(j: ThroughlineJudgement): string {
  if (!j.judged) return `[Throughline] 생략 — ${j.reason}`;
  const engine = j.engine ? `(${j.engine}) ` : '';
  if (j.holds) return `[Throughline] ✅ ${engine}${j.reason}`;
  return `[Throughline] ⚠️ ${engine}${j.breakAt}: ${j.reason}${j.patchable ? '' : ' · patch 불가(도입) — 경고만'}`;
}
