// [2026-09-23 Quality Fix 1] Two issue layers for terminal reconciliation.
//   INTEGRITY BLOCKER — a wrong/unsupported fact, mixed entity, contradiction, wrong current
//     state, or a decisive structural hole (empty section). Never overridden by a Judge PASS.
//   EDITORIAL / INTENT — title promise, search intent, redundancy, answer position, weak
//     missing information, homefeed flow. May become terminal advisory when the Judge, shown
//     the remaining OPEN list and the final article, still says PASS.

import type { QualityIssue } from './types';

const INTEGRITY_TYPES: ReadonlySet<string> = new Set([
  'UNSUPPORTED_VALUE', 'UNSUPPORTED_QUOTE', 'UNSUPPORTED_ENTITY',
  'FACT_ERROR', 'CONTRADICTION', 'MIXED_ENTITY', 'WRONG_CURRENT_STATE',
]);

export function isIntegrityIssue(issue: Pick<QualityIssue, 'type' | 'origin' | 'problem'>): boolean {
  if (INTEGRITY_TYPES.has(issue.type)) return true;
  // Empty section detected by the deterministic precheck is a decisive structural error.
  if (issue.type === 'STRUCTURE' && issue.origin === 'precheck' && /비어 있|미만/.test(issue.problem)) return true;
  return false;
}

export function splitByLayer(issues: readonly QualityIssue[]): { integrity: QualityIssue[]; editorial: QualityIssue[] } {
  return issues.reduce(
    (acc, i) => (isIntegrityIssue(i) ? { ...acc, integrity: [...acc.integrity, i] } : { ...acc, editorial: [...acc.editorial, i] }),
    { integrity: [] as QualityIssue[], editorial: [] as QualityIssue[] },
  );
}

export function describeOpenIssue(issue: QualityIssue): string {
  return `- [${issue.sectionId}] ${issue.severity}/${issue.type}: ${issue.problem.slice(0, 120)} (구절: "${issue.exactSpan.slice(0, 60)}")`;
}
