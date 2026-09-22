// [2026-09-22 Critique Loop] Evidence pack for the Critic / Editor / Judge prompts.
//
// [2026-09-23 Quality Fix 1] The pack used to hold a 700-char excerpt per document. Replaying
// the 7 live runs showed 33 of 34 fact issues the Critic/Judge raised pointed at values that
// WERE in the material the Writer saw (e.g. "특별기획전은 10월 18일까지" sat at char 2,900 of
// its article). The reviewers must see the same cleaned material as the Writer: full cleaned
// bodies under the same per-article/total caps as sourceAssembler, plus the blueprint/raw
// material in the corpus used by every deterministic check.

import type { SourceDocument } from '../../content/sourceDocument';
import { buildResearchSummary } from '../../content/researchSummary';
import { resolveSourceName } from '../../content/sourceName';
import type { EvidenceItem, EvidencePack } from './types';

/** What the Writer material actually holds: news API bodies reach ~7.5K, the whole B block ~21K. */
export const EVIDENCE_PER_DOC_CHARS = 8000;
export const EVIDENCE_TOTAL_CHARS = 24000;
const MAX_ITEMS = 8;
const MAX_FACTS = 14;
const MAX_QUESTIONS = 8;

function bodyOf(doc: SourceDocument): string {
  return String(doc.cleanedBody || doc.body || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

function publisherOf(doc: SourceDocument): string {
  if (doc.sourceName) return String(doc.sourceName);
  try {
    const resolved = resolveSourceName({ url: doc.url, title: doc.title, sourceType: doc.sourceType });
    return resolved.sourceName || resolved.domain || doc.domain || '';
  } catch {
    return doc.domain || '';
  }
}

/** Accepted (or un-ranked legacy) documents only — rejected material must not become evidence. */
export function selectEvidenceDocuments(docs: readonly SourceDocument[] | undefined): SourceDocument[] {
  return (Array.isArray(docs) ? docs : [])
    .filter((d) => d && typeof d.body === 'string' && d.body.trim().length > 0)
    .filter((d) => d.relevance?.accepted !== false)
    .slice(0, MAX_ITEMS);
}

export interface BuildEvidenceOptions {
  /** Material the Writer saw that is not a structured document (blueprint material, raw text). */
  readonly extraMaterial?: string;
}

export function buildEvidencePack(
  docs: readonly SourceDocument[] | undefined,
  keyword: string,
  rawTextFallback: string = '',
  options: BuildEvidenceOptions = {},
): EvidencePack {
  const accepted = selectEvidenceDocuments(docs);
  let budget = EVIDENCE_TOTAL_CHARS;
  const items: EvidenceItem[] = accepted.map((d) => {
    const body = bodyOf(d).slice(0, Math.max(0, Math.min(EVIDENCE_PER_DOC_CHARS, budget)));
    budget -= body.length;
    return {
      id: d.id,
      title: String(d.title || '').slice(0, 120),
      publisher: publisherOf(d),
      date: d.pubDate || (d.dateStatus === 'UNKNOWN_DATE' ? '날짜 미상' : ''),
      excerpt: body,
    };
  });
  if (items.length === 0 && rawTextFallback.trim()) {
    items.push({ id: 'S00', title: '수집 자료(문서 구조 없음)', publisher: '', date: '', excerpt: rawTextFallback.replace(/[ \t]+/g, ' ').slice(0, EVIDENCE_TOTAL_CHARS) });
  }
  let keyFacts: string[] = [];
  let keyDates: string[] = [];
  let readerQuestions: string[] = [];
  try {
    const summary = buildResearchSummary(accepted, keyword);
    keyFacts = summary.facts.slice(0, MAX_FACTS).map((f) => `[${f.sourceId}] ${f.sentence}`);
    keyDates = summary.dates.slice(0, MAX_FACTS).map((f) => `[${f.sourceId}] ${f.sentence}`);
    readerQuestions = summary.readerQuestions.slice(0, MAX_QUESTIONS);
  } catch { /* research brief is optional */ }
  const extraMaterial = String(options.extraMaterial || '').trim();
  return { items, keyFacts, keyDates, readerQuestions, sourceCount: accepted.length, extraMaterial };
}

/** Prompt block listing the evidence. `ids` restricts to the documents an issue cites. */
export function describeEvidence(pack: EvidencePack, ids?: readonly string[]): string {
  const wanted = ids && ids.length > 0 ? new Set(ids) : null;
  const items = pack.items.filter((it) => !wanted || wanted.has(it.id));
  const lines = items.map((it) => `[${it.id}] ${it.publisher ? `${it.publisher} · ` : ''}${it.date || '날짜 미상'} · ${it.title}\n${it.excerpt}`);
  return lines.join('\n\n');
}

export function describeKeyFacts(pack: EvidencePack): string {
  const parts: string[] = [];
  if (pack.keyFacts.length > 0) parts.push(`핵심 숫자·조건:\n${pack.keyFacts.map((f) => `- ${f}`).join('\n')}`);
  if (pack.keyDates.length > 0) parts.push(`핵심 날짜·일정:\n${pack.keyDates.map((f) => `- ${f}`).join('\n')}`);
  if (pack.readerQuestions.length > 0) parts.push(`자료에 보이는 독자 질문:\n${pack.readerQuestions.map((q) => `- ${q}`).join('\n')}`);
  return parts.join('\n\n');
}

/** True when the evidence carries concrete values (기간/금액/수량/비율/조건/일정) the article could cite. */
export function evidenceHasConcreteValues(pack: EvidencePack): boolean {
  return pack.keyFacts.length > 0 || pack.keyDates.length > 0;
}

export function evidenceIdSet(pack: EvidencePack): Set<string> {
  return new Set(pack.items.map((it) => it.id));
}

/**
 * Everything the Writer could legitimately cite: full document bodies, the research brief and
 * the blueprint/raw material. Every deterministic check (preservation, propagation, scanner)
 * measures "supported" against this — never against a prompt excerpt.
 */
export function evidenceCorpus(pack: EvidencePack): string {
  return [
    ...pack.items.map((it) => `${it.title} ${it.excerpt}`),
    ...pack.keyFacts,
    ...pack.keyDates,
    pack.extraMaterial || '',
  ].join(' ');
}
