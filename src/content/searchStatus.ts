// Classifies Naver search source results so callers can tell "the API is
// rate-limited" apart from "the API succeeded but found nothing" — both
// used to collapse into an undifferentiated 0-item empty result upstream.

export type SearchStatus =
  | 'SEARCH_OK'
  | 'SEARCH_EMPTY'
  | 'SEARCH_RATE_LIMITED'
  | 'SEARCH_BLOCKED'
  | 'SEARCH_PARSE_FAILED'
  | 'SEARCH_PARTIAL'
  | 'SEARCH_ERROR';

export interface SourceSearchResult {
  source: string;
  status: SearchStatus;
  count: number;
  httpStatus?: number;
  detail?: string;
}

/**
 * Classify a single call outcome.
 * - 429            → SEARCH_RATE_LIMITED
 * - 401 / 403      → SEARCH_BLOCKED
 * - 5xx / network (0 or undefined status with an error) → SEARCH_ERROR
 * - parse error    → SEARCH_PARSE_FAILED
 * - 200 & 0 items  → SEARCH_EMPTY
 * - 200 & items    → SEARCH_OK
 */
export function classifyHttpStatus(
  httpStatus: number | undefined,
  itemCount: number,
  error?: unknown,
): SearchStatus {
  if (httpStatus === 429) return 'SEARCH_RATE_LIMITED';
  if (httpStatus === 401 || httpStatus === 403) return 'SEARCH_BLOCKED';

  if (error instanceof SyntaxError) return 'SEARCH_PARSE_FAILED';
  if (typeof error === 'string' && /json|parse/i.test(error)) return 'SEARCH_PARSE_FAILED';

  if (httpStatus === undefined || httpStatus === 0 || (httpStatus >= 500 && httpStatus < 600)) {
    return 'SEARCH_ERROR';
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return itemCount > 0 ? 'SEARCH_OK' : 'SEARCH_EMPTY';
  }

  return 'SEARCH_ERROR';
}

export interface AggregatedSearchStatus {
  overall: SearchStatus;
  summary: string;
}

const STATUS_LABEL: Record<SearchStatus, string> = {
  SEARCH_OK: 'OK',
  SEARCH_EMPTY: 'EMPTY',
  SEARCH_RATE_LIMITED: 'RATE_LIMITED',
  SEARCH_BLOCKED: 'BLOCKED',
  SEARCH_PARSE_FAILED: 'PARSE_FAILED',
  SEARCH_PARTIAL: 'PARTIAL',
  SEARCH_ERROR: 'ERROR',
};

/**
 * Aggregate multiple source results into one overall status.
 * - all OK              → OK
 * - some OK, some not    → PARTIAL
 * - none OK: precedence RATE_LIMITED > BLOCKED > ERROR > EMPTY
 */
export function aggregateSearchStatus(results: SourceSearchResult[]): AggregatedSearchStatus {
  const summary = results
    .map((r) => `${r.source}: ${STATUS_LABEL[r.status]}${r.status === 'SEARCH_OK' ? ` ${r.count}` : ''}`)
    .join(' · ');

  if (results.length === 0) {
    return { overall: 'SEARCH_EMPTY', summary: summary || '(no sources)' };
  }

  const okCount = results.filter((r) => r.status === 'SEARCH_OK').length;

  if (okCount === results.length) {
    return { overall: 'SEARCH_OK', summary };
  }

  if (okCount > 0) {
    return { overall: 'SEARCH_PARTIAL', summary };
  }

  if (results.some((r) => r.status === 'SEARCH_RATE_LIMITED')) {
    return { overall: 'SEARCH_RATE_LIMITED', summary };
  }
  if (results.some((r) => r.status === 'SEARCH_BLOCKED')) {
    return { overall: 'SEARCH_BLOCKED', summary };
  }
  if (results.some((r) => r.status === 'SEARCH_ERROR')) {
    return { overall: 'SEARCH_ERROR', summary };
  }
  if (results.some((r) => r.status === 'SEARCH_PARSE_FAILED')) {
    return { overall: 'SEARCH_PARSE_FAILED', summary };
  }

  return { overall: 'SEARCH_EMPTY', summary };
}

/** OK or PARTIAL results have enough material to proceed with. */
export function isSearchUsable(overall: SearchStatus): boolean {
  return overall === 'SEARCH_OK' || overall === 'SEARCH_PARTIAL';
}
