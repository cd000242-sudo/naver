// [2026-09-22 Critique Loop] Final Judge — one question: "is there an obvious problem that
// must stop automatic publishing?" It reads the actual final article (body + FAQ + CTA +
// hashtags with provenance). "Could be better" is never a block; a BLOCK must name a type,
// a section and a span (or a structural location) and a reason.

import { safeParseJson } from '../../jsonParser';
import type { ArticleModel, EvidencePack, JudgeIssue, JudgeResult, QualityRoute } from './types';
import { renderVisibleArticle, findSection } from './sectionModel';
import { describeEvidence, describeKeyFacts } from './evidence';
import { normalizeSpan } from './issueValidator';
import { describeHashtagProvenance, type HashtagProvenance } from './hashtagProvenance';

/** Reasons that describe taste, not a defect — they can never block (item 31). */
const NON_BLOCKING_REASON_RE = /더\s*(자연스럽|흥미롭|다양하|풍부하|매끄럽|세련|자극적|생생하|구체적)|SEO\s*(개선|강화|최적화)|가독성|문체|말투|어미|톤|분량이?\s*(짧|부족)|길이가?\s*(짧|부족)|더\s*길게/;
const STRUCTURAL_TYPES = new Set(['STRUCTURE', 'EMPTY_SECTION', 'TITLE_PROMISE', 'SEARCH_INTENT', 'REDUNDANCY']);

export interface JudgeContext {
  readonly today: string;
  readonly keyword: string;
  readonly contentMode: string;
  readonly searchIntent: string;
  readonly hashtags: readonly HashtagProvenance[];
  readonly precheckHardStops: readonly string[];
}

export function buildJudgePrompt(ctx: JudgeContext, model: ArticleModel, evidence: EvidencePack): string {
  return `너는 발행 게이트다. 질문은 하나다: "자동 발행을 막아야 하는 명백한 문제가 있는가?" 오늘: ${ctx.today}. 키워드: ${ctx.keyword}. 모드: ${ctx.contentMode}.
검색 의도: ${ctx.searchIntent}

## 근거 자료 요약
${describeKeyFacts(evidence) || '(요약 없음)'}

${describeEvidence(evidence).slice(0, 6000)}

## 최종 글 (FAQ·CTA·해시태그 포함, 독자가 보는 그대로)
${renderVisibleArticle(model)}

## 섹션 id (BLOCK 위치 지정용)
${model.sections.map((s) => `[${s.id}] ${s.title}`).join('\n')}

## 해시태그 출처
${describeHashtagProvenance(ctx.hashtags)} — "hashtag" 는 모델이 만든 태그다. 실제 연관검색어로 취급하지 않는다.

## BLOCK 기준 (이것만)
- 자료와 반대되는 사실, 다른 대상/정책/제품/사건 혼합, 현재/과거 뒤바뀜, 자료에 없는 숫자·날짜·기관·조건 단정.
- 제목이 약속한 핵심 질문에 본문이 끝내 답하지 않음.
- 핵심 섹션이 비어 있음, 소제목과 본문 불일치, 같은 핵심 사실이 3개 이상 섹션에서 새 의미 없이 반복.
- 발행 시 사고가 될 문장(실존 인물 단정 비방, 근거 없는 의료·법률 단정).

## BLOCK 이 아닌 것 (advisory 로만 적는다)
"더 자연스럽게/흥미롭게/다양하게/풍부하게", SEO 개선, 문체·어미·분량, 개인 취향. 좋아질 여지는 발행을 막는 이유가 아니다.

blockingIssues 각 항목은 type, sectionId, exactSpan(본문 구절 그대로 — 구조 문제면 소제목), reason 을 모두 채운다.
JSON 으로만 답하라:
{"decision":"PASS|BLOCK","blockingIssues":[{"type":"","sectionId":"","exactSpan":"","reason":""}],"advisory":[""]}`;
}

interface RawJudge { decision?: string; blockingIssues?: Array<Partial<JudgeIssue>>; advisory?: unknown }

/** Validate the Judge's verdict: every BLOCK needs a located, non-taste reason; otherwise it is advisory. */
export function parseJudgeOutput(rawText: string, model: ArticleModel): JudgeResult {
  let parsed: RawJudge | null = null;
  try { parsed = safeParseJson<RawJudge>(rawText); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object') {
    return { decision: 'BLOCK', blockingIssues: [{ type: 'JUDGE_UNPARSEABLE', sectionId: '', exactSpan: '', reason: 'Judge 응답을 해석할 수 없음' }], advisory: [], demoted: [], rawText };
  }
  const advisory = (Array.isArray(parsed.advisory) ? parsed.advisory : []).map((a) => String(a || '').trim()).filter(Boolean);
  const demoted: string[] = [];
  const blocking: JudgeIssue[] = [];
  for (const item of Array.isArray(parsed.blockingIssues) ? parsed.blockingIssues : []) {
    const type = String(item?.type || '').trim().toUpperCase();
    const sectionId = String(item?.sectionId || '').trim();
    const exactSpan = String(item?.exactSpan || '').trim();
    const reason = String(item?.reason || '').trim();
    const section = findSection(model, sectionId);
    const located = !!section && (
      normalizeSpan(section.text).includes(normalizeSpan(exactSpan))
      || normalizeSpan(section.title) === normalizeSpan(exactSpan)
      || (STRUCTURAL_TYPES.has(type) && exactSpan.length > 0)
    );
    if (!reason || NON_BLOCKING_REASON_RE.test(reason)) { demoted.push(`[taste] ${reason || type}`); continue; }
    if (!type || !located) { demoted.push(`[unlocated] ${type} ${sectionId} "${exactSpan.slice(0, 40)}" — ${reason}`); continue; }
    blocking.push({ type, sectionId, exactSpan, reason });
  }
  const decision: JudgeResult['decision'] = blocking.length > 0 ? 'BLOCK' : 'PASS';
  return { decision, blockingIssues: blocking, advisory: [...advisory, ...demoted], demoted, rawText };
}

export async function runFinalJudge(
  route: QualityRoute,
  ctx: JudgeContext,
  model: ArticleModel,
  evidence: EvidencePack,
): Promise<{ result: JudgeResult; prompt: string }> {
  const prompt = buildJudgePrompt(ctx, model, evidence);
  const raw = await route.callModel(prompt, { maxTokens: 1200, timeoutMs: route.subscription ? 240_000 : 60_000 });
  return { result: parseJudgeOutput(raw, model), prompt };
}
