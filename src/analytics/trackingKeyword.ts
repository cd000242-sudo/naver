/**
 * trackingKeyword.ts — where the keyword used for exposure tracking came from.
 *
 * [2026-11-08 exposure-measurement plan, step 1]
 * 122 of 153 posts since 9/16 were tracked as "search keyword = title": when the keyword field is empty the
 * generator uses the title as an internal topic (that is fine for generation) and the recorder then believed
 * it was a real keyword. Only these origins are a real tracking keyword:
 *   user-input   — typed into the keyword field (or an app queue entry the user typed)
 *   leword       — picked from the LEWORD board
 *   schedule-job — written in a scheduled / daily job or an account keyword list
 * Anything else is source "none" and kind "index-only": we still check that the post is indexed, but it is
 * never counted as a ranking measurement and the title is never stored in the keyword slot.
 *
 * [2026-11-17] Two automatic origins, used only when none of the three above exists (168 of 273 posts had an
 * empty keyword field and could not be measured):
 *   auto-volume  — the generator's URL-mode pick, chosen by Naver monthly search volume (people do search it)
 *   auto-model   — the same pick when no volume was available (model's first candidate, unverified)
 * They are stored under their own label so a report can always separate them from a typed keyword.
 * auto-model is always index-only: nobody has shown that anyone searches it, so a miss must not count as
 * "not exposed" in the calibration.
 *
 * Pure module (no fs, no electron). The renderer only attaches a raw "fact"; main validates it here.
 */
import { resolveSearchKeyword } from './searchKeyword.js';

export type KeywordSource = 'user-input' | 'leword' | 'schedule-job' | 'auto-volume' | 'auto-model' | 'none';
export type OutcomeKeywordKind = 'exposure' | 'index-only';

/** What travels in `contentPolicyContext.trackingKeyword` — a raw claim, validated by main. */
export interface TrackingKeywordFact {
  readonly value: string;
  readonly source: Exclude<KeywordSource, 'none'>;
}

export interface TrackingKeyword {
  readonly value: string | null;
  readonly source: KeywordSource;
  readonly kind: OutcomeKeywordKind;
}

export const NO_TRACKING_KEYWORD: TrackingKeyword = Object.freeze({
  value: null,
  source: 'none',
  kind: 'index-only',
});

const REAL_SOURCES: ReadonlySet<string> = new Set(['user-input', 'leword', 'schedule-job', 'auto-volume', 'auto-model']);
const MAX_KEYWORD_CHARS = 100;
const squash = (value: unknown): string => String(value ?? '').replace(/\s+/g, '').toLowerCase();

/** Validate an untrusted claim. Returns null when it is not a usable keyword fact. */
export function parseTrackingKeywordFact(raw: unknown): TrackingKeywordFact | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { value, source } = raw as { value?: unknown; source?: unknown };
  if (typeof value !== 'string' || typeof source !== 'string') return null;
  if (!REAL_SOURCES.has(source)) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > MAX_KEYWORD_CHARS) return null;
  return { value: trimmed, source: source as TrackingKeywordFact['source'] };
}

/**
 * Keyword claim for a source the MAIN process picked itself (daily job or account keyword list).
 * A keyword source is the job's keyword; a URL source has none (the title is never a substitute).
 * The daily executor does not forward whether a LEWORD pick or a topic line produced the keyword, so both are
 * labelled schedule-job here; only the manual LEWORD picker is labelled leword.
 */
export function trackingFactFromContentSource(source: unknown): TrackingKeywordFact | undefined {
  const bag = (source && typeof source === 'object' ? source : {}) as { type?: unknown; value?: unknown };
  if (bag.type !== 'keyword') return undefined;
  return parseTrackingKeywordFact({ value: bag.value, source: 'schedule-job' }) ?? undefined;
}

/**
 * Keyword claim from the generator's own URL-mode pick (`source.metadata.keywordPick`).
 * Callers use it only as a fallback: a typed, LEWORD or job keyword always wins.
 */
export function trackingFactFromKeywordPick(pick: unknown): TrackingKeywordFact | undefined {
  const bag = (pick && typeof pick === 'object' ? pick : {}) as { keyword?: unknown; decidedBy?: unknown };
  const source = bag.decidedBy === 'search-volume' ? 'auto-volume' : bag.decidedBy === 'llm-first' ? 'auto-model' : null;
  if (!source) return undefined;
  return parseTrackingKeywordFact({ value: bag.keyword, source }) ?? undefined;
}

/**
 * Turn a claim + the final title into the record that is stored.
 * A keyword equal to the title is the title passed off as a keyword → none.
 * A sentence-like keyword (too long / punctuation) stays visible but is index-only,
 * using the same rule the exposure checker applies when it labels a check.
 */
export function finalizeTrackingKeyword(fact: unknown, title: unknown): TrackingKeyword {
  const parsed = parseTrackingKeywordFact(fact);
  if (!parsed) return NO_TRACKING_KEYWORD;
  const postTitle = String(title ?? '');
  if (squash(parsed.value) === squash(postTitle)) return NO_TRACKING_KEYWORD;
  const verdict = resolveSearchKeyword(parsed.value, postTitle);
  return {
    value: parsed.value,
    source: parsed.source,
    kind: verdict.kind === 'exposure' && parsed.source !== 'auto-model' ? 'exposure' : 'index-only',
  };
}
