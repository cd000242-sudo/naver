// [2026-09-22 Critique Loop] Over-edit and information-preservation checks. The Editor may
// only change sections that carry an open issue; any other changed section is a violation
// (untouchedPreserved=false). Numbers, dates and organization names present before the
// revision must still be present after it unless a REMOVE issue targeted them.

import type { ArticleModel, PreservationReport, QualityIssue } from './types';
import { normalizeSpan } from './issueValidator';

const NUMBER_TOKEN_RE = /\d[\d,.]*\s*(?:원|만원|만 원|억|억원|%|%p|명|건|개|회|배|평|㎡|kg|km|cm|시간|분|일|개월|년|세|호|만|천)/g;
const DATE_TOKEN_RE = /(?:20\d{2}년\s*)?\d{1,2}월\s*\d{1,2}일|20\d{2}년\s*\d{1,2}월|20\d{2}[-.]\d{1,2}[-.]\d{1,2}/g;
const ORG_TOKEN_RE = /[가-힣A-Za-z]{2,12}(?:부|청|처|위원회|공단|공사|은행|그룹|협회|재단|연구원|대학교|시청|구청|도청|센터)(?=[\s,.·)]|$)/g;

const uniq = (list: readonly string[]): string[] => [...new Set(list.map((s) => s.replace(/\s+/g, '')))];

export function extractTokens(text: string): { numbers: string[]; dates: string[]; orgs: string[] } {
  return {
    numbers: uniq(text.match(NUMBER_TOKEN_RE) || []),
    dates: uniq(text.match(DATE_TOKEN_RE) || []),
    orgs: uniq(text.match(ORG_TOKEN_RE) || []),
  };
}

function sectionText(model: ArticleModel): Map<string, string> {
  return new Map(model.sections.map((s) => [s.id, s.text.trim()]));
}

export function buildPreservationReport(
  before: ArticleModel,
  after: ArticleModel,
  flaggedIssues: readonly QualityIssue[],
): PreservationReport {
  const b = sectionText(before);
  const a = sectionText(after);
  const flagged = new Set(flaggedIssues.map((i) => i.sectionId));
  const changed = [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id));
  const untouchedPreserved = changed.every((id) => flagged.has(id)) && [...b.keys()].every((id) => a.has(id));

  // Tokens that a REMOVE issue explicitly targeted are allowed to disappear.
  const removedSpans = flaggedIssues.filter((i) => i.operation === 'REMOVE').map((i) => normalizeSpan(i.exactSpan).replace(/\s+/g, ''));
  const allowedLoss = (token: string): boolean => removedSpans.some((span) => span.includes(token));
  const beforeAll = [...b.values()].join('\n');
  const afterAll = [...a.values()].join('\n').replace(/\s+/g, '');
  const tb = extractTokens(beforeAll);
  const missing = (list: readonly string[]): string[] => list.filter((t) => !afterAll.includes(t) && !allowedLoss(t));

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

export function preservationViolations(report: PreservationReport): string[] {
  const out: string[] = [];
  if (!report.untouchedPreserved) out.push('편집자가 지목되지 않은 섹션을 바꿨다');
  if (report.lostNumbers.length > 0) out.push(`숫자 유실: ${report.lostNumbers.slice(0, 5).join(', ')}`);
  if (report.lostDates.length > 0) out.push(`날짜 유실: ${report.lostDates.slice(0, 5).join(', ')}`);
  if (report.lostOrganizations.length > 0) out.push(`기관명 유실: ${report.lostOrganizations.slice(0, 5).join(', ')}`);
  return out;
}
