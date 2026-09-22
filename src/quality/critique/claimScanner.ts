// [2026-09-23 Quality Fix 1] Deterministic high-risk claim scanner ($0, no deletion).
// Emits issue SEEDS only — numbers/dates/attributed quotes/survey figures/institution names in
// the draft that the full evidence corpus does not carry. Seeds are merged with Critic 1 issues
// by claim fingerprint so the same wrong value is never "discovered" again in a later cycle.
// Conservative by design: bare numbers, titles, product names and short quoted labels are not
// scanned; only values that would mislead a reader if invented.

import type { ArticleModel, ArticleSection, QualityIssue } from './types';
import { buildAllowedValues, extractClaimTokens, isAdjacentDay, normalizeDates, normalizeNumbers, quoteSupported, rangeAnchoredDates, withoutDateFragments, type AllowedValues } from './claimNormalize';
import { issueFingerprint } from './issueValidator';

const SENTENCE_SPLIT_RE = /(?<=[.!?。])\s+|\n+/;
/** "…에 따르면 / 관계자는 / 대표는 / 씨는" — a quote becomes a claim only when attributed. */
const ATTRIBUTED_QUOTE_RE = /([가-힣A-Za-z0-9·() ]{1,24}?(?:씨|대표|관계자|장관|의원|교수|원장|팀장|사장|회장|위원장|대변인|측|당국|부|청|위원회|공사|공단|협회|연구원|은행))(?:은|는|이|가|에\s*따르면|의)?[^“"「『\n]{0,14}?[“"「『]([^”"」』]{6,160})[”"」』]/g;
const SURVEY_RE = /(설문|조사\s*결과|응답자|이용자들은|전문가들은|통계에\s*따르면|조사에\s*따르면)/;
const ORG_RE = /[가-힣A-Za-z]{2,12}(?:부|청|처|위원회|공단|공사|은행|그룹|협회|재단|연구원|대학교|시청|구청|도청|센터)(?=[\s,.·)]|$)/g;
/** Common nouns that share an institution suffix (신청처, 정부, 일부…) — never entities. */
const ORG_STOPLIST = new Set(['신청처', '문의처', '접수처', '판매처', '구입처', '구매처', '정부', '일부', '전부', '내부', '외부', '학부', '본부', '지부', '세부', '남부', '북부', '동부', '서부', '중부', '상부', '하부']);
/** A comma list is an institution list only in an institution context (은행·기관·취급·참여·주관·대상 기관). */
const LIST_RE = /(?:[가-힣A-Za-z]{2,8}\s*,\s*){2,}[가-힣A-Za-z]{2,8}/;
const LIST_CONTEXT_RE = /(은행|기관|취급|참여사|주관|후원|협력사|가맹|출연|명단)/;
const BOUNDARY_RE = /(이후|이전|다음\s*날|전날|넘기면|지나면|까지는|부터는|뒤로|앞으로|미루|앞당)/;
const MIN_CORPUS_CHARS = 500;

export interface ScanOptions {
  /** Section ids to skip (e.g. CTA). */
  readonly skipSections?: readonly string[];
}

function sentences(text: string): string[] {
  return text.split(SENTENCE_SPLIT_RE).map((s) => s.trim()).filter((s) => s.length >= 6);
}

function seed(
  section: ArticleSection,
  type: QualityIssue['type'],
  span: string,
  problem: string,
  requiredChange: string,
  severity: QualityIssue['severity'] = 'MAJOR',
): QualityIssue {
  return {
    issueKey: issueFingerprint(section.id, type, span),
    severity,
    type,
    sectionId: section.id,
    exactSpan: span,
    operation: 'REPLACE',
    evidenceIds: [],
    problem,
    requiredChange,
    state: severity === 'MINOR' ? 'ADVISORY' : 'OPEN',
    origin: 'precheck',
    round: 0,
    note: severity === 'MINOR' ? 'DETERMINISTIC_PRECHECK_HINT' : 'DETERMINISTIC_PRECHECK',
  };
}

/**
 * Severity tiers (measured on the 5 P1 drafts — 12 raw hits, 9 of them arithmetic derivations such as
 * 60번 = 5년×12, 46% = 100−54%, 35세 = 34세+1): dates, survey/statistic figures, attributed quotes and
 * entity lists are MAJOR seeds; other numbers are MINOR hints the Critic must confirm with evidence.
 */
function scanSentence(section: ArticleSection, sentence: string, allowed: AllowedValues): QualityIssue[] {
  const out: QualityIssue[] = [];
  const t = extractClaimTokens(sentence);
  const badNumbers = withoutDateFragments(t.numbers, t.dates).filter((n) => !allowed.numbers.has(n));
  // Derived, not fabricated: a range endpoint whose other end the source confirms ("10월 12~18일"),
  // and a next-/previous-day boundary the sentence spells out ("10월 23일 이후").
  const anchored = rangeAnchoredDates(sentence, allowed.dates);
  const derivedBoundary = BOUNDARY_RE.test(sentence);
  const isYearMonth = (d: string): boolean => /^20\d{2}년/.test(d);
  const unsupportedDates = t.dates.filter((d) => !allowed.dates.has(d) && !anchored.has(d) && !(derivedBoundary && isAdjacentDay(d, allowed.dates)));
  const badDates = unsupportedDates.filter((d) => !isYearMonth(d));
  const softDates = unsupportedDates.filter(isYearMonth);
  const survey = SURVEY_RE.test(sentence);
  if (badDates.length > 0 || (survey && badNumbers.length > 0)) {
    const values = [...badDates, ...(survey ? badNumbers : [])];
    out.push(seed(section, 'UNSUPPORTED_VALUE', sentence,
      `${survey ? '설문/통계 ' : ''}자료에 없는 값: ${values.join(', ')}`,
      '자료가 실제로 말하는 값으로 바꾸거나 그 값을 담은 절을 뺀다. 더 흐린 값("N월 중", "약")으로 바꾸지 않는다.'));
  } else if (badNumbers.length > 0 || softDates.length > 0) {
    // Year-month ("연말" -> "2026년 12월") and arithmetic derivations: a hint, not a blocking claim.
    out.push(seed(section, 'UNSUPPORTED_VALUE', sentence,
      `자료에서 그대로 확인되지 않는 값(계산·추정일 수 있음): ${[...softDates, ...badNumbers].join(', ')}`,
      '자료의 값에서 계산된 것이면 그대로 두고, 아니면 자료 값으로 바꾸거나 뺀다. 자료가 "연말"이면 본문도 그 범위를 넘지 않는다.', 'MINOR'));
  }
  for (const m of sentence.matchAll(ATTRIBUTED_QUOTE_RE)) {
    if (!quoteSupported(m[2], allowed)) {
      out.push(seed(section, 'UNSUPPORTED_QUOTE', sentence,
        `자료에 없는 직접 인용: ${m[1]} — "${m[2].slice(0, 40)}"`,
        '자료에 같은 발언이 없으면 인용 문장을 뺀다. 발언자를 바꿔 붙이지 않는다.'));
      break;
    }
  }
  if (LIST_RE.test(sentence) || ORG_RE.test(sentence)) {
    ORG_RE.lastIndex = 0;
    const orgs = [...new Set((sentence.match(ORG_RE) || []).map((o) => o.replace(/\s+/g, '')))].filter((o) => o.length >= 4 && !ORG_STOPLIST.has(o));
    const missing = orgs.filter((o) => !allowed.compact.includes(o));
    const listItems = LIST_RE.test(sentence) && LIST_CONTEXT_RE.test(sentence)
      ? (sentence.match(LIST_RE)?.[0] || '').split(/\s*,\s*/).map((x) => x.trim()).filter((x) => x.length >= 2 && !/^\d/.test(x))
      : [];
    const missingList = listItems.filter((x) => !allowed.compact.includes(x.replace(/\s+/g, '')));
    // A list is a claim only when most of it is unsupported — one unfamiliar name is not a fabricated list.
    const listUnsupported = listItems.length >= 3 && missingList.length >= Math.ceil(listItems.length / 2);
    if (missing.length > 0 || listUnsupported) {
      out.push(seed(section, 'UNSUPPORTED_ENTITY', sentence,
        `자료에 없는 기관/명단: ${[...missing, ...(listUnsupported ? missingList : [])].slice(0, 6).join(', ')}`,
        '자료에서 확인된 이름만 남긴다. 상식으로 명단을 채우지 않는다.'));
    }
  }
  return out;
}

/** Scan every section; returns seeds (no mutation of the article). Empty when the corpus is too thin to judge. */
export function scanHighRiskClaims(model: ArticleModel, corpus: string, options: ScanOptions = {}): QualityIssue[] {
  if (String(corpus || '').replace(/\s+/g, '').length < MIN_CORPUS_CHARS) return [];
  const allowed = buildAllowedValues(corpus);
  const skip = new Set(options.skipSections ?? ['cta']);
  const seeds: QualityIssue[] = [];
  const seen = new Set<string>();
  for (const section of model.sections) {
    if (skip.has(section.id)) continue;
    for (const sentence of sentences(section.text)) {
      for (const s of scanSentence(section, sentence, allowed)) {
        if (seen.has(s.issueKey)) continue;
        seen.add(s.issueKey);
        seeds.push(s);
      }
    }
  }
  return seeds;
}

/**
 * [Item 21] Values/quotes a revision ADDED that the evidence does not carry. The Editor may remove
 * or correct a claim; it may not invent one while doing so.
 */
export function introducedUnsupportedValues(
  before: ArticleModel,
  after: ArticleModel,
  corpus: string,
  sectionIds: readonly string[],
): string[] {
  const allowed = buildAllowedValues(corpus);
  const beforeById = new Map(before.sections.map((s) => [s.id, s.text]));
  const out = new Set<string>();
  for (const id of sectionIds) {
    const section = after.sections.find((s) => s.id === id);
    if (!section) continue;
    const old = beforeById.get(id) ?? '';
    const oldTokens = extractClaimTokens(old);
    const nowTokens = extractClaimTokens(section.text);
    const anchored = rangeAnchoredDates(section.text, allowed.dates);
    for (const d of nowTokens.dates) {
      if (allowed.dates.has(d) || anchored.has(d) || oldTokens.dates.includes(d) || /^20\d{2}년/.test(d)) continue;
      out.add(d);
    }
    for (const n of withoutDateFragments(nowTokens.numbers, nowTokens.dates)) {
      if (allowed.numbers.has(n) || oldTokens.numbers.includes(n)) continue;
      out.add(n);
    }
    for (const q of nowTokens.quotes) {
      if (quoteSupported(q, allowed) || oldTokens.quotes.includes(q)) continue;
      out.add(`"${q.slice(0, 24)}"`);
    }
  }
  return [...out];
}

/** Claim key shared by scanner seeds and Critic issues: section + the unsupported values inside the span. */
export function claimKey(sectionId: string, span: string, allowed: AllowedValues): string {
  const values = [
    ...normalizeDates(span).filter((d) => !allowed.dates.has(d)),
    ...normalizeNumbers(span).filter((n) => !allowed.numbers.has(n)),
  ].sort();
  return values.length > 0 ? `${sectionId}|${values.join(',')}` : '';
}

export interface SeedMerge {
  readonly keptSeeds: QualityIssue[];
  readonly coveredSeeds: QualityIssue[];
}

/**
 * The Critic's issue wins for a claim it also found (it carries evidenceIds and a requiredChange);
 * seeds for claims the Critic missed are kept. Coverage = same section AND the seed's unsupported
 * values all appear in the Critic's span (or the Critic's span is inside the seed sentence).
 */
export function mergeSeedsWithCritic(seeds: readonly QualityIssue[], criticIssues: readonly QualityIssue[], corpus: string): SeedMerge {
  const allowed = buildAllowedValues(corpus);
  const compact = (t: string): string => t.replace(/\s+/g, '');
  const criticKeys = new Set(criticIssues.map((i) => claimKey(i.sectionId, i.exactSpan, allowed)).filter(Boolean));
  const kept: QualityIssue[] = [];
  const covered: QualityIssue[] = [];
  for (const seed of seeds) {
    const key = claimKey(seed.sectionId, seed.exactSpan, allowed);
    const spanCovered = criticIssues.some((i) => i.sectionId === seed.sectionId && i.exactSpan.length >= 6 && compact(seed.exactSpan).includes(compact(i.exactSpan)));
    if ((key && criticKeys.has(key)) || spanCovered) covered.push(seed);
    else kept.push(seed);
  }
  return { keptSeeds: kept, coveredSeeds: covered };
}
