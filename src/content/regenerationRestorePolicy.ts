/**
 * [2026-11-04] When a repair rewrite (e.g. TitleAnswer) makes the article worse, return the draft kept before it.
 *
 * Owner full-auto log: attempt 1 passed QualityGate90 (96/100, safety 100); a TitleAnswer false positive asked for a full
 * rewrite; attempt 2 came back 67/100 with safety 35 (an unsourced "10분") and was published via "경고 후 계속", although
 * the passing draft had been kept. The kept draft used to be restored only when the rewrite threw.
 *
 * The verdicts are never edited: the restored draft carries its own quality record (recoverLastSuccessfulArtifact).
 */
export interface KeptDraftState {
  /** The kept draft had passed the 90-point publication gate when it was kept. */
  readonly passedGate?: boolean;
}

/** Restore only when the kept draft passed the gate and the rewrite misses it. */
export function shouldRestoreKeptDraft(kept: KeptDraftState | null | undefined, rewriteMissesGate: boolean): boolean {
  return Boolean(kept?.passedGate) && rewriteMissesGate === true;
}
