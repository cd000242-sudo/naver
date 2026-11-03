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

/*
 * Release C2 (2026-11-04) — harmony repair policy.
 *
 * Owner log 2026-11-03 (agent-claude homefeed [글 생성], ~18 CLI calls of 160–215 s): the session's article was followed
 * by outer LLM loops that re-read the same material. The harmony session (C1) already asks the agent to compare titles,
 * self-critique with the app's criteria and report conflicts inside the same call, so while it is active those outer
 * loops are warn-only: the deterministic issue stays visible (log line, and the quality warning wherever today's code
 * already writes one), but no second CLI round trip is paid for it.
 *
 * Fact-type regeneration is NOT part of that list: a draft that ignored the material (Faithfulness overlap), a URL-mode
 * source-retention / hallucination miss, the defamation / issue-discipline corrections and the JSON completeness retry
 * run exactly as before — the session self-check cannot prove a fact. The list below is an allow-list of skips: an unknown
 * kind always runs.
 */
export type HarmonyRepairKind =
  | 'intro-patch'
  | 'quote-insertion-patch'
  | 'prompt-adherence-regenerate'
  | 'quality-gate-regenerate'
  | 'quality-gate-patch'
  | 'title-answer-regenerate'
  | 'distinctness-regenerate'
  | 'json-completeness-retry'
  | 'faithfulness-regenerate'
  | 'source-fidelity-regenerate'
  | 'defamation-correction'
  | 'issue-discipline-correction';

export type HarmonyRepairDecision = 'run' | 'warn-only';

/** Outer repairs the harmony session replaces. Label = the stage name written in the skip log. */
const WARN_ONLY_LABELS: Readonly<Partial<Record<HarmonyRepairKind, string>>> = Object.freeze({
  'intro-patch': '도입부 보정',
  'quote-insertion-patch': '인용 삽입 보정',
  'prompt-adherence-regenerate': '사용자 프롬프트 준수 재생성',
  'quality-gate-regenerate': '품질 게이트 재생성',
  'quality-gate-patch': '품질 게이트 보정(selfCritique)',
  'title-answer-regenerate': '제목 약속 재생성',
  'distinctness-regenerate': '섹션 변별 재생성',
});

export const HARMONY_WARN_ONLY_REPAIR_KINDS: readonly HarmonyRepairKind[] = Object.freeze(Object.keys(WARN_ONLY_LABELS) as HarmonyRepairKind[]);

/** Fact-type regenerations, JSON completeness and correction calls: never skipped, listed so the contract is explicit. */
export const HARMONY_KEPT_REPAIR_KINDS: readonly HarmonyRepairKind[] = Object.freeze([
  'json-completeness-retry',
  'faithfulness-regenerate',
  'source-fidelity-regenerate',
  'defamation-correction',
  'issue-discipline-correction',
]);

export interface HarmonyRepairContext {
  /** True only for a live harmony session (flag ON + agent-claude/agent-codex + homefeed + legacy prompt). */
  readonly harmonyActive?: boolean;
}

/** 'warn-only' only for a listed kind under an active harmony session; everything else (including a missing context) runs. */
export function harmonyRepairDecision(kind: HarmonyRepairKind, context?: HarmonyRepairContext): HarmonyRepairDecision {
  return context?.harmonyActive === true && Object.prototype.hasOwnProperty.call(WARN_ONLY_LABELS, kind) ? 'warn-only' : 'run';
}

/** `[AgentHarmony] <단계> 생략 — 조화 세션이 같은 기준으로 자기점검: <이슈>` (the issue part is omitted when blank). */
export function harmonyRepairSkipLog(kind: HarmonyRepairKind, detail?: string): string {
  const label = WARN_ONLY_LABELS[kind] ?? kind;
  const issue = typeof detail === 'string' ? detail.trim() : '';
  return `[AgentHarmony] ${label} 생략 — 조화 세션이 같은 기준으로 자기점검${issue ? `: ${issue}` : ''}`;
}

export interface HarmonyRepairGate {
  /**
   * True (and one log line per kind per gate) when the harmony session replaces this outer repair. Always false with
   * the session off, and the lazy `detail` is then never evaluated — the flag-OFF path does no extra work.
   */
  readonly skips: (kind: HarmonyRepairKind, detail?: string | (() => string)) => boolean;
}

/** One line per attempt when harmony was requested but the response carried no usable packet: every repair then runs as today. */
export const HARMONY_NO_PACKET_LOG = '[AgentHarmony] 패킷 없음 — 바깥 보정을 평소대로 실행합니다';

/**
 * `harmonyActive` may be a function: it is then evaluated at every skip decision, so the caller can say "the session counts
 * only once this attempt's response carried a packet" (a retry whose response has none runs its repairs). A throwing or
 * non-boolean check means "not live".
 */
export function createHarmonyRepairGate(harmonyActive: boolean | (() => boolean), log: (line: string) => void = (line) => console.log(line)): HarmonyRepairGate {
  const announced = new Set<HarmonyRepairKind>();
  const isActive = (): boolean => {
    if (typeof harmonyActive !== 'function') return harmonyActive === true;
    try { return harmonyActive() === true; } catch { return false; }
  };
  const skips = (kind: HarmonyRepairKind, detail?: string | (() => string)): boolean => {
    if (harmonyRepairDecision(kind, { harmonyActive: isActive() }) === 'run') return false;
    if (!announced.has(kind)) {
      announced.add(kind);
      let issue: string | undefined;
      try { issue = typeof detail === 'function' ? detail() : detail; } catch { issue = undefined; }
      log(harmonyRepairSkipLog(kind, issue));
    }
    return true;
  };
  return { skips };
}

/**
 * [TitleSelect] `preservePromise` for the harmony session (the caller ORs it with the shopping rule, `mode === 'affiliate'`).
 * Only an echo of the keyword or a length-contract problem may replace the title: the session compared the candidates
 * against the material and the body is written to pay off the title it chose, so a score-only swap would cut the promise.
 */
export function harmonyPreservesTitlePromise(harmonyActive?: boolean): boolean {
  return harmonyActive === true;
}
