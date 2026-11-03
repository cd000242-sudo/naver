/**
 * Duplicate agent-call policy for LLM title patches (Release B Phase 1, 2026-11-04).
 *
 * Owner log 2026-11-03 (agent-claude homefeed [글 생성], ~18 CLI calls): the TitleGate LLM rewrite ran
 * 37 s and 66 s and was rejected both times. The 66 s one ran on the regeneration whose title was LOCKED
 * (manualTitleOverride) — finalizeStructuredContent -> applyManualTitleOverride threw the result away,
 * for every engine. This module is the single place that says whether a title-only LLM call is worth making.
 *
 * Rules (pure — no I/O, no engine access):
 *   1. A confirmed title (keyword used verbatim, or the locked / manual title) never gets an LLM patch,
 *      on any engine: the result would be overwritten anyway.
 *   2. Agent engines skip the homefeed TitleGate rewrite and the SEO TitlePatch rewrite: the session already
 *      chose the title in the same call, and a rewrite is another 30–70 s CLI round trip. The deterministic
 *      gate issues are still computed and logged by the caller.
 *   3. API engines without a confirmed title, and the shopping (affiliate) patch on agent engines, are unchanged.
 */

export type LlmTitlePatchSkipReason = 'confirmed-title' | 'agent-engine';

export interface LlmTitlePatchContext {
  /** True when the text engine is an agent CLI provider (isAgentTextProvider). */
  readonly isAgent: boolean;
  /** The title that is already fixed for this run (keyword-as-title value or manualTitleOverride), if any. */
  readonly confirmedTitle?: string | null;
  /** The patch family: 'seo' (also 'mate'), 'homefeed' or 'affiliate'. Unknown or missing = never skipped for the engine alone. */
  readonly mode?: string;
}

/** Modes whose LLM rewrite is redundant on an agent engine. Everything else keeps its current behaviour. */
const AGENT_SKIPPED_MODES: ReadonlySet<string> = new Set(['seo', 'mate', 'homefeed']);

const REASON_TEXT: Readonly<Record<LlmTitlePatchSkipReason, string>> = Object.freeze({
  'confirmed-title': '확정 제목',
  'agent-engine': '에이전트 엔진(세션 안에서 제목을 정함)',
});

/** Why the LLM title patch should not run, or null when it may run. A confirmed title outranks the engine reason. */
export function llmTitlePatchSkipReason(context: LlmTitlePatchContext): LlmTitlePatchSkipReason | null {
  if (typeof context.confirmedTitle === 'string' && context.confirmedTitle.trim()) return 'confirmed-title';
  if (context.isAgent && AGENT_SKIPPED_MODES.has(String(context.mode ?? ''))) return 'agent-engine';
  return null;
}

export function shouldRunLlmTitlePatch(context: LlmTitlePatchContext): boolean {
  return llmTitlePatchSkipReason(context) === null;
}

/** One log line for a skipped rewrite; `detail` carries the deterministic gate issues so they stay visible. */
export function llmTitlePatchSkipLog(tag: string, context: LlmTitlePatchContext, detail?: string): string {
  const reason = llmTitlePatchSkipReason(context);
  const why = reason ? REASON_TEXT[reason] : '정책';
  return `[${tag}] LLM 재작성 생략 — ${why}${detail ? `: ${detail}` : ''}`;
}
