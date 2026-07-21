/**
 * factCheckRouter.ts — post-draft fact-check engine selector + auto fallback.
 *
 * User contract (2026-07-21): the fact-check step is user-selectable via a
 * dropdown, ordered by cost. "auto" starts from the cheapest evidence
 * (already-crawled material) and escalates ONLY through cheap tiers
 * (crawl → naver → perplexity-if-key). Expensive engines (Gemini grounding)
 * never run unless explicitly selected. Every failure degrades to the
 * original body with a warning — fact-check must never block publishing.
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

export interface FactCheckRouterInput {
  bodyPlain: string;
  topic?: string;
  keyword?: string;
  /** Already-collected source material (crawl/RAG rawText). */
  rawText?: string;
  config?: Record<string, unknown> | null;
}

export interface FactCheckRouterOutcome {
  corrected: string;
  suspicious: SuspiciousItem[];
  /** Engine that actually produced the verdict (auto resolves to a concrete one). */
  engineUsed: string;
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

function buildPrompt(bodyPlain: string, topic: string | undefined, evidence: string | undefined): string {
  const topicHint = topic ? `주제: "${topic}"\n\n` : '';
  const evidenceBlock = evidence
    ? `=== 확인된 수집 자료 (이 자료만 근거로 판단) ===\n${evidence.slice(0, 8000)}\n=== 자료 끝 ===\n\n아래 글에서 위 자료와 **명백히 모순되는 문장**만 찾아 자료 기준으로 고쳐주세요. 자료에 없는 내용이라는 이유만으로는 고치지 마세요.\n`
    : '다음 블로그 글에서 **명백한 사실 오류가 확실한 문장**(통계·연도·인물·제품명·법령·수치)만 보수적으로 골라주세요. 확신이 없으면 포함하지 마세요.\n';
  return `${topicHint}${evidenceBlock}
각 문장에 대해:
1. original: 원문 인용 (글에 있는 그대로)
2. replacement: 사실 기반 수정 문장 (원문과 톤·길이 비슷하게)
3. reason: 짧은 이유

응답은 반드시 JSON만 (마크다운 금지):
{"suspicious": [{"original": "...", "replacement": "...", "reason": "..."}]}
의심 문장이 없으면 {"suspicious": []}

=== 글 본문 ===
${bodyPlain}
=== 끝 ===`;
}

export function parseSuspicious(rawResponse: string): SuspiciousItem[] {
  try {
    const cleaned = String(rawResponse || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return [];
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as { suspicious?: unknown };
    if (!Array.isArray(parsed?.suspicious)) return [];
    return (parsed.suspicious as SuspiciousItem[]).filter(
      (s) => s && typeof s.original === 'string' && typeof s.replacement === 'string' && s.original.length > 5,
    );
  } catch {
    return [];
  }
}

export function applyCorrections(bodyPlain: string, suspicious: SuspiciousItem[]): string {
  let corrected = bodyPlain;
  for (const item of suspicious) {
    if (corrected.includes(item.original)) {
      corrected = corrected.replace(item.original, item.replacement);
    }
  }
  return corrected;
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

/** Evidence-based check with the cheapest configured LLM (openai → gemini → claude). */
async function runEvidenceCheck(
  input: FactCheckRouterInput,
  evidence: string,
  notes: string[],
): Promise<SuspiciousItem[]> {
  const config = (input.config || {}) as Record<string, string | undefined>;
  const prompt = buildPrompt(input.bodyPlain, input.topic, evidence);
  if (config.openaiApiKey) return parseSuspicious(await callOpenAiJson(prompt, config.openaiApiKey));
  if (config.geminiApiKey) {
    return parseSuspicious(await callGeminiJson(prompt, config.geminiApiKey, config.geminiModel || 'gemini-3.1-flash-lite', false));
  }
  if (config.claudeApiKey) return parseSuspicious(await callClaudeJson(prompt, config.claudeApiKey));
  notes.push('사용 가능한 LLM 키가 없어 자료 대조를 건너뜀');
  return [];
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

/**
 * Run the selected fact-check engine. Never throws — failures return the
 * original body with notes (fact-check must not kill publishing).
 */
export async function runFactCheck(
  engine: FactCheckEngine,
  input: FactCheckRouterInput,
): Promise<FactCheckRouterOutcome> {
  const notes: string[] = [];
  const passthrough = (engineUsed: string): FactCheckRouterOutcome => ({
    corrected: input.bodyPlain, suspicious: [], engineUsed, notes,
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
      return { corrected, suspicious: result.suspicious, engineUsed: 'perplexity', notes };
    }

    if (engine === 'gemini-grounding') {
      if (!config.geminiApiKey) {
        notes.push('Gemini API 키 없음 — 그라운딩 팩트체크 건너뜀');
        return passthrough('gemini-grounding');
      }
      const raw = await callGeminiJson(
        buildPrompt(input.bodyPlain, input.topic, undefined),
        config.geminiApiKey,
        config.geminiModel || 'gemini-3.1-flash-lite',
        true,
      );
      const suspicious = parseSuspicious(raw);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'gemini-grounding', notes };
    }

    if (engine === 'gpt-claude') {
      const prompt = buildPrompt(input.bodyPlain, input.topic, undefined);
      let raw = '';
      if (config.openaiApiKey) raw = await callOpenAiJson(prompt, config.openaiApiKey);
      else if (config.claudeApiKey) raw = await callClaudeJson(prompt, config.claudeApiKey);
      else {
        notes.push('GPT/Claude 키 없음 — 건너뜀');
        return passthrough('gpt-claude');
      }
      const suspicious = parseSuspicious(raw);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'gpt-claude', notes };
    }

    if (engine === 'crawl') {
      if (rawEvidence.length < MIN_USEFUL_EVIDENCE_CHARS) {
        notes.push('수집 자료가 없어 크롤링 대조를 건너뜀');
        return passthrough('crawl');
      }
      const suspicious = await runEvidenceCheck(input, rawEvidence, notes);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'crawl', notes };
    }

    if (engine === 'naver') {
      const naverEvidence = await collectNaverEvidence(input.keyword || input.topic, notes);
      const combined = `${rawEvidence}\n\n${naverEvidence}`.trim();
      if (combined.length < MIN_USEFUL_EVIDENCE_CHARS) {
        notes.push('네이버 자료도 빈약 — 대조 건너뜀');
        return passthrough('naver');
      }
      const suspicious = await runEvidenceCheck(input, combined, notes);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'naver', notes };
    }

    // auto — cheap-first chain. Expensive engines (grounding) are NEVER auto.
    if (!shouldEscalateEvidence(rawEvidence.length)) {
      const suspicious = await runEvidenceCheck(input, rawEvidence, notes);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'auto→crawl', notes };
    }
    notes.push(`수집 자료 ${rawEvidence.length}자 < ${AUTO_ESCALATE_BELOW_CHARS}자 — 네이버 API로 승격`);
    const naverEvidence = await collectNaverEvidence(input.keyword || input.topic, notes);
    const combined = `${rawEvidence}\n\n${naverEvidence}`.trim();
    if (!shouldEscalateEvidence(combined.length)) {
      const suspicious = await runEvidenceCheck(input, combined, notes);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'auto→naver', notes };
    }
    if (config.perplexityApiKey) {
      notes.push('자료가 여전히 빈약 — Perplexity로 승격 (₩50~150/편)');
      const { factCheckAndRewrite } = await import('./perplexityFactCheck.js');
      const { corrected, result } = await factCheckAndRewrite(input.bodyPlain, input.topic);
      return { corrected, suspicious: result.suspicious, engineUsed: 'auto→perplexity', notes };
    }
    if (combined.length >= MIN_USEFUL_EVIDENCE_CHARS) {
      notes.push('빈약한 자료로 제한 대조 (Perplexity 키 없음)');
      const suspicious = await runEvidenceCheck(input, combined, notes);
      return { corrected: applyCorrections(input.bodyPlain, suspicious), suspicious, engineUsed: 'auto→crawl(빈약)', notes };
    }
    notes.push('대조할 자료가 없어 팩트체크 건너뜀 (그라운딩은 비용상 자동 제외 — 수동 선택 가능)');
    return passthrough('auto→skip');
  } catch (error) {
    notes.push(`팩트체크 실패 (글은 그대로 사용): ${(error as Error).message}`);
    return passthrough(`${engine}(실패)`);
  }
}
