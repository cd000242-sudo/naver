// [2026-09-22 Critique Loop] Issue ledger — one entry per fingerprint, with lifecycle
// OPEN -> PENDING_VERIFICATION -> RESOLVED (or back to OPEN / REGRESSED). The Critic cannot
// re-open a resolved issue by restating it; only Verification moves state. Immutable: every
// mutation returns a new ledger.

import type { IssueState, QualityIssue } from './types';
import { isBlockingSeverity } from './issueValidator';

export interface IssueLedger {
  readonly entries: ReadonlyMap<string, QualityIssue>;
}

export function createLedger(): IssueLedger {
  return { entries: new Map() };
}

function withState(issue: QualityIssue, state: IssueState): QualityIssue {
  return { ...issue, state };
}

/** Merge newly validated issues. Existing keys keep their state; a RESOLVED key reappearing becomes REGRESSED. */
export function addIssues(ledger: IssueLedger, issues: readonly QualityIssue[]): IssueLedger {
  const next = new Map(ledger.entries);
  for (const issue of issues) {
    const existing = next.get(issue.issueKey);
    if (!existing) { next.set(issue.issueKey, issue); continue; }
    if (existing.state === 'RESOLVED' && issue.state === 'OPEN') {
      next.set(issue.issueKey, withState({ ...existing, round: issue.round }, 'REGRESSED'));
    }
  }
  return { entries: next };
}

export function markPending(ledger: IssueLedger, keys: readonly string[]): IssueLedger {
  const next = new Map(ledger.entries);
  for (const key of keys) {
    const e = next.get(key);
    if (e && (e.state === 'OPEN' || e.state === 'REGRESSED')) next.set(key, withState(e, 'PENDING_VERIFICATION'));
  }
  return { entries: next };
}

/** Verification verdict: stillOpen wins over any Editor self-report. Pending keys not mentioned stay OPEN. */
export function applyVerification(
  ledger: IssueLedger,
  resolved: readonly string[],
  stillOpen: readonly string[],
): IssueLedger {
  const next = new Map(ledger.entries);
  const open = new Set(stillOpen);
  for (const [key, e] of next) {
    if (e.state !== 'PENDING_VERIFICATION') continue;
    if (open.has(key)) next.set(key, withState(e, 'OPEN'));
    else if (resolved.includes(key)) next.set(key, withState(e, 'RESOLVED'));
    else next.set(key, withState(e, 'OPEN'));
  }
  return { entries: next };
}

/** Terminal reconciliation: non-integrity issues the Judge (shown them) did not block become advisory. */
export function markAdvisory(ledger: IssueLedger, keys: readonly string[], note: string): IssueLedger {
  const next = new Map(ledger.entries);
  for (const key of keys) {
    const e = next.get(key);
    if (e && (e.state === 'OPEN' || e.state === 'REGRESSED')) next.set(key, { ...e, state: 'ADVISORY', note: e.note ? `${e.note}; ${note}` : note });
  }
  return { entries: next };
}

export function listIssues(ledger: IssueLedger): QualityIssue[] {
  return [...ledger.entries.values()];
}

/** Issues that still require a revision: OPEN or REGRESSED with CRITICAL/MAJOR severity. */
export function blockingIssues(ledger: IssueLedger): QualityIssue[] {
  return listIssues(ledger).filter((e) => (e.state === 'OPEN' || e.state === 'REGRESSED') && isBlockingSeverity(e.severity));
}

export function countBySeverity(issues: readonly QualityIssue[]): { critical: number; major: number; minor: number } {
  return issues.reduce(
    (acc, i) => ({
      critical: acc.critical + (i.severity === 'CRITICAL' ? 1 : 0),
      major: acc.major + (i.severity === 'MAJOR' ? 1 : 0),
      minor: acc.minor + (i.severity === 'MINOR' ? 1 : 0),
    }),
    { critical: 0, major: 0, minor: 0 },
  );
}
