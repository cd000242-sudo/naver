// src/analytics/homefeedBenchmarkFeed.ts
// [2026-10-15] Reads the leadernam homefeed benchmark (posts that actually reached the homefeed).
//
// Until now only the site (SPA) read the benchmark, title and guide files; the app only took
// keywords from LEWORD. The homefeed autopilot needs all three to decide what to write.
//
// The three files join on post URL — ids overlap only partially (measured: guides 14/153,
// titles 12/143). The site's withGuides joins by URL as well (spa/src/lib/homefeedGuides.mjs).

const LEWORD_DATA_BASE = 'https://leaderspro.kr/data';
export const HOMEFEED_BENCHMARKS_URL = `${LEWORD_DATA_BASE}/homefeed-benchmarks.json`;
export const HOMEFEED_TITLES_URL = `${LEWORD_DATA_BASE}/homefeed-benchmark-titles.json`;
export const HOMEFEED_GUIDES_URL = `${LEWORD_DATA_BASE}/homefeed-benchmark-guides.json`;

export interface HomefeedGuide {
  readonly direction: string;
  readonly mustInclude: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly checkBefore: readonly string[];
}

export interface HomefeedCandidate {
  readonly id: string;
  readonly keyword: string;
  readonly title: string;
  readonly category: string;
  /** review-now | verify | stale */
  readonly status: string;
  /** Benchmark's own priority (observed 40-89); null when unknown. */
  readonly priority: number | null;
  readonly publishedAt: string;
  /** Channels that posted this topic to the homefeed — proof of demand. */
  readonly channels: number;
  readonly sourceUrls: readonly string[];
  /** Like growth since capture; null when unknown. */
  readonly likesGrowth: number | null;
  /** Risk flags such as sensitive-claim, headline-only, recycled-material. */
  readonly flags: readonly string[];
  readonly why: readonly string[];
  readonly summary: string;
  /** Titles that actually ran on the homefeed (from the candidate or the titles file). */
  readonly homeTitles: readonly string[];
  readonly guide: HomefeedGuide | null;
}

export interface HomefeedBenchmarkFeed {
  readonly generatedAt: string;
  readonly candidates: readonly HomefeedCandidate[];
  /** Title rules derived from top-performer title stats (human-readable, verbatim). */
  readonly titleRules: readonly string[];
}

const EMPTY_FEED: HomefeedBenchmarkFeed = { generatedAt: '', candidates: [], titleRules: [] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function texts(value: unknown, limit = 12): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, limit) : [];
}

function toGuide(raw: unknown): HomefeedGuide | null {
  const row = asRecord(raw);
  if (!row) return null;
  const guide: HomefeedGuide = {
    direction: text(row.direction ?? row.writingDirection),
    mustInclude: texts(row.mustInclude),
    mustAvoid: texts(row.mustAvoid),
    checkBefore: texts(row.checkBefore ?? row.verificationNeeded),
  };
  const empty = !guide.direction && !guide.mustInclude.length && !guide.mustAvoid.length && !guide.checkBefore.length;
  return empty ? null : guide;
}

/** URL → value map. First entry wins when a URL appears twice (same rule as the site). */
function indexByUrl<T>(entries: unknown, pick: (row: Record<string, unknown>) => T | null): Map<string, T> {
  const byUrl = new Map<string, T>();
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    const row = asRecord(entry);
    if (!row) continue;
    const value = pick(row);
    if (value === null) continue;
    for (const url of texts(row.urls, 50)) if (!byUrl.has(url)) byUrl.set(url, value);
  }
  return byUrl;
}

/** Channel count stated in `why` ("9개 채널…"); `sources` is capped at 5 so this can be larger. */
function channelsFromWhy(why: readonly string[]): number {
  for (const line of why) {
    const match = /(\d+)\s*개\s*채널/.exec(line);
    if (match) return Number(match[1]);
  }
  return 0;
}

function toCandidate(
  raw: unknown,
  guidesByUrl: Map<string, HomefeedGuide>,
  titlesByUrl: Map<string, string[]>,
): HomefeedCandidate | null {
  const row = asRecord(raw);
  if (!row) return null;
  const keyword = text(row.keyword);
  if (!keyword) return null;

  const sources = Array.isArray(row.sources) ? row.sources.map(asRecord).filter((s): s is Record<string, unknown> => !!s) : [];
  const sourceUrls = sources.map((s) => text(s.url)).filter(Boolean);
  const sourceIds = new Set(sources.map((s) => text(s.id) || text(s.url)).filter(Boolean));
  const why = texts(row.why);

  const ownGuide = toGuide({ ...row, direction: row.writingDirection });
  const joinedGuide = sourceUrls.map((url) => guidesByUrl.get(url)).find(Boolean) ?? null;
  const ownTitles = texts(row.homeTitles, 20);
  const joinedTitles = sourceUrls.map((url) => titlesByUrl.get(url)).find((list) => !!list?.length) ?? [];

  const metrics = asRecord(row.metrics);
  const growth = asRecord(asRecord(metrics?.reactionGrowth)?.likes);

  return {
    id: text(row.id) || keyword,
    keyword,
    title: text(row.title),
    category: text(row.category),
    status: text(row.status),
    priority: finite(row.priority),
    publishedAt: text(row.publishedAt),
    channels: Math.max(sourceIds.size, channelsFromWhy(why)),
    sourceUrls,
    likesGrowth: finite(growth?.change),
    flags: texts(row.flags),
    why,
    summary: text(row.summary).slice(0, 400),
    homeTitles: ownTitles.length ? ownTitles : joinedTitles,
    guide: ownGuide ?? joinedGuide,
  };
}

/**
 * Merges the benchmark, titles and guides files into one candidate list.
 * Titles and guides are optional — the benchmark alone is enough to judge.
 * An unexpected shape yields an empty feed; a site-side format change must not break the app.
 */
export function parseHomefeedBenchmarkFeed(
  benchmarksRaw: unknown,
  titlesRaw?: unknown,
  guidesRaw?: unknown,
): HomefeedBenchmarkFeed {
  const bench = asRecord(benchmarksRaw);
  if (!bench) return EMPTY_FEED;

  const guidesByUrl = indexByUrl(asRecord(guidesRaw)?.guides, (row) => toGuide(row.guide));
  const titlesByUrl = indexByUrl(asRecord(titlesRaw)?.entries, (row) => {
    const titles = texts(row.titles, 20);
    return titles.length ? titles : null;
  });

  const candidates: HomefeedCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(bench.candidates) ? bench.candidates : []) {
    const candidate = toCandidate(entry, guidesByUrl, titlesByUrl);
    if (!candidate || seen.has(candidate.keyword)) continue;
    seen.add(candidate.keyword);
    candidates.push(candidate);
  }

  const writing = asRecord(asRecord(bench.trends)?.writing);
  return {
    generatedAt: text(bench.generatedAt),
    candidates,
    titleRules: texts(writing?.guide, 10),
  };
}
