// [2026-09-22 Critique Loop] Issue validation — the Critic's word is not final.
// Blocking issues must point at a real section and a real span (or an H2/H3 anchor for
// MISSING_INFORMATION+ADD), fact issues must cite evidence, style is never Critical, and
// vague "make it better" requests are demoted to advisory so they cannot trigger a revision.

import { createHash } from 'crypto';
import type { ArticleModel, EvidencePack, IssueOperation, IssueSeverity, IssueType, QualityIssue, RawIssue } from './types';
import { evidenceHasConcreteValues, evidenceIdSet } from './evidence';
import { findSection } from './sectionModel';

const FACT_TYPES: ReadonlySet<IssueType> = new Set(['FACT_ERROR', 'CONTRADICTION', 'MIXED_ENTITY', 'UNSUPPORTED_VALUE']);
const CRITICAL_ALLOWED: ReadonlySet<IssueType> = FACT_TYPES;
const KNOWN_TYPES: ReadonlySet<string> = new Set<IssueType>([
  'FACT_ERROR', 'CONTRADICTION', 'MIXED_ENTITY', 'UNSUPPORTED_VALUE', 'MISSING_INFORMATION',
  'TITLE_PROMISE', 'SEARCH_INTENT', 'REDUNDANCY', 'STRUCTURE', 'STYLE', 'PRECHECK',
]);
/** Requests that are taste, not defects — never a reason to revise or block. */
const VAGUE_REQUEST_RE = /더\s*(구체적|자연스럽|흥미롭|다양하|풍부하|매끄럽|세련|자극적|생생하)|SEO\s*(개선|강화)|가독성을?\s*(높|개선)|문체|말투|어미|톤을?\s*(바꾸|조정)/;

export function normalizeSpan(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').replace(/[“”"'‘’]/g, '').trim();
}

export function issueFingerprint(sectionId: string, type: string, claim: string): string {
  const base = `${sectionId}|${type}|${normalizeSpan(claim).slice(0, 160)}`;
  return createHash('sha1').update(base).digest('hex').slice(0, 12);
}

function toSeverity(value: unknown): IssueSeverity {
  const v = String(value || '').toUpperCase();
  return v === 'CRITICAL' || v === 'MAJOR' ? v : 'MINOR';
}

function toType(value: unknown): IssueType {
  const v = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  return (KNOWN_TYPES.has(v) ? v : 'STYLE') as IssueType;
}

function toOperation(value: unknown): IssueOperation {
  const v = String(value || '').toUpperCase();
  return v === 'ADD' || v === 'REMOVE' || v === 'REORDER' ? v : 'REPLACE';
}

function spanExistsIn(text: string, span: string): boolean {
  const s = normalizeSpan(span);
  return s.length >= 4 && normalizeSpan(text).includes(s);
}

function anchorTitle(model: ArticleModel, span: string): string | undefined {
  const s = normalizeSpan(span).replace(/^#{1,6}\s*/, '');
  if (!s) return undefined;
  const hit = model.sections.find((sec) => sec.kind === 'section' && normalizeSpan(sec.title) === s);
  return hit?.title;
}

export interface ValidateOptions {
  readonly origin: QualityIssue['origin'];
  readonly round: number;
}

/**
 * Validate raw issues against the article and evidence. Returns accepted issues (OPEN) and
 * demoted ones (ADVISORY, with a note) — nothing is silently dropped so the run log shows why.
 */
export function validateIssues(
  raw: readonly RawIssue[] | undefined,
  model: ArticleModel,
  evidence: EvidencePack,
  options: ValidateOptions,
): { accepted: QualityIssue[]; demoted: QualityIssue[] } {
  const accepted: QualityIssue[] = [];
  const demoted: QualityIssue[] = [];
  const knownEvidence = evidenceIdSet(evidence);
  const concreteValues = evidenceHasConcreteValues(evidence);
  const seen = new Set<string>();

  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const type = toType(item.type);
    let severity = toSeverity(item.severity);
    const sectionId = String(item.sectionId || '').trim();
    const exactSpan = String(item.exactSpan || '').trim();
    const operation = toOperation(item.operation);
    const evidenceIds = (Array.isArray(item.evidenceIds) ? (item.evidenceIds as unknown[]) : [])
      .map((id: unknown) => String(id || '').trim()).filter((id: string) => id.length > 0 && knownEvidence.has(id));
    const problem = String(item.problem || '').trim();
    const requiredChange = String(item.requiredChange || '').trim();
    const section = findSection(model, sectionId);
    const notes: string[] = [];
    let insertionAnchor: string | undefined;

    if (type === 'STYLE' && severity !== 'MINOR') { severity = 'MINOR'; notes.push('style is never blocking'); }
    // Live 20260922-193310: the Critic typed a fabricated interview quote and a bank list as
    // UNSUPPORTED_VALUE with evidence but labelled them MINOR. A fact-typed issue that is located
    // and evidenced is a fact defect by definition — at least MAJOR — regardless of its label.
    if (severity === 'MINOR' && FACT_TYPES.has(type) && evidenceIds.length > 0 && section && spanExistsIn(section.text, exactSpan)) {
      severity = 'MAJOR'; notes.push('fact-typed issue with evidence promoted from MINOR');
    }
    if (severity === 'CRITICAL' && !CRITICAL_ALLOWED.has(type)) { severity = 'MAJOR'; notes.push(`CRITICAL reserved for fact conflicts (${type} -> MAJOR)`); }
    if (VAGUE_REQUEST_RE.test(`${problem} ${requiredChange}`) && evidenceIds.length === 0 && type !== 'MISSING_INFORMATION') {
      severity = 'MINOR'; notes.push('vague preference request');
    }
    if (severity !== 'MINOR' && !section) { severity = 'MINOR'; notes.push(`unknown sectionId "${sectionId}"`); }
    if (severity !== 'MINOR' && section) {
      if (type === 'MISSING_INFORMATION' && operation === 'ADD') {
        // Item 16: an ADD may anchor to an H2/H3 title instead of a body span.
        insertionAnchor = anchorTitle(model, exactSpan);
        if (!insertionAnchor && !spanExistsIn(section.text, exactSpan)) {
          severity = 'MINOR'; notes.push('exactSpan matches neither body text nor an H2/H3 title');
        }
        if (severity !== 'MINOR' && !concreteValues && evidenceIds.length === 0) {
          severity = 'MINOR'; notes.push('source has no concrete values — cannot demand specifics');
        }
      } else if (type === 'STRUCTURE' && !spanExistsIn(section.text, exactSpan) && normalizeSpan(exactSpan) === normalizeSpan(section.title)) {
        // Structural defects (heading/body mismatch, empty section) are located by the heading itself.
        insertionAnchor = section.title;
      } else if (!spanExistsIn(section.text, exactSpan)) {
        severity = 'MINOR'; notes.push('exactSpan not found in section body');
      }
    }
    if (severity !== 'MINOR' && FACT_TYPES.has(type) && evidenceIds.length === 0) {
      severity = 'MINOR'; notes.push('fact issue without evidenceIds');
    }

    const issueKey = issueFingerprint(sectionId || '?', type, exactSpan || requiredChange || problem);
    if (seen.has(issueKey)) continue;
    seen.add(issueKey);
    const issue: QualityIssue = {
      issueKey, severity, type, sectionId, exactSpan, operation, evidenceIds, problem, requiredChange,
      insertionAnchor, state: severity === 'MINOR' ? 'ADVISORY' : 'OPEN',
      origin: options.origin, round: options.round, note: notes.length > 0 ? notes.join('; ') : undefined,
    };
    (severity === 'MINOR' ? demoted : accepted).push(issue);
  }
  return { accepted, demoted };
}

export function isBlockingSeverity(severity: IssueSeverity): boolean {
  return severity === 'CRITICAL' || severity === 'MAJOR';
}
