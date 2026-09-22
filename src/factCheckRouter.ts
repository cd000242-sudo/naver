/**
 * factCheckRouter.ts — post-draft fact-check engine selector + auto fallback.
 *
 * User contract (2026-07-21): the fact-check step is user-selectable via a
 * dropdown, ordered by cost. "auto" starts from the cheapest evidence
 * (already-crawled material) and escalates ONLY through cheap tiers
 * (crawl → naver → perplexity-if-key). Expensive engines (Gemini grounding)
 * never run unless explicitly selected. Every failure degrades to the
 * original body with a warning — fact-check must never block publishing.
 *
 * [2026-09-22] Inspector, not deleter. The model used to be told to return
 * `replacement: ""` (delete the sentence) for several axes. That is a
 * deletion instruction disguised as a "correction" — it silently strips
 * reader-facing content. The contract now asks the model for structured
 * issues (`claim`/`status`/`issue`/`suggestedCorrection`) and never for a
 * deletion. Whether/how to apply a `suggestedCorrection` is the caller's
 * decision (see postDraftFactCheck.ts — non-destructive by default).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SuspiciousItem } from './perplexityFactCheck.js';

export type FactCheckEngine =
  'off' | 'auto' | 'crawl' | 'naver' | 'gpt-claude' | 'perplexity' | 'gemini-grounding';

export const FACT_CHECK_ENGINE_VALUES: readonly FactCheckEngine[] = [
  'off', 'auto', 'crawl', 'naver', 'gpt-claude', 'perplexity', 'gemini-grounding',
];

/** Evidence below this length is considered too thin to verify against. */
export const AUTO_ESCALATE_BELOW_CHARS = 500;
/** Below this length there is nothing meaningful to compare — skip instead. */
export const MIN_USEFUL_EVIDENCE_CHARS = 100;
/** Evidence longer than this is truncated before being sent to the model. */
export const MAX_EVIDENCE_CHARS = 8000;

export type FactIssueStatus =
  'UNSUPPORTED' | 'CONTRADICTED' | 'TIME_MISMATCH' | 'OVERCLAIM' | 'UNVERIFIABLE';

const FACT_ISSUE_STATUSES: readonly FactIssueStatus[] = [
  'UNSUPPORTED', 'CONTRADICTED', 'TIME_MISMATCH', 'OVERCLAIM', 'UNVERIFIABLE',
];

/**
 * A single inspection finding. The model never instructs deletion — at most
 * it may offer `suggestedCorrection`, and only when it has a concrete,
 * evidence-backed replacement. Applying it is always the caller's choice.
 */
export interface FactIssue {
  claim: string;
  status: FactIssueStatus;
  issue: string;
  evidenceIds?: string[];
  suggestedCorrection?: string;
}

/** Lets the integrator route fact-check LLM calls through the user-selected engine. */
export interface FactCheckCaller {
  /** Log-friendly engine/model label. */
  readonly engine: string;
  readonly callText: (prompt: string, maxTokens?: number) => Promise<string>;
}

export interface FactCheckRouterInput {
  bodyPlain: string;
  topic?: string;
  keyword?: string;
  /** Already-collected source material (crawl/RAG rawText). */
  rawText?: string;
  config?: Record<string, unknown> | null;
  /** When set, used instead of the key-order fallback chain for all non-grounding engines. */
  caller?: FactCheckCaller;
}

export interface FactCheckRouterOutcome {
  /**
   * [2026-09-22] Kept only for engines this project does not own (perplexity's
   * internal factCheckAndRewrite already applies its own replacements before
   * this router sees the result). Callers built after this date should read
   * `issues` instead — this router never auto-applies corrections itself.
   */
  corrected: string;
  issues: FactIssue[];
  /** Engine that actually produced the verdict (auto resolves to a concrete one). */
  engineUsed: string;
  /** Vendor:model label actually called, when resolvable. */
  model?: string;
  notes: string[];
}

/** Dropdown selection with legacy checkbox migration. */
export function resolveFactCheckEngine(config: Record<string, unknown> | null | undefined): FactCheckEngine {
  const raw = String((config as Record<string, unknown> | null)?.factCheckEngine ?? '').trim();
  if ((FACT_CHECK_ENGINE_VALUES as readonly string[]).includes(raw)) return raw as FactCheckEngine;
  if ((config as Record<string, unknown> | null)?.usePerplexityFactCheck === true) return 'perplexity';
  return 'auto';
}

/** Pure escalation rule for the auto chain (unit-tested). */
export function shouldEscalateEvidence(evidenceChars: number): boolean {
  return evidenceChars < AUTO_ESCALATE_BELOW_CHARS;
}

/**
 * [2026-08-28] 판정 축 추가 — 같은 LLM 호출에 얹으므로 추가 과금이 없다.
 *
 * 기존 프롬프트는 "자료와 명백히 모순되는 문장"만 찾았다. 그런데 외부 LLM
 * 비평에서 지적받은 오류는 대부분 **자료 단어로만 만들어진 문장**이라 모순으로 안 보인다:
 * "약 70%"가 "전국 모든"으로 승격되거나, 두 지역 사실이 한 문장에 섞이거나,
 * 발행 뒤 거짓이 되는 상대 날짜가 남는 식이다.
 *
 * 다섯 축 모두 **최소 편집**만 지시한다. 문장을 다시 쓰게 하면 applyCorrections가
 * 멀족한 본문을 갈아엎을 수 있다(문자열 치환으로 실제 본문이 바뀜다).
 *
 * [2026-09-22] 삭제 지시 제거. E-2/E/D/E-1이 "그 문장을 삭제합니다(replacement 를
 * 빈 문자열로 두세요)"를 지시하고 있었다 — 이건 교정이 아니라 검수자 모르게
 * 문장을 지우는 지시다. 이제는 status만 표시하고 suggestedCorrection은 비워
 * 두게 한다. 지울지 말지는 이 프롬프트의 소관이 아니다.
 */
export function buildAssemblyErrorAxes(): string {
  return `
추가로, 자료와 모순되진 않지만 **자료를 잘못 조립한** 아래 다섯 유형도 찾아주세요.
이 유형은 반드시 **최소 편집**으로 고칩니다 — 문장을 새로 쓰지 말고 문제된 부분만 손봅니다.

A. 수량 한정어 승격 — 자료가 "약 70%"인데 본문이 "전국"·"모든"·"유일"·"최초"·"최대"로 올려 씀.
   → suggestedCorrection에 자료 표현 그대로 되돌린 문장을 적으세요. (예: "전국 모든 지자체가" → "약 70%의 지자체가")
B. 주체 혼합 — 한 문장에 둘 이상의 지역·기관·제품 사실이 섞임.
   → suggestedCorrection에 지역별로 문장을 나눈 형태를 적으세요. (예: "A시와 B시는 25만원" → "A시는 25만원입니다. B시는 …")
C. 용어 치환 — 공식 명칭·기준 용어를 비슷한 다른 말로 바꿔 씀.
   ('출생연도 끝자리'와 '생년월일 끝자리'는 다른 제도입니다. '신청기간'≠'사용기간')
   → suggestedCorrection에 자료 표기 그대로 되돌린 문장을 적으세요.
D. 상대 날짜 — "이달 말", "다음 주", "올해 안에"처럼 발행 뒤 거짓이 되는 표현.
   → 자료에 절대 날짜가 있으면 suggestedCorrection에 그 날짜로 바꾼 문장을 적고, 없으면
     suggestedCorrection은 비워 두고 status를 TIME_MISMATCH 로만 표시하세요(문장을 지우라는 지시가 아닙니다).
E-1. 월 없는 날짜 — "23일 0시", "29일과 30일"처럼 월을 안 붙인 날짜.
   → 자료에 월이 있으면 suggestedCorrection에 붙인 문장("6월 23일")을 적고, 없으면
     suggestedCorrection은 비워 두고 status를 TIME_MISMATCH 로만 표시하세요.
E-2. 미검증 정보 중계 — "자료에 나오는데 공식 공지에서 확인하세요", "확인되지 않았습니다"처럼
   검증 못 한 것을 독자에게 설명하는 문장.
   → suggestedCorrection은 비워 두고 status를 UNVERIFIABLE 로 표시하세요(문장을 지우라는 지시가 아닙니다).
E-3. 시점 혼입 — 이번 소식과 시점이 다른 사건(몇 달 전 행사·다른 공연)의 숫자를
   시점 표기 없이 나란히 쓴 문장.
   → "지난 5월"처럼 시점을 붙인 문장을 suggestedCorrection에 적거나, 붙일 근거가 없으면
     suggestedCorrection은 비워 두고 status를 TIME_MISMATCH 로 표시하세요.
E. 근거 없는 이유·전망 — 자료에 설명이 없는데 "~로 보인다", "~할 전망이다",
   "~를 노린 것"처럼 이유나 앞일을 지어냄.
   → suggestedCorrection은 비워 두고 status를 OVERCLAIM 으로 표시하세요(문장을 지우라는 지시가 아닙니다).

⚠️ A~E 는 자료에 근거가 **있는지 없는지**로 판단하지 말고, 위에 적힌 형태에 해당하는지로만
판단하세요. 해당하지 않으면 건드리지 마세요.`;
}

function trimEvidence(evidence: string): string {
  if (evidence.length > MAX_EVIDENCE_CHARS) {
    console.log(`[FactCheck] evidence truncated ${evidence.length}→${MAX_EVIDENCE_CHARS} chars`);
    return evidence.slice(0, MAX_EVIDENCE_CHARS);
  }
  return evidence;
}

function buildPrompt(bodyPlain: string, topic: string | undefined, evidence: string | undefined): string {
  const topicHint = topic ? `주제: "${topic}"\n\n` : '';
  const evidenceBlock = evidence
    ? `=== 확인된 수집 자료 (이 자료만 근거로 판단) ===\n${trimEvidence(evidence)}\n=== 자료 끝 ===\n\n아래 글에서 위 자료와 **명백히 모순되는 문장**만 찾아 문제로 표시하세요. 자료에 없는 내용이라는 이유만으로는 표시하지 마세요.\n${buildAssemblyErrorAxes()}\n`
    : `다음 블로그 글에서 **명백한 사실 오류가 확실한 문장**(통계·연도·인물·제품명·법령·수치)만 보수적으로 골라 문제로 표시해 주세요. 확신이 없으면 포함하지 마세요.\n${buildAssemblyErrorAxes()}\n`;
  return `${topicHint}${evidenceBlock}
각 문제에 대해:
1. claim: 원문 인용 (글에 있는 그대로)
2. status: UNSUPPORTED | CONTRADICTED | TIME_MISMATCH | OVERCLAIM | UNVERIFIABLE 중 하나
3. issue: 짧은 이유
4. evidenceIds: (선택) 근거로 삼은 자료 식별자 배열
5. suggestedCorrection: (선택) 자료 기준 수정 제안. 문장을 삭제하라는 지시가 아닙니다 — 근거가 없으면 비워 두세요.

응답은 반드시 JSON만 (마크다운 금지):
{"issues": [{"claim": "...", "status": "...", "issue": "...", "suggestedCorrection": "..."}]}
문제 없으면 {"issues": []}

=== 글 본문 ===
${bodyPlain}
=== 끝 ===`;
}

export function parseFactIssues(rawResponse: string): FactIssue[] {
  try {
    const cleaned = String(rawResponse || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return [];
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as { issues?: unknown };
    if (!Array.isArray(parsed?.issues)) return [];
    return (parsed.issues as Array<Record<string, unknown>>)
      .filter((item): item is Record<string, unknown> => (
        Boolean(item) && typeof item.claim === 'string' && item.claim.length > 5
      ))
      .map((item) => ({
        claim: String(item.claim),
        status: FACT_ISSUE_STATUSES.includes(item.status as FactIssueStatus)
          ? (item.status as FactIssueStatus)
          : 'UNVERIFIABLE',
        issue: typeof item.issue === 'string' ? item.issue : '',
        evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String) : undefined,
        suggestedCorrection: typeof item.suggestedCorrection === 'string' && item.suggestedCorrection.trim()
          ? item.suggestedCorrection
          : undefined,
      }));
  } catch {
    return [];
  }
}

async function callOpenAiJson(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      // max_completion_tokens: newer models reject max_tokens (2026-07 lesson).
      max_completion_tokens: 2048,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

async function callClaudeJson(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text || '';
}

async function callGeminiJson(
  prompt: string,
  apiKey: string,
  modelName: string,
  grounded: boolean,
): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    // @ts-ignore - Google Search grounding (비용 높음 — 명시 선택 시에만)
    ...(grounded ? { tools: [{ googleSearch: {} }] } : {}),
  });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GEMINI_FACTCHECK_TIMEOUT')), 120_000)),
  ]);
  return result.response.text();
}

/**
 * Resolves which LLM answers an evidence-based fact-check prompt.
 *
 * [2026-09-22 "보조 호출도 선택 엔진으로"] When the integrator passes a
 * `caller` (the user's selected engine — see selectedEngineTextCaller.ts),
 * it is used exclusively; the key-order fallback chain below never runs and
 * no other vendor is touched. Without a caller, the legacy openai → gemini →
 * claude key-order chain applies, same as before.
 */
async function callFactCheckModel(
  input: FactCheckRouterInput,
  prompt: string,
  notes: string[],
): Promise<{ raw: string; model?: string }> {
  if (input.caller) {
    notes.push(`[FactCheck] engine=${input.caller.engine} (selected)`);
    return { raw: await input.caller.callText(prompt, 2048), model: input.caller.engine };
  }
  const config = (input.config || {}) as Record<string, string | undefined>;
  if (config.openaiApiKey) {
    const model = 'gpt-4.1-mini';
    notes.push(`[FactCheck] engine=openai:${model} (fallback chain)`);
    return { raw: await callOpenAiJson(prompt, config.openaiApiKey), model: `openai:${model}` };
  }
  if (config.geminiApiKey) {
    const model = config.geminiModel || 'gemini-3.1-flash-lite';
    notes.push(`[FactCheck] engine=gemini:${model} (fallback chain)`);
    return { raw: await callGeminiJson(prompt, config.geminiApiKey, model, false), model: `gemini:${model}` };
  }
  if (config.claudeApiKey) {
    const model = 'claude-haiku-4-5-20251001';
    notes.push(`[FactCheck] engine=claude:${model} (fallback chain)`);
    return { raw: await callClaudeJson(prompt, config.claudeApiKey), model: `claude:${model}` };
  }
  notes.push('사용 가능한 LLM 키가 없어 자료 대조를 건너뜀');
  return { raw: '' };
}

/** Evidence-based check via the resolved caller/chain. */
async function runEvidenceCheck(
  input: FactCheckRouterInput,
  evidence: string,
  notes: string[],
): Promise<{ issues: FactIssue[]; model?: string }> {
  const prompt = buildPrompt(input.bodyPlain, input.topic, evidence);
  const { raw, model } = await callFactCheckModel(input, prompt, notes);
  return { issues: raw ? parseFactIssues(raw) : [], model };
}

async function collectNaverEvidence(keyword: string | undefined, notes: string[]): Promise<string> {
  if (!keyword) {
    notes.push('키워드가 없어 네이버 자료 수집 불가');
    return '';
  }
  try {
    const { fetchFactCheckRawText } = await import('./naverFactCheckRAG.js');
    return await fetchFactCheckRawText(keyword);
  } catch (error) {
    notes.push(`네이버 자료 수집 실패: ${(error as Error).message}`);
    return '';
  }
}

/** Converts perplexity's own SuspiciousItem output into the FactIssue contract. */
function suspiciousToFactIssues(items: readonly SuspiciousItem[]): FactIssue[] {
  return items.map((item) => ({
    claim: item.original,
    status: 'UNVERIFIABLE',
    issue: item.reason,
    suggestedCorrection: item.replacement || undefined,
  }));
}

/**
 * Run the selected fact-check engine. Never throws — failures return the
 * original body with notes (fact-check must not kill publishing).
 *
 * [2026-09-22] This router only inspects — it never mutates the article
 * itself. `corrected` is kept only because perplexity's own module (out of
 * this project's ownership for this change) already applies its replacement
 * internally; every other engine returns `corrected === input.bodyPlain`.
 * Callers should read `issues` and decide whether/how to apply anything.
 */
export async function runFactCheck(
  engine: FactCheckEngine,
  input: FactCheckRouterInput,
): Promise<FactCheckRouterOutcome> {
  const notes: string[] = [];
  const passthrough = (engineUsed: string): FactCheckRouterOutcome => ({
    corrected: input.bodyPlain, issues: [], engineUsed, notes,
  });

  try {
    if (engine === 'off' || !input.bodyPlain || input.bodyPlain.trim().length < 100) {
      return passthrough(engine === 'off' ? 'off' : 'skip(본문 짧음)');
    }
    const config = (input.config || {}) as Record<string, string | undefined>;
    const rawEvidence = String(input.rawText || '');

    if (engine === 'perplexity') {
      const { factCheckAndRewrite } = await import('./perplexityFactCheck.js');
      const { corrected, result } = await factCheckAndRewrite(input.bodyPlain, input.topic);
      return { corrected, issues: suspiciousToFactIssues(result.suspicious), engineUsed: 'perplexity', notes };
    }

    if (engine === 'gemini-grounding') {
      if (!config.geminiApiKey) {
        notes.push('Gemini API 키 없음 — 그라운딩 팩트체크 건너뜀');
        return passthrough('gemini-grounding');
      }
      const model = config.geminiModel || 'gemini-3.1-flash-lite';
      const raw = await callGeminiJson(buildPrompt(input.bodyPlain, input.topic, undefined), config.geminiApiKey, model, true);
      const issues = parseFactIssues(raw);
      return { corrected: input.bodyPlain, issues, engineUsed: 'gemini-grounding', model: `gemini:${model}`, notes };
    }

    if (engine === 'gpt-claude') {
      const prompt = buildPrompt(input.bodyPlain, input.topic, undefined);
      let raw = '';
      let model: string | undefined;
      if (input.caller) {
        notes.push(`[FactCheck] engine=${input.caller.engine} (selected)`);
        raw = await input.caller.callText(prompt, 2048);
        model = input.caller.engine;
      } else if (config.openaiApiKey) {
        notes.push('[FactCheck] engine=openai:gpt-4.1-mini (fallback chain)');
        raw = await callOpenAiJson(prompt, config.openaiApiKey);
        model = 'openai:gpt-4.1-mini';
      } else if (config.claudeApiKey) {
        notes.push('[FactCheck] engine=claude:claude-haiku-4-5-20251001 (fallback chain)');
        raw = await callClaudeJson(prompt, config.claudeApiKey);
        model = 'claude:claude-haiku-4-5-20251001';
      } else {
        notes.push('GPT/Claude 키 없음 — 건너뜀');
        return passthrough('gpt-claude');
      }
      const issues = parseFactIssues(raw);
      return { corrected: input.bodyPlain, issues, engineUsed: 'gpt-claude', model, notes };
    }

    if (engine === 'crawl') {
      if (rawEvidence.length < MIN_USEFUL_EVIDENCE_CHARS) {
        notes.push('수집 자료가 없어 크롤링 대조를 건너뜀');
        return passthrough('crawl');
      }
      const { issues, model } = await runEvidenceCheck(input, rawEvidence, notes);
      return { corrected: input.bodyPlain, issues, engineUsed: 'crawl', model, notes };
    }

    if (engine === 'naver') {
      const naverEvidence = await collectNaverEvidence(input.keyword || input.topic, notes);
      const combined = `${rawEvidence}\n\n${naverEvidence}`.trim();
      if (combined.length < MIN_USEFUL_EVIDENCE_CHARS) {
        notes.push('네이버 자료도 빈약 — 대조 건너뜀');
        return passthrough('naver');
      }
      const { issues, model } = await runEvidenceCheck(input, combined, notes);
      return { corrected: input.bodyPlain, issues, engineUsed: 'naver', model, notes };
    }

    // auto — cheap-first chain. Expensive engines (grounding) are NEVER auto.
    if (!shouldEscalateEvidence(rawEvidence.length)) {
      const { issues, model } = await runEvidenceCheck(input, rawEvidence, notes);
      return { corrected: input.bodyPlain, issues, engineUsed: 'auto→crawl', model, notes };
    }
    notes.push(`수집 자료 ${rawEvidence.length}자 < ${AUTO_ESCALATE_BELOW_CHARS}자 — 네이버 API로 승격`);
    const naverEvidence = await collectNaverEvidence(input.keyword || input.topic, notes);
    const combined = `${rawEvidence}\n\n${naverEvidence}`.trim();
    if (!shouldEscalateEvidence(combined.length)) {
      const { issues, model } = await runEvidenceCheck(input, combined, notes);
      return { corrected: input.bodyPlain, issues, engineUsed: 'auto→naver', model, notes };
    }
    if (config.perplexityApiKey) {
      notes.push('자료가 여전히 빈약 — Perplexity로 승격 (₩50~150/편)');
      const { factCheckAndRewrite } = await import('./perplexityFactCheck.js');
      const { corrected, result } = await factCheckAndRewrite(input.bodyPlain, input.topic);
      return { corrected, issues: suspiciousToFactIssues(result.suspicious), engineUsed: 'auto→perplexity', notes };
    }
    if (combined.length >= MIN_USEFUL_EVIDENCE_CHARS) {
      notes.push('빈약한 자료로 제한 대조 (Perplexity 키 없음)');
      const { issues, model } = await runEvidenceCheck(input, combined, notes);
      return { corrected: input.bodyPlain, issues, engineUsed: 'auto→crawl(빈약)', model, notes };
    }
    notes.push('대조할 자료가 없어 팩트체크 건너뜀 (그라운딩은 비용상 자동 제외 — 수동 선택 가능)');
    return passthrough('auto→skip');
  } catch (error) {
    notes.push(`팩트체크 실패 (글은 그대로 사용): ${(error as Error).message}`);
    return passthrough(`${engine}(실패)`);
  }
}
