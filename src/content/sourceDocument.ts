// src/content/sourceDocument.ts
//
// A structured view of a single collected source article/post, instead of one
// giant opaque text blob. The legacy bundle format produced by
// src/sourceAssembler.ts (collectTopArticleFullTexts etc.) concatenates every
// article into one string with "[자료 N — 제목]" headers. Anything that needs
// to reason about "this one article" (noise filtering, relevance scoring,
// freshness policy, writer-facing rendering) had to re-parse that string by
// hand, which is how the truncation bug at sourceNoiseFilter.ts:207 happened —
// a single supplement-boundary regex was asked to describe the whole bundle.
//
// This module gives that bundle a real shape (SourceDocument[]) and a parser
// (parseLegacyMaterialBundle) that turns the existing text format into it,
// without requiring sourceAssembler.ts itself to change.

export type SourceKind = 'news' | 'blog' | 'web' | 'kin' | 'official' | 'snippet' | 'url' | 'unknown';
export type SourceTier = 'OFFICIAL' | 'NEWS' | 'BLOG' | 'COMMUNITY' | 'UNKNOWN';

/** [P1 relevance v2] Per-component breakdown behind a v2 relevance score. See sourceRelevanceScoring.ts. */
export interface SourceRelevanceComponents {
  mainEntityMatch: number;
  mainKeywordMatch: number;
  intentMatch: number;
  freshnessScore: number;
  sourceQuality: number;
  titleRelevance: number;
  bodyRelevance: number;
}

export interface SourceDocument {
  id: string; // 'S01', 'S02', ...
  title: string;
  sourceType: SourceKind;
  /** [P1 relevance v2] Optional/nullable — resolveSourceName() returns null rather than guessing. */
  sourceName?: string | null;
  /** [P1 relevance v2] Bare hostname (no "www."), from resolveSourceName(). */
  domain?: string;
  url: string;
  pubDate?: string; // 'YYYY-MM-DD'
  dateStatus: 'KNOWN' | 'UNKNOWN_DATE';
  body: string; // as collected
  cleanedBody?: string;
  sourceTier: SourceTier;
  relevance?: {
    // Legacy v1 fields (evaluateSourceRelevance) — still set by that path.
    keywordScore?: number;
    entityScore?: number;
    // v2 fields (rankSourceDocuments / computeSourceRanking) — see sourceRelevanceRanking.ts.
    score?: number;
    components?: SourceRelevanceComponents;
    accepted: boolean;
    reason?: string;
  };
  /** [P1 relevance v2] Kept but noticeably aged for its topic type — renderer warns readers. */
  stale?: boolean;
  retention?: { rawChars: number; cleanChars: number; removedChars: number };
}

/** Korean government / public-institution domains. Small, explicit list — no keyword guessing. */
const OFFICIAL_DOMAIN_SUFFIXES = ['go.kr', 'or.kr', 'korea.kr', 'ac.kr', 'gov'];

/** Korean news outlets + Naver's news sub-domains. */
const NEWS_DOMAINS = new Set([
  'n.news.naver.com', 'news.naver.com', 'entertain.naver.com', 'sports.naver.com',
  'chosun.com', 'joongang.co.kr', 'donga.com', 'hani.co.kr', 'khan.co.kr',
  'mk.co.kr', 'hankyung.com', 'yna.co.kr', 'newsis.com', 'news1.kr',
  'mt.co.kr', 'edaily.co.kr', 'etnews.com', 'segye.com', 'hankookilbo.com',
  'kmib.co.kr', 'seoul.co.kr', 'heraldcorp.com', 'ytn.co.kr', 'sbs.co.kr',
  'imbc.com', 'kbs.co.kr',
]);

const BLOG_DOMAINS = new Set(['blog.naver.com', 'tistory.com', 'brunch.co.kr', 'velog.io']);

const COMMUNITY_DOMAINS = new Set([
  'kin.naver.com', 'cafe.naver.com', 'dcinside.com', 'fmkorea.com', 'instiz.net', 'theqoo.net',
]);

/** [P1 relevance v2] Exported for reuse by sourceName.ts / sourceDocumentRender.ts. */
export function extractHostname(url: string): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    // Not a full URL (e.g. a bare domain from a legacy bundle) — best effort.
    return raw.toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0];
  }
}

function matchesDomainSet(hostname: string, set: Set<string>): boolean {
  if (set.has(hostname)) return true;
  for (const domain of set) {
    if (hostname.endsWith(`.${domain}`)) return true;
  }
  return false;
}

function matchesDomainSuffix(hostname: string, suffixes: string[]): boolean {
  return suffixes.some((suf) => hostname === suf || hostname.endsWith(`.${suf}`));
}

/** Best-effort source tier from a URL. Falls back to sourceType when the URL is missing/unusable. */
export function classifySourceTier(url: string, sourceType?: SourceKind): SourceTier {
  const hostname = extractHostname(url);
  if (!hostname) {
    if (sourceType === 'official') return 'OFFICIAL';
    if (sourceType === 'news') return 'NEWS';
    if (sourceType === 'blog') return 'BLOG';
    if (sourceType === 'kin') return 'COMMUNITY';
    return 'UNKNOWN';
  }
  if (matchesDomainSuffix(hostname, OFFICIAL_DOMAIN_SUFFIXES)) return 'OFFICIAL';
  if (matchesDomainSet(hostname, NEWS_DOMAINS)) return 'NEWS';
  if (matchesDomainSet(hostname, BLOG_DOMAINS)) return 'BLOG';
  if (matchesDomainSet(hostname, COMMUNITY_DOMAINS)) return 'COMMUNITY';
  return 'UNKNOWN';
}

/** Human-readable outlet/organization name for a URL, for attribution ("~에 따르면"). */
export function deriveSourceName(url: string, title?: string): string {
  const hostname = extractHostname(url);
  if (!hostname) return title ? title.slice(0, 20) : '알 수 없는 출처';
  if (hostname === 'blog.naver.com') return '네이버 블로그';
  if (hostname === 'cafe.naver.com') return '네이버 카페';
  if (hostname === 'kin.naver.com') return '네이버 지식iN';
  if (hostname === 'entertain.naver.com') return '네이버 연예';
  if (hostname === 'sports.naver.com') return '네이버 스포츠';
  if (hostname.endsWith('news.naver.com')) {
    const match = String(url ?? '').match(/\/article\/(\d{2,4})\//);
    return match ? `네이버 뉴스(${match[1]})` : '네이버 뉴스';
  }
  return hostname.replace(/^www\./, '');
}

/** 'S01', 'S02', ... 1-based index. */
export function makeSourceId(index: number): string {
  return `S${String(Math.max(1, index)).padStart(2, '0')}`;
}

// --- Legacy bundle parsing -------------------------------------------------
//
// [수치·조건·절차는 이 범위에서만 사용] bundle shape (src/sourceAssembler.ts:1892):
//   [tierNotice?]
//
//   === 사실 자료 (...) ===
//   ※ notice line
//   ※ notice line
//   [자료 1 — 제목]
//   <body>
//
//   [자료 2 — 제목]
//   <body>
//   ...
//
//   === 검색 결과 스니펫 (...) ===
//   <snippet text>
//
// URL-mode supplements (src/sourceAssembler.ts:7618,7672) append instead:
//   --- 참고 자료 (관련 상위글 N건) ---
//   [자료 1 — 제목]
//   <body>
//   ...
// or, when the supplement has no per-article headers, one opaque blob.

const DOC_HEADER_RE = /^\[자료\s*(\d+)\s*(?:[—-]\s*([^\]]*))?\]\s*$/;
const FACT_SECTION_RE = /^={3,}\s*사실\s*자료[^\n]*={3,}\s*$/;
const SNIPPET_SECTION_RE = /^={3,}\s*검색\s*결과\s*스니펫[^\n]*={3,}\s*$/;
const SUPPLEMENT_SECTION_RE = /^-{3,}\s*참고\s*자료[^\n]*-{3,}\s*$/;
/** buildFreshnessLabel() in sourceFreshness.ts: "[2026-09-20 작성 · 2일 전]" (optional trailing warning text). */
const FRESHNESS_DATE_RE = /^\[(\d{4}-\d{2}-\d{2})\s*작성[^\]]*\]/;

type BundleBoundaryKind = 'fact' | 'supplement' | 'snippet';
interface BundleBoundary { line: number; kind: BundleBoundaryKind; }

function findBundleBoundaries(lines: string[]): BundleBoundary[] {
  const boundaries: BundleBoundary[] = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (FACT_SECTION_RE.test(trimmed)) boundaries.push({ line: idx, kind: 'fact' });
    else if (SNIPPET_SECTION_RE.test(trimmed)) boundaries.push({ line: idx, kind: 'snippet' });
    else if (SUPPLEMENT_SECTION_RE.test(trimmed)) boundaries.push({ line: idx, kind: 'supplement' });
  });
  return boundaries;
}

function trimBlankEdges(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

/**
 * Parses the legacy bundle text into individual documents. Returns null when
 * no "[자료 N ...]" header is found at all — callers should fall back to
 * treating the text as one opaque blob (see stripSourceNoise's legacy path).
 */
export function parseLegacyMaterialBundle(
  text: string,
): { documents: SourceDocument[]; preamble: string; snippetSection: string } | null {
  const raw = String(text ?? '');
  if (!raw.trim()) return null;
  const lines = raw.split('\n');

  const docHeaders: { line: number; num: number; title: string }[] = [];
  lines.forEach((line, idx) => {
    const m = DOC_HEADER_RE.exec(line.trim());
    if (m) docHeaders.push({ line: idx, num: Number(m[1]), title: (m[2] ?? '').trim() });
  });
  if (docHeaders.length === 0) return null;

  const boundaries = findBundleBoundaries(lines);
  const firstDocLine = docHeaders[0].line;
  const preamble = lines.slice(0, firstDocLine).join('\n');

  const snippetBoundary = boundaries.find((b) => b.kind === 'snippet' && b.line > firstDocLine);
  const snippetSection = snippetBoundary ? lines.slice(snippetBoundary.line).join('\n') : '';
  const regionEndLine = snippetBoundary ? snippetBoundary.line : lines.length;

  // Nearest preceding boundary (fact/supplement) tells us which "section" a
  // doc header lives in — headers inside a URL-mode supplement are tagged
  // 'url' rather than the default 'unknown'.
  const isInSupplementSection = (line: number): boolean => {
    let nearestKind: BundleBoundaryKind | null = null;
    let nearestLine = -1;
    for (const b of boundaries) {
      if (b.kind === 'snippet') continue;
      if (b.line < line && b.line > nearestLine) {
        nearestLine = b.line;
        nearestKind = b.kind;
      }
    }
    return nearestKind === 'supplement';
  };

  const documents: SourceDocument[] = [];
  for (let i = 0; i < docHeaders.length; i += 1) {
    const cur = docHeaders[i];
    const nextLine = i + 1 < docHeaders.length ? docHeaders[i + 1].line : regionEndLine;
    const bodyLines = trimBlankEdges(lines.slice(cur.line + 1, nextLine));
    const body = bodyLines.join('\n');
    const dateMatch = FRESHNESS_DATE_RE.exec(body.trim());
    const pubDate = dateMatch ? dateMatch[1] : undefined;
    documents.push({
      id: makeSourceId(documents.length + 1),
      title: cur.title,
      sourceType: isInSupplementSection(cur.line) ? 'url' : 'unknown',
      sourceName: '',
      url: '',
      pubDate,
      dateStatus: pubDate ? 'KNOWN' : 'UNKNOWN_DATE',
      body,
      sourceTier: 'UNKNOWN',
    });
  }

  // Supplement sections with no "[자료 N ...]" headers of their own become a
  // single opaque document (e.g. a plain crawled blob appended by
  // fetchContentWithNaverFallback, sourceAssembler.ts:7618).
  const supplementLines = boundaries
    .filter((b) => b.kind === 'supplement' && b.line >= firstDocLine && b.line < regionEndLine)
    .map((b) => b.line);
  for (const suppLine of supplementLines) {
    const followingBoundaryLines = boundaries.filter((b) => b.line > suppLine).map((b) => b.line);
    const nextBoundaryLine = Math.min(regionEndLine, ...followingBoundaryLines, lines.length);
    const hasOwnHeaders = docHeaders.some((d) => d.line > suppLine && d.line < nextBoundaryLine);
    if (hasOwnHeaders) continue;
    const bodyLines = trimBlankEdges(lines.slice(suppLine + 1, nextBoundaryLine));
    const body = bodyLines.join('\n');
    if (!body.trim()) continue;
    const titleMatch = lines[suppLine].trim().match(/\(([^)]*)\)/);
    documents.push({
      id: makeSourceId(documents.length + 1),
      title: titleMatch ? titleMatch[1] : '참고 자료',
      sourceType: 'url',
      sourceName: '',
      url: '',
      dateStatus: 'UNKNOWN_DATE',
      body,
      sourceTier: 'UNKNOWN',
    });
  }

  return { documents, preamble, snippetSection };
}
