/**
 * [2026-09-06 R2] Structural check for the stance contract.
 *
 * The body call commits to a top-level `finalVerdict` before writing the sections, and the
 * conclusion is contracted to return to that verdict. This module only checks that both parts
 * exist — whether the conclusion actually returns to the verdict is a semantic question owned by
 * the side-model judge (R3). Lexical overlap was measured and rejected for that job.
 *
 * Warn-only. Never blocks publishing.
 */
export interface VerdictStructureResult {
  readonly finalVerdict: string;
  readonly issues: readonly string[];
}

const VERDICT_PREVIEW_CHARS = 80;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function checkVerdictStructure(
  content: { readonly finalVerdict?: unknown; readonly conclusion?: unknown } | null | undefined,
): VerdictStructureResult {
  const finalVerdict = asTrimmedString(content?.finalVerdict);
  const conclusion = asTrimmedString(content?.conclusion);
  const issues = [
    ...(finalVerdict ? [] : ['finalVerdict 비어 있음 — 모델이 관점 필드를 건너뜀']),
    ...(conclusion ? [] : ['conclusion 비어 있음 — 판단으로 돌아갈 자리가 없음']),
  ];
  return { finalVerdict, issues };
}

export function describeVerdictStructure(result: VerdictStructureResult): string {
  if (result.issues.length > 0) {
    return `[Verdict] ⚠️ ${result.issues.join(' · ')}`;
  }
  const preview = result.finalVerdict.length > VERDICT_PREVIEW_CHARS
    ? `${result.finalVerdict.slice(0, VERDICT_PREVIEW_CHARS)}…`
    : result.finalVerdict;
  return `[Verdict] ✅ 판단 "${preview}"`;
}
