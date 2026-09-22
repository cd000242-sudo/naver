// [2026-09-22 Critique Loop] Observational quality metrics (item 48). Recorded per article,
// never used as a hard gate — they exist to compare runs, not to block them.

import type { ArticleModel, EvidencePack, QualityMetrics } from './types';
import { extractTokens } from './preservation';

const VAGUE_RE = /도움이\s*되(?:길|셨|었으면|실)|참고(?:하시|해\s*보시)|상황에\s*따라\s*다르|다양한\s*방법|여러\s*가지|경우에\s*따라|알아두시면|꼼꼼히\s*확인|잘\s*따져|신중하게|개인차가/;
const ACTION_RE = /신청|접수|확인(?:하세요|할\s*수|하려면|방법)|홈페이지|누리집|방문|준비물|서류|절차|단계|비교해|계산해|조회|문의|예약/;
const SENTENCE_SPLIT_RE = /(?<=[.!?。])\s+|\n+/;

function sentences(text: string): string[] {
  return text.split(SENTENCE_SPLIT_RE).map((s) => s.trim()).filter((s) => s.length >= 6);
}

function contentWords(question: string): string[] {
  return question.replace(/[?？.!,]/g, ' ').split(/\s+/).map((w) => w.replace(/(?:은|는|이|가|을|를|의|에|에서|로|으로|도|만|까지|부터)$/, '')).filter((w) => w.length >= 2);
}

function ratio(hits: number, total: number): number | null {
  return total === 0 ? null : Math.round((hits / total) * 100) / 100;
}

export function computeQualityMetrics(model: ArticleModel, evidence: EvidencePack): QualityMetrics {
  const bodySections = model.sections.filter((s) => s.kind !== 'cta');
  const body = bodySections.map((s) => s.text).join('\n');
  const compact = body.replace(/\s+/g, '');

  // CORE_FACT_COVERAGE — evidence numbers/dates that made it into the article.
  const factTokens = [...new Set([...evidence.keyFacts, ...evidence.keyDates].flatMap((f) => {
    const t = extractTokens(f.replace(/^\[S\d+\]\s*/, ''));
    return [...t.numbers, ...t.dates];
  }))];
  const coreFactCoverage = ratio(factTokens.filter((t) => compact.includes(t)).length, factTokens.length);

  // READER_QUESTION_COVERAGE — questions whose content words mostly appear in the body.
  const questionHits = evidence.readerQuestions.filter((q) => {
    const words = contentWords(q);
    if (words.length === 0) return false;
    const found = words.filter((w) => compact.includes(w.replace(/\s+/g, ''))).length;
    return found / words.length >= 0.6;
  }).length;
  const readerQuestionCoverage = ratio(questionHits, evidence.readerQuestions.length);

  // VAGUE_SENTENCE_RATIO
  const all = sentences(body);
  const vague = all.filter((s) => VAGUE_RE.test(s)).length;
  const vagueSentenceRatio = all.length === 0 ? 0 : Math.round((vague / all.length) * 100) / 100;

  // REDUNDANT_CORE_FACTS — numeric/date tokens appearing in 3+ sections.
  const perSection = bodySections.map((s) => new Set([...extractTokens(s.text).numbers, ...extractTokens(s.text).dates]));
  const counts = new Map<string, number>();
  for (const set of perSection) for (const t of set) counts.set(t, (counts.get(t) ?? 0) + 1);
  const redundantCoreFacts = [...counts.values()].filter((n) => n >= 3).length;

  // ACTIONABILITY — share of body sections with at least one action sentence.
  const actionable = bodySections.filter((s) => s.kind === 'section' && ACTION_RE.test(s.text)).length;
  const sectionCount = bodySections.filter((s) => s.kind === 'section').length;
  const actionability = sectionCount === 0 ? 0 : Math.round((actionable / sectionCount) * 100) / 100;

  return { coreFactCoverage, readerQuestionCoverage, vagueSentenceRatio, redundantCoreFacts, actionability };
}
