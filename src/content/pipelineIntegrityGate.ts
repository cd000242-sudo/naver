// [2026-09-22 audit P0] Pipeline integrity gate — pass/fail flags computed from what the
// generation run actually did (not from content quality scores). A critical failure means
// the article must not be auto-published; it goes to MANUAL_REVIEW with the reasons listed.
//
// Content-quality gates stay advisory (the owner's rule: "게이트 경고-only"). This gate is
// about the pipeline lying: truncated output, incomplete JSON, silent model override,
// destructive scrubbing, lost sources, or a search that failed but was reported as success.

export type IntegrityFlag =
  | 'SOURCE_PIPELINE_OK'
  | 'SEARCH_STATUS_OK'
  | 'SOURCE_RETENTION_OK'
  | 'FACT_PRESERVATION_OK'
  | 'NO_SILENT_MODEL_OVERRIDE'
  | 'NO_DESTRUCTIVE_SCRUB'
  | 'JSON_COMPLETE'
  | 'OUTPUT_NOT_TRUNCATED';

export type IntegrityVerdict = 'pass' | 'warn' | 'fail';

export interface IntegrityInput {
  readonly sourceBased: boolean;                 // keyword/URL mode with real-time material expected
  readonly searchStatus?: string;                // SEARCH_OK | SEARCH_PARTIAL | SEARCH_EMPTY | SEARCH_RATE_LIMITED | ...
  readonly sourceCount: number;
  readonly sourceRetentionRatio?: number;        // cleanChars / rawChars (0..1)
  readonly factPreservationRate?: number;        // 0..1 from fidelity check, when available
  readonly selectedProvider: string;
  readonly actualModelsUsed: ReadonlyArray<{ stage: string; provider: string; model: string }>;
  readonly qualityTierStages?: ReadonlyArray<string>; // stages that must run on the selected provider
  readonly destructiveScrubApplied: boolean;
  readonly jsonComplete: boolean;
  readonly outputTruncated: boolean;
}

export interface IntegrityResult {
  readonly flags: Record<IntegrityFlag, IntegrityVerdict>;
  readonly criticalFailures: IntegrityFlag[];
  readonly warnings: IntegrityFlag[];
  readonly publishDecision: 'AUTO_PUBLISH_OK' | 'MANUAL_REVIEW';
  readonly reasons: string[];
}

const RETENTION_WARN = 0.7;   // >30% removed → warn
const RETENTION_FAIL = 0.5;   // >50% removed → fail (QUALITY_GATE_WEAK)
const FACT_FAIL = 0.5;

function verdictFor(ok: boolean, warn = false): IntegrityVerdict {
  if (ok) return 'pass';
  return warn ? 'warn' : 'fail';
}

export function evaluatePipelineIntegrity(input: IntegrityInput): IntegrityResult {
  const reasons: string[] = [];
  const flags = {} as Record<IntegrityFlag, IntegrityVerdict>;

  // 1. Search status — only meaningful when the article expects real-time sources.
  const status = String(input.searchStatus || '');
  if (!input.sourceBased) {
    flags.SEARCH_STATUS_OK = 'pass';
  } else if (status === 'SEARCH_OK' || status === 'SEARCH_PARTIAL' || status === '') {
    flags.SEARCH_STATUS_OK = status === 'SEARCH_PARTIAL' ? 'warn' : 'pass';
    if (status === 'SEARCH_PARTIAL') reasons.push('일부 검색 소스가 실패했습니다 (SEARCH_PARTIAL)');
  } else {
    flags.SEARCH_STATUS_OK = 'fail';
    reasons.push(`검색이 성공하지 않았습니다 (${status})`);
  }

  // 2. Source pipeline — a source-based article with zero sources is not publishable automatically.
  if (!input.sourceBased) {
    flags.SOURCE_PIPELINE_OK = 'pass';
  } else if (input.sourceCount > 0) {
    flags.SOURCE_PIPELINE_OK = 'pass';
  } else {
    flags.SOURCE_PIPELINE_OK = 'fail';
    reasons.push('근거 자료가 0건입니다 (SOURCE_PIPELINE)');
  }

  // 3. Retention after cleaning.
  const retention = input.sourceRetentionRatio;
  if (retention === undefined || !input.sourceBased) {
    flags.SOURCE_RETENTION_OK = 'pass';
  } else if (retention >= RETENTION_WARN) {
    flags.SOURCE_RETENTION_OK = 'pass';
  } else if (retention >= RETENTION_FAIL) {
    flags.SOURCE_RETENTION_OK = 'warn';
    reasons.push(`정제 단계에서 자료 ${Math.round((1 - retention) * 100)}%가 제거되었습니다`);
  } else {
    flags.SOURCE_RETENTION_OK = 'fail';
    reasons.push(`정제 단계에서 자료 ${Math.round((1 - retention) * 100)}%가 제거되었습니다 (QUALITY_GATE_WEAK)`);
  }

  // 4. Fact preservation (advisory unless catastrophically low).
  const fact = input.factPreservationRate;
  if (fact === undefined) {
    flags.FACT_PRESERVATION_OK = 'pass';
  } else if (fact >= FACT_FAIL) {
    flags.FACT_PRESERVATION_OK = 'pass';
  } else {
    flags.FACT_PRESERVATION_OK = 'warn';
    reasons.push(`핵심 사실 보존율 ${Math.round(fact * 100)}%`);
  }

  // 5. Silent model override — every quality-tier stage must run on the selected provider.
  const selected = String(input.selectedProvider || '').replace(/^agent-/, '');
  const overrides = input.actualModelsUsed.filter((m) => {
    const isQuality = /\(quality\)$/.test(m.stage) || m.stage === 'body';
    if (!isQuality) return false;
    return String(m.provider || '').replace(/^agent-/, '') !== selected;
  });
  flags.NO_SILENT_MODEL_OVERRIDE = verdictFor(overrides.length === 0);
  if (overrides.length > 0) {
    reasons.push(`선택 엔진(${input.selectedProvider}) 외 모델 개입: ${overrides.map((o) => `${o.stage}=${o.provider}/${o.model}`).join(', ')}`);
  }

  // 6. Destructive scrub / 7. JSON / 8. truncation.
  flags.NO_DESTRUCTIVE_SCRUB = verdictFor(!input.destructiveScrubApplied);
  if (input.destructiveScrubApplied) reasons.push('발행 직전 문장 삭제 스크러버가 적용되었습니다');
  flags.JSON_COMPLETE = verdictFor(input.jsonComplete);
  if (!input.jsonComplete) reasons.push('모델 응답 JSON이 불완전합니다 (PARTIAL_RESPONSE)');
  flags.OUTPUT_NOT_TRUNCATED = verdictFor(!input.outputTruncated);
  if (input.outputTruncated) reasons.push('모델 출력이 토큰 한도에서 잘렸습니다 (OUTPUT_TRUNCATED)');

  const criticalFailures = (Object.keys(flags) as IntegrityFlag[]).filter((f) => flags[f] === 'fail');
  const warnings = (Object.keys(flags) as IntegrityFlag[]).filter((f) => flags[f] === 'warn');
  return {
    flags,
    criticalFailures,
    warnings,
    publishDecision: criticalFailures.length > 0 ? 'MANUAL_REVIEW' : 'AUTO_PUBLISH_OK',
    reasons,
  };
}

/** Compact one-line log for the generation log. */
export function describeIntegrity(result: IntegrityResult): string {
  const parts = (Object.keys(result.flags) as IntegrityFlag[]).map((f) => `${f}=${result.flags[f]}`);
  return `[Integrity] ${result.publishDecision} · ${parts.join(' ')}${result.reasons.length ? ` · ${result.reasons.join(' | ')}` : ''}`;
}
