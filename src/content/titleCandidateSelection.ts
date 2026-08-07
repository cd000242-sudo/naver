// Free title re-selection for the live single-submission path.
//
// Why this exists: the app generates `selectedTitle` plus `titleCandidates` in ONE billable
// call, but only `selectedTitle` was ever used. The candidate-vs-score comparison lived in
// generateTitleOnlyPatch, which runs only behind CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR —
// an opt-in that production never sets (a second paid generation is against policy). So the
// title evaluator had no effect on shipped titles, and a weak `selectedTitle` (notably agent
// CLIs echoing the input keyword verbatim) went out as-is.
//
// Re-ranking candidates costs nothing: they are already paid for and already in the response.
// This module is pure so the policy can be tested without a model call.

export interface TitleCandidateLike {
  readonly text?: unknown;
  readonly score?: unknown;
}

export interface TitleSelectionInput {
  readonly selectedTitle?: unknown;
  readonly candidates?: unknown;
  /** Primary keyword the user searched for. Used to detect a verbatim echo. */
  readonly keyword?: string;
  /** Quality score for a title, 0-100. Injected so this module stays free of app imports. */
  readonly scoreTitle: (title: string) => number;
}

export interface TitleSelectionResult {
  readonly title: string;
  readonly changed: boolean;
  readonly fromScore: number;
  readonly toScore: number;
  readonly reason: 'keyword-echo' | 'higher-score' | 'kept';
}

/** Swap only on a clear win, so normal titles are not churned by scoring noise. */
export const TITLE_SWAP_MIN_GAIN = 8;

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Comparison key: whitespace and case collapsed, so "케이뱅크 황금캡슐" == "케이뱅크  황금캡슐". */
function comparisonKey(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * True when the model handed back the input keyword as the title instead of writing one.
 * Agent CLIs do this when they run out of budget mid-task; the app must not ship it as a
 * generated title (the user explicitly chose auto-generation, not "keyword as title").
 */
export function isKeywordEcho(title: string, keyword: string): boolean {
  const t = comparisonKey(normalize(title));
  const k = comparisonKey(normalize(keyword));
  if (!t || !k) return false;
  return t === k;
}

function readCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = normalize((entry as TitleCandidateLike)?.text);
    if (!text) continue;
    const key = comparisonKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/**
 * Pick the best title the model already produced.
 *
 * Two triggers, both free:
 *   1. keyword echo — `selectedTitle` is just the input keyword; any real candidate wins.
 *   2. higher score — a candidate beats `selectedTitle` by at least TITLE_SWAP_MIN_GAIN.
 *
 * Returns the original title unchanged when nothing clears the bar. The caller is responsible
 * for skipping this entirely when the user locked the title (useKeywordAsTitle / manual override).
 */
export function selectBestTitleCandidate(input: TitleSelectionInput): TitleSelectionResult {
  const selected = normalize(input.selectedTitle);
  const keyword = normalize(input.keyword);
  const candidates = readCandidates(input.candidates).filter(
    (text) => comparisonKey(text) !== comparisonKey(selected),
  );

  const score = (title: string): number => {
    try {
      const value = input.scoreTitle(title);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };

  const selectedScore = selected ? score(selected) : 0;
  const kept: TitleSelectionResult = {
    title: selected,
    changed: false,
    fromScore: selectedScore,
    toScore: selectedScore,
    reason: 'kept',
  };

  if (candidates.length === 0) return kept;

  const echo = isKeywordEcho(selected, keyword);
  // A candidate that is itself an echo cannot rescue an echo.
  const usable = echo
    ? candidates.filter((text) => !isKeywordEcho(text, keyword))
    : candidates;
  if (usable.length === 0) return kept;

  let best = usable[0];
  let bestScore = score(best);
  for (const candidate of usable.slice(1)) {
    const candidateScore = score(candidate);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  if (echo) {
    return { title: best, changed: true, fromScore: selectedScore, toScore: bestScore, reason: 'keyword-echo' };
  }
  if (!selected) {
    return { title: best, changed: true, fromScore: 0, toScore: bestScore, reason: 'higher-score' };
  }
  if (bestScore - selectedScore >= TITLE_SWAP_MIN_GAIN) {
    return { title: best, changed: true, fromScore: selectedScore, toScore: bestScore, reason: 'higher-score' };
  }
  return kept;
}
