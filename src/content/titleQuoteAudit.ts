/**
 * Title quote / demand-word audit.
 *
 * Rules come from the owner's hand-built 홈판 guideline (K02_TITLE §3/§8, K06 §2):
 *   (A) quotation marks in a title may wrap an utterance that exists in the material, or
 *   (B) a reader reaction that ends in "?". A declarative sentence the writer invented and
 *       wrapped in quotes so it reads like speech is banned.
 *   Titles that only demand curiosity ("눈길 간 건 따로", "먼저 봐야 할 게", "알려진 건 여기까지")
 *   without a scene, condition or payoff were rejected by the owner repeatedly.
 *
 * The app's own measurement (homefeedTitleQuoteUse: 1,299 홈판 vs 794 미진입) says quotes lift
 * 1.28x but 44% of 홈판 titles carry none, so this audit never asks for a quote — it only
 * reports fake ones.
 *
 * LOG-ONLY: no repair, no LLM call, no publish block.
 */

export type TitleQuoteKind = 'fabricated-quote' | 'demand-only';

export interface TitleQuoteHit {
  kind: TitleQuoteKind;
  /** "selected" or "candidate#N" (1-based). */
  slot: string;
  title: string;
  match: string;
}

export interface TitleQuoteReport {
  hits: TitleQuoteHit[];
  count: number;
  kinds: TitleQuoteKind[];
}

export interface TitleQuoteInput {
  title: string;
  candidates?: readonly string[];
  /** Raw material the title was written from. Empty → quote provenance is not judged. */
  sourceText?: string;
}

/** Double quotes (straight/curly) and single quotes (straight/curly). Apostrophes inside words are skipped. */
const QUOTE_SPANS: readonly RegExp[] = Object.freeze([
  /["“„]([^"“”„]{2,60})["”]/gu,
  /(?:^|[\s(\[,·])[‘']([^‘’']{2,60})[’'](?=$|[\s)\],.!?…:])/gu,
]);

/** Demand-only phrasings — the owner rejected these titles (K02 §8, K06 §2). */
const DEMAND_ONLY_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:눈길|시선)[이가]?\s*간\s*건\s*따로/u,
  /(?:이유|답|문제|핵심|본론)[은는]\s*따로/u,
  /따로\s*있(?:었|다|습니다)/u,
  /먼저\s*봐야\s*할\s*(?:게|것)/u,
  /(?:알려진|확인된|밝혀진|공개된)\s*건\s*여기까지/u,
  /더\s*궁금해진/u,
]);

/** A quoted span counts as a sentence-like utterance only when it is long enough to be one. */
const MIN_QUOTE_CHARS = 6;
/** Share of the quote's 2-grams that must appear in the material for it to count as real speech. */
const MIN_NGRAM_COVERAGE = 0.75;
const MAX_REPORTED = 4;

function normalize(text: string): string {
  return String(text || '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[\s"“”„‘’'`.,!?…·\-~()[\]{}:;]/gu, '')
    .toLowerCase();
}

function extractQuotes(title: string): string[] {
  const out: string[] = [];
  for (const pattern of QUOTE_SPANS) {
    for (const m of title.matchAll(pattern)) out.push(m[1].trim());
  }
  return out;
}

/** True when the quoted span is present in the material, allowing dropped particles / added ellipsis. */
function quoteIsInSource(quote: string, source: string): boolean {
  const q = normalize(quote);
  if (q.length === 0) return true;
  if (source.includes(q)) return true;
  if (q.length < 2) return true;
  const grams: string[] = [];
  for (let i = 0; i + 2 <= q.length; i += 1) grams.push(q.slice(i, i + 2));
  const found = grams.filter((g) => source.includes(g)).length;
  return found / grams.length >= MIN_NGRAM_COVERAGE;
}

function auditOne(title: string, slot: string, source: string, hits: TitleQuoteHit[]): void {
  const text = String(title || '').trim();
  if (!text) return;

  if (source) {
    for (const quoted of extractQuotes(text)) {
      if (quoted.length < MIN_QUOTE_CHARS) continue;
      if (/[?？]\s*$/u.test(quoted)) continue; // (B) reader reaction
      if (quoteIsInSource(quoted, source)) continue; // (A) real utterance
      hits.push({ kind: 'fabricated-quote', slot, title: text, match: quoted });
      break;
    }
  }

  for (const pattern of DEMAND_ONLY_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    hits.push({ kind: 'demand-only', slot, title: text, match: m[0] });
    break;
  }
}

export function auditTitleQuote(input: TitleQuoteInput): TitleQuoteReport {
  const source = normalize(input?.sourceText || '');
  const hits: TitleQuoteHit[] = [];
  auditOne(input?.title, 'selected', source, hits);
  (input?.candidates || []).forEach((candidate, index) => {
    if (candidate && candidate.trim() === String(input.title || '').trim()) return;
    auditOne(candidate, `candidate#${index + 1}`, source, hits);
  });
  const kinds = Array.from(new Set(hits.map((h) => h.kind)));
  return { hits, count: hits.length, kinds };
}

export function describeTitleQuote(report: TitleQuoteReport): string {
  if (!report || report.count === 0) return '';
  const shown = report.hits
    .slice(0, MAX_REPORTED)
    .map((h) => `${h.slot} ${h.kind} "${h.match}"`)
    .join(', ');
  return `[TitleQuote] ⚠️ 제목 따옴표·요구어 ${report.count}건 — ${shown}`;
}
