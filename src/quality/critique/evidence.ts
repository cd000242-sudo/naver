// [2026-09-22 Critique Loop] Evidence pack for the Critic / Editor / Judge prompts.
// Short by design: accepted source documents (id, publisher, date, excerpt) plus the
// code-extracted research brief (key numbers, dates, reader questions). The Critic must
// never receive the Writer's full prompt or the raw 20K-char material.

import type { SourceDocument } from '../../content/sourceDocument';
import { buildResearchSummary } from '../../content/researchSummary';
import { resolveSourceName } from '../../content/sourceName';
import type { EvidenceItem, EvidencePack } from './types';

const EXCERPT_CHARS = 700;
const MAX_ITEMS = 8;
const MAX_FACTS = 14;
const MAX_QUESTIONS = 8;

function excerptOf(doc: SourceDocument): string {
  return String(doc.cleanedBody || doc.body || '').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS);
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

export function buildEvidencePack(
  docs: readonly SourceDocument[] | undefined,
  keyword: string,
  rawTextFallback: string = '',
): EvidencePack {
  const accepted = selectEvidenceDocuments(docs);
  const items: EvidenceItem[] = accepted.map((d) => ({
    id: d.id,
    title: String(d.title || '').slice(0, 120),
    publisher: publisherOf(d),
    date: d.pubDate || (d.dateStatus === 'UNKNOWN_DATE' ? '날짜 미상' : ''),
    excerpt: excerptOf(d),
  }));
  if (items.length === 0 && rawTextFallback.trim()) {
    items.push({ id: 'S00', title: '수집 자료(문서 구조 없음)', publisher: '', date: '', excerpt: rawTextFallback.replace(/\s+/g, ' ').slice(0, EXCERPT_CHARS * 3) });
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
  return { items, keyFacts, keyDates, readerQuestions, sourceCount: accepted.length };
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
