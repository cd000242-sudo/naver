// [2026-09-22 Critique Loop] Over-edit and information-preservation checks. The Editor may
// only change sections that carry an open issue; any other changed section is a violation
// (untouchedPreserved=false). Numbers, dates and organization names present before the
// revision must still be present after it unless a REMOVE issue targeted them.

import type { ArticleModel, PreservationReport, QualityIssue } from './types';
import { normalizeSpan } from './issueValidator';
import { normalizeDates, normalizeNumbers } from './claimNormalize';

const ORG_TOKEN_RE = /[가-힣A-Za-z]{2,12}(?:부|청|처|위원회|공단|공사|은행|그룹|협회|재단|연구원|대학교|시청|구청|도청|센터)(?=[\s,.·)]|$)/g;

const uniq = (list: readonly string[]): string[] => [...new Set(list.map((s) => s.replace(/\s+/g, '')))];

/** Canonical tokens (claimNormalize): "15,000원"/"1만5000원" -> "15000원", "10월 16~22일" -> 10월16일·10월22일. */
export function extractTokens(text: string): { numbers: string[]; dates: string[]; orgs: string[] } {
  return {
    numbers: normalizeNumbers(text),
    dates: normalizeDates(text),
    orgs: uniq(text.match(ORG_TOKEN_RE) || []),
  };
}

/** Membership test on canonical tokens (a haystack must be tokenised the same way as the needle). */
function tokenSet(text: string): Set<string> {
  const t = extractTokens(text);
  return new Set([...t.numbers, ...t.dates, ...t.orgs]);
}

function sectionText(model: ArticleModel): Map<string, string> {
  return new Map(model.sections.map((s) => [s.id, s.text.trim()]));
}

export function buildPreservationReport(
  before: ArticleModel,
  after: ArticleModel,
  flaggedIssues: readonly QualityIssue[],
  evidenceCorpus: string = '',
): PreservationReport {
  const b = sectionText(before);
  const a = sectionText(after);
  const flagged = new Set(flaggedIssues.map((i) => i.sectionId));
  const changed = [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id));
  const untouchedPreserved = changed.every((id) => flagged.has(id)) && [...b.keys()].every((id) => a.has(id));

  // Only VALID values are protected. A token may disappear when it sits inside a flagged span
  // (the Critic asked for that span to change — live run 20260922-191510: unsupported 4.5%/6.0%
  // inside a REPLACE span were wrongly "preserved") or when the evidence never carried it
  // (an unsupported value has nothing valid to preserve).
  const flaggedTokens = new Set(flaggedIssues.flatMap((i) => [...tokenSet(normalizeSpan(i.exactSpan))]));
  const corpusTokens = tokenSet(evidenceCorpus);
  const corpusCompact = evidenceCorpus.replace(/\s+/g, '');
  const supported = (token: string): boolean => corpusTokens.has(token) || corpusCompact.includes(token);
  const allowedLoss = (token: string): boolean =>
    flaggedTokens.has(token) || (corpusCompact.length > 0 && !supported(token));
  const beforeAll = [...b.values()].join('\n');
  const afterTokens = tokenSet([...a.values()].join('\n'));
  const tb = extractTokens(beforeAll);
  const missing = (list: readonly string[]): string[] => list.filter((t) => !afterTokens.has(t) && !allowedLoss(t));

  return {
    unchangedSections: b.size - changed.length,
    revisedSections: changed.length,
    flaggedSections: [...flagged],
    untouchedPreserved,
    lostNumbers: missing(tb.numbers),
    lostDates: missing(tb.dates),
    lostOrganizations: missing(tb.orgs),
  };
}

/**
 * Number/date tokens that a resolved fact issue removed from the article. A later edit
 * (round-2 revision, editorial fix) must not bring them back — live 20260922-195843: the
 * editorial critic asked for "10월 18일" to be restored to match the title after it had been
 * removed as unsupported.
 */
export function removedFactTokens(issues: readonly QualityIssue[], after: ArticleModel): string[] {
  const afterTokens = tokenSet(after.sections.map((s) => s.text).join('\n'));
  const tokens = issues
    .filter((i) => i.state === 'RESOLVED' && FACT_ISSUE_TYPES.has(i.type))
    .flatMap((i) => { const t = extractTokens(i.exactSpan); return [...t.numbers, ...t.dates]; });
  return [...new Set(tokens)].filter((t) => !afterTokens.has(t));
}

export function reintroducedTokens(removed: readonly string[], candidate: ArticleModel): string[] {
  const all = tokenSet(candidate.sections.map((s) => s.text).join('\n'));
  return removed.filter((t) => all.has(t));
}

const FACT_ISSUE_TYPES: ReadonlySet<string> = new Set(['UNSUPPORTED_VALUE', 'UNSUPPORTED_QUOTE', 'UNSUPPORTED_ENTITY', 'FACT_ERROR', 'CONTRADICTION', 'MIXED_ENTITY']);

export function preservationViolations(report: PreservationReport): string[] {
  const out: string[] = [];
  if (!report.untouchedPreserved) out.push('편집자가 지목되지 않은 섹션을 바꿨다');
  if (report.lostNumbers.length > 0) out.push(`숫자 유실: ${report.lostNumbers.slice(0, 5).join(', ')}`);
  if (report.lostDates.length > 0) out.push(`날짜 유실: ${report.lostDates.slice(0, 5).join(', ')}`);
  if (report.lostOrganizations.length > 0) out.push(`기관명 유실: ${report.lostOrganizations.slice(0, 5).join(', ')}`);
  return out;
}
