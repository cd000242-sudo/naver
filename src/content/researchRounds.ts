// src/content/researchRounds.ts
// [2026-10-13 심층 리서치 A3·A4] Pure helpers for the extra research rounds. No network, no model call here.
//
//   A3 질문 분해: one low-cost model call (selected engine, utility tier) turns the keyword into 5~8 concrete
//   search queries — the angles a reader actually asks (조건·금액·절차·기한·예외·비교·확인처). Each query gets
//   its own search round so facts that the top results for the bare keyword never mention still reach the writer.
//   A4 갭 보충: after the first collection pass, code (not a model) checks which queries the collected text
//   already covers and runs ONE more search round only for the uncovered ones.

export const RESEARCH_QUERY_MIN = 5;
export const RESEARCH_QUERY_MAX = 8;
const QUERY_MIN_CHARS = 2;
const QUERY_MAX_CHARS = 30;

/** Prompt for the question-decomposition call. The model answers with JSON only. */
export function buildResearchQueryPrompt(keyword: string, mode?: string): string {
  const topic = String(keyword || '').trim();
  const audience = mode === 'homefeed'
    ? '피드에서 우연히 이 글을 만난 사람'
    : '이 키워드를 검색창에 친 사람';
  return [
    `주제: "${topic}"`,
    `${audience}이 실제로 알고 싶어 하는 것을 ${RESEARCH_QUERY_MIN}~${RESEARCH_QUERY_MAX}개의 "검색어"로 쪼개라.`,
    '각 검색어는 네이버 검색창에 그대로 넣을 수 있는 짧은 한국어(2~30자)이며, 서로 다른 축을 맡는다:',
    '조건·대상 / 금액·수치 / 절차·방법 / 기한·일정 / 예외·주의 / 비교·대안 / 공식 확인처.',
    '주제어를 그대로 반복하지 말고 구체 명사를 붙여라. 설명·번호·마크다운 없이 JSON 한 줄만 출력한다:',
    '{"queries":["...","..."]}',
  ].join('\n');
}

/** Pulls the query list out of a model reply; tolerates prose around the JSON. Never throws. */
export function parseResearchQueries(reply: string, keyword: string): string[] {
  const text = String(reply || '');
  const normalizedKeyword = normalize(keyword);
  let list: unknown[] = [];
  const objectMatch = text.match(/\{[\s\S]*?"queries"\s*:\s*(\[[\s\S]*?\])[\s\S]*?\}/);
  const arrayMatch = objectMatch ? null : text.match(/\[[\s\S]*?\]/);
  try {
    const raw = objectMatch ? objectMatch[1] : arrayMatch ? arrayMatch[0] : '[]';
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    list = [];
  }
  if (list.length === 0 && !/[{[]/.test(text)) {
    // No JSON at all: accept a plain line list ("- 질문", "1) 질문"). A broken reply yields no extra rounds.
    list = text.split(/\r?\n/).map((line) => line.replace(/^[-*\d.)\s"']+/, '').replace(/["',]+$/, ''));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const query = String(item ?? '').replace(/\s+/g, ' ').trim();
    const key = normalize(query);
    if (query.length < QUERY_MIN_CHARS || query.length > QUERY_MAX_CHARS) continue;
    if (!key || key === normalizedKeyword || seen.has(key)) continue;
    if (!/[가-힣A-Za-z0-9]/.test(query)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= RESEARCH_QUERY_MAX) break;
  }
  return out;
}

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

const PARTICLE_RE = /(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|이나|나)$/;

/** Content words of a query (2+ Hangul/alnum chars, particles stripped). */
export function queryTerms(query: string): string[] {
  return String(query || '')
    .split(/[\s,./:：·()\[\]"']+/)
    .map((w) => w.replace(PARTICLE_RE, '').trim())
    .filter((w) => w.length >= 2)
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

export interface QueryCoverage {
  readonly covered: string[];
  readonly missing: string[];
}

/**
 * A query counts as covered when at least half of its content words (and at least one) appear in the
 * collected text. Queries whose words all sit inside the keyword itself are treated as covered — the base
 * search already targeted them.
 */
export function assessQueryCoverage(queries: readonly string[], collectedText: string, keyword = ''): QueryCoverage {
  const haystack = normalize(collectedText);
  const keywordTerms = new Set(queryTerms(keyword).map(normalize));
  const covered: string[] = [];
  const missing: string[] = [];
  for (const query of queries) {
    const terms = queryTerms(query).map(normalize).filter((t) => !keywordTerms.has(t));
    if (terms.length === 0) { covered.push(query); continue; }
    const hits = terms.filter((t) => haystack.includes(t)).length;
    (hits >= Math.max(1, Math.ceil(terms.length / 2)) ? covered : missing).push(query);
  }
  return { covered, missing };
}

export interface LinkedCandidate { readonly link?: string }

/** Base candidates first (their order kept), then extra-round candidates, deduped by link. */
export function mergeCandidateRounds<T extends LinkedCandidate>(base: readonly T[], extras: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const candidate of [...base, ...extras]) {
    const link = String(candidate?.link || '').trim();
    if (!link || seen.has(link)) continue;
    seen.add(link);
    out.push(candidate);
  }
  return out;
}
