// [2026-09-22 P1] Research Summary — a short, structured brief extracted from the accepted
// source documents by code (no model call), shown to the writer BEFORE the long raw documents:
// numeric facts, dates, official statements, reader questions, conflicts, all tagged with the
// source id so attribution stays traceable. Deterministic and bounded in size.

import type { SourceDocument } from './sourceDocument.js';

export interface ResearchFact {
  sourceId: string;
  sentence: string;
  kind: 'number' | 'date' | 'statement';
}

export interface ResearchConflict {
  metric: string;
  values: Array<{ sourceId: string; value: string; sentence: string }>;
}

export interface ResearchSummary {
  facts: ResearchFact[];
  statements: ResearchFact[];
  dates: ResearchFact[];
  readerQuestions: string[];
  conflicts: ResearchConflict[];
  sourceIds: string[];
  text: string;
}

const NUMBER_RE = /\d[\d,.]*\s*(?:원|만원|만 원|억|억원|%|%p|명|건|개|회|배|평|㎡|kg|km|cm|시간|분|일|개월|년|세|호)/;
const DATE_RE = /(?:20\d{2}년\s*)?\d{1,2}월\s*\d{1,2}일|20\d{2}년\s*\d{1,2}월|20\d{2}[-.]\d{1,2}[-.]\d{1,2}/;
const STATEMENT_RE = /(?:에\s*따르면|밝혔다|발표했다|발표한|공식\s*(?:발표|입장|안내)|관계자는|설명했다|전했다|기준으로)/;
const QUESTION_RE = /(?:일까|나요|을까|ㄹ까|할까|되나|되나요|어떻게|왜|언제|얼마|가능할까|되는지|무엇)/;

const MAX_PER_BUCKET = 12;
const MAX_SENTENCE_CHARS = 140;
const MAX_TEXT_CHARS = 3200;

function splitSentences(text: string): string[] {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s*|(?<=요\.)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 400);
}

function clip(s: string): string {
  return s.length > MAX_SENTENCE_CHARS ? `${s.slice(0, MAX_SENTENCE_CHARS - 1)}…` : s;
}

function dedupe(items: ResearchFact[]): ResearchFact[] {
  const seen = new Set<string>();
  return items.filter((f) => {
    const key = f.sentence.replace(/\s+/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Metric label = the 2~6 Hangul chars right before the first number ("최대 금리 3.1%" → "최대 금리"). */
function metricLabel(sentence: string): string | null {
  const m = sentence.match(/([가-힣]{2,6}(?:\s[가-힣]{1,6})?)\s*(?:은|는|이|가|을|를)?\s*(?:최대|최소|약|연|월)?\s*\d[\d,.]*\s*(?:원|만원|억|%|%p|명|건|회|일|년)/);
  return m ? m[1].trim() : null;
}

function numberToken(sentence: string): string | null {
  const m = sentence.match(/\d[\d,.]*\s*(?:원|만원|억|%|%p|명|건|회|일|년)/);
  return m ? m[0].replace(/\s+/g, '') : null;
}

function findConflicts(facts: ResearchFact[]): ResearchConflict[] {
  const byMetric = new Map<string, Array<{ sourceId: string; value: string; sentence: string }>>();
  for (const f of facts) {
    const label = metricLabel(f.sentence);
    const value = numberToken(f.sentence);
    if (!label || !value) continue;
    const list = byMetric.get(label) ?? [];
    if (!list.some((e) => e.value === value)) list.push({ sourceId: f.sourceId, value, sentence: f.sentence });
    byMetric.set(label, list);
  }
  return [...byMetric.entries()]
    .filter(([, values]) => values.length >= 2 && new Set(values.map((v) => v.sourceId)).size >= 2)
    .slice(0, 5)
    .map(([metric, values]) => ({ metric, values }));
}

export function buildResearchSummary(docs: readonly SourceDocument[], keyword: string): ResearchSummary {
  const accepted = docs.filter((d) => d.relevance?.accepted !== false);
  const facts: ResearchFact[] = [];
  const statements: ResearchFact[] = [];
  const dates: ResearchFact[] = [];
  const questions: string[] = [];

  for (const doc of accepted) {
    const body = doc.cleanedBody ?? doc.body;
    const sentences = splitSentences(body);
    for (const sentence of sentences) {
      const clipped = clip(sentence);
      if (STATEMENT_RE.test(sentence) && statements.length < MAX_PER_BUCKET) {
        statements.push({ sourceId: doc.id, sentence: clipped, kind: 'statement' });
      } else if (DATE_RE.test(sentence) && dates.length < MAX_PER_BUCKET) {
        dates.push({ sourceId: doc.id, sentence: clipped, kind: 'date' });
      } else if (NUMBER_RE.test(sentence) && facts.length < MAX_PER_BUCKET * 2) {
        facts.push({ sourceId: doc.id, sentence: clipped, kind: 'number' });
      }
    }
    const title = String(doc.title || '').trim();
    if (title && QUESTION_RE.test(title) && questions.length < 6 && !questions.includes(title)) questions.push(title);
  }

  const cleanFacts = dedupe(facts);
  const cleanStatements = dedupe(statements);
  const cleanDates = dedupe(dates);
  const conflicts = findConflicts([...cleanFacts, ...cleanStatements, ...cleanDates]);
  const sourceIds = accepted.map((d) => d.id);

  const lines: string[] = [`[리서치 요약 — 코드 추출, 자료 ${accepted.length}건 · 주제: ${keyword}]`];
  lines.push('※ 아래 항목은 자료에서 그대로 뽑은 문장이다. 숫자·날짜·기관명은 이 표기를 유지하고, 항목 끝 (Sxx)는 출처 번호이니 본문에는 옮기지 말고 기관·매체 이름으로 귀속한다.');
  if (cleanFacts.length) {
    lines.push('■ 숫자 사실');
    for (const f of cleanFacts.slice(0, MAX_PER_BUCKET)) lines.push(`- ${f.sentence} (${f.sourceId})`);
  }
  if (cleanDates.length) {
    lines.push('■ 날짜·일정');
    for (const f of cleanDates.slice(0, 8)) lines.push(`- ${f.sentence} (${f.sourceId})`);
  }
  if (cleanStatements.length) {
    lines.push('■ 공식 발표·귀속 문장');
    for (const f of cleanStatements.slice(0, 8)) lines.push(`- ${f.sentence} (${f.sourceId})`);
  }
  if (questions.length) {
    lines.push('■ 독자 질문(자료 제목에서)');
    for (const q of questions) lines.push(`- ${q}`);
  }
  if (conflicts.length) {
    lines.push('■ 자료 간 수치 불일치 — 한쪽을 단정하지 말고 기준·시점 차이를 밝힌다');
    for (const c of conflicts) lines.push(`- ${c.metric}: ${c.values.map((v) => `${v.value}(${v.sourceId})`).join(' vs ')}`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS - 1)}…`;

  return { facts: cleanFacts, statements: cleanStatements, dates: cleanDates, readerQuestions: questions, conflicts, sourceIds, text };
}
