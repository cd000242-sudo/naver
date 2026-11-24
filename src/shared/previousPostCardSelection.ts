import { normalizePreviousPostCategoryId, parsePreviousPostUrl, type PreviousPostCandidate, type PreviousPostScope } from './previousPostPolicy.js';

/** Why a card took its slot; useful for logs and tests. */
export type PreviousPostCardReason = 'pinned' | 'related' | 'popular' | 'latest';

export interface PreviousPostCardPick {
  readonly url: string;
  readonly title: string;
  readonly categoryId?: string;
  readonly reason: PreviousPostCardReason;
  readonly candidate: PreviousPostCandidate;
}

export interface PreviousPostCardSelectionInput {
  readonly candidates: readonly PreviousPostCandidate[];
  readonly scope: PreviousPostScope;
  readonly title?: string;
  readonly keywords?: readonly string[];
  readonly excludePostId?: string;
  /** Card URLs attached to recent posts, most recent first. */
  readonly recentUrls?: readonly string[];
  /** A card the owner chose explicitly; it always takes the first slot. */
  readonly pinned?: PreviousPostCandidate;
  readonly count?: number;
  readonly now?: number;
}

type SlotKind = 'related' | 'popular';

/** Two related posts keep the reader on the topic; one popular post shows the blog's strongest content. */
const SLOT_PLAN: readonly SlotKind[] = ['related', 'related', 'popular'];
export const MAX_PREVIOUS_POST_CARDS = SLOT_PLAN.length;

/** Longest ending (in characters) still treated as a particle, e.g. "아이폰" vs "아이폰을" or "배터리까지". */
const MAX_PARTICLE_SUFFIX = 2;

interface Entry {
  readonly candidate: PreviousPostCandidate;
  readonly key: string;
  readonly url: string;
  readonly title: string;
  readonly categoryId?: string;
  readonly sameCategory: boolean;
  readonly publishedMs: number;
  readonly relevance: number;
  readonly popularity: number;
  /** Position in recentUrls (0 = attached most recently); -1 when never attached recently. */
  readonly recentRank: number;
}

export function tokenizeForRelevance(text: unknown): string[] {
  const tokens = String(text || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || [];
  return [...new Set(tokens.filter(token => token.length >= 2))];
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 2 && longer.startsWith(shorter) && longer.length - shorter.length <= MAX_PARTICLE_SUFFIX;
}

/** Number of query words that also appear in the candidate title. */
export function relevanceScore(queryTokens: readonly string[], title: unknown): number {
  const titleTokens = tokenizeForRelevance(title);
  return queryTokens.filter(query => titleTokens.some(token => tokensMatch(query, token))).length;
}

/**
 * Public likes plus comments. Both are reader actions on the same public list;
 * read counts are not exposed by the list API, so they are not used.
 */
export function popularityScore(candidate: { sympathyCount?: number; commentCount?: number }): number {
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return count(candidate.sympathyCount) + count(candidate.commentCount);
}

function postKey(url: unknown): string | undefined {
  const parsed = parsePreviousPostUrl(url);
  return parsed ? `${parsed.blogId}:${parsed.postId}` : undefined;
}

function buildEntries(input: PreviousPostCardSelectionInput, blogId: string, categoryId: string | undefined, now: number): Entry[] {
  const queryTokens = tokenizeForRelevance([input.title, ...(input.keywords || [])].join(' '));
  const recentKeys = (input.recentUrls || []).map(postKey);
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const candidate of Array.isArray(input.candidates) ? input.candidates : []) {
    if (!candidate || (input.excludePostId && candidate.id === input.excludePostId)) continue;
    if (candidate.isPublished === false || candidate.publishMode !== 'publish') continue;
    const publishedMs = Date.parse(candidate.publishedAt || '');
    const parsed = parsePreviousPostUrl(candidate.publishedUrl);
    const key = postKey(candidate.publishedUrl);
    const candidateCategory = normalizePreviousPostCategoryId(candidate.publishedCategoryId);
    if (!parsed || !key || parsed.blogId !== blogId || String(candidate.publishedBlogId || '').toLowerCase() !== blogId) continue;
    if (!candidateCategory || !Number.isFinite(publishedMs) || publishedMs > now || seen.has(key)) continue;
    seen.add(key);
    entries.push({
      candidate, key,
      url: String(candidate.publishedUrl).trim(),
      title: String(candidate.title || '').trim() || '이전 글 보기',
      categoryId: candidateCategory,
      sameCategory: candidateCategory === categoryId,
      publishedMs,
      relevance: relevanceScore(queryTokens, candidate.title),
      popularity: popularityScore(candidate),
      recentRank: recentKeys.indexOf(key),
    });
  }
  return entries;
}

function bySlot(kind: SlotKind) {
  return (a: Entry, b: Entry): number => {
    const primary = kind === 'related' ? b.relevance - a.relevance : b.popularity - a.popularity;
    return primary || b.publishedMs - a.publishedMs || a.key.localeCompare(b.key);
  };
}

/** Fresh same-category → fresh other-category → recently used same-category → recently used other-category. */
function tiersOf(pool: readonly Entry[]): Entry[][] {
  const fresh = pool.filter(entry => entry.recentRank < 0);
  const used = pool.filter(entry => entry.recentRank >= 0);
  return [
    fresh.filter(entry => entry.sameCategory), fresh.filter(entry => !entry.sameCategory),
    used.filter(entry => entry.sameCategory), used.filter(entry => !entry.sameCategory),
  ];
}

function pickForSlot(pool: readonly Entry[], kind: SlotKind): { entry: Entry; reason: PreviousPostCardReason } | null {
  const tier = tiersOf(pool).find(list => list.length > 0);
  if (!tier) return null;
  const compare = bySlot(kind);
  // Recently used cards come back oldest-first, so the same card does not return on consecutive posts.
  const sorted = [...tier].sort((a, b) => (a.recentRank >= 0 ? b.recentRank - a.recentRank : 0) || compare(a, b));
  const entry = sorted[0];
  const score = kind === 'related' ? entry.relevance : entry.popularity;
  return { entry, reason: score > 0 ? kind : 'latest' };
}

function toPick(entry: Entry, reason: PreviousPostCardReason): PreviousPostCardPick {
  return { url: entry.url, title: entry.title, categoryId: entry.categoryId, reason, candidate: entry.candidate };
}

/**
 * Deterministic card choice for the end of a post: two related posts and one popular post,
 * same category first, avoiding cards attached to recent posts while alternatives exist.
 */
export function selectPreviousPostCards(input: PreviousPostCardSelectionInput): PreviousPostCardPick[] {
  const blogId = String(input.scope?.blogId || '').trim().toLowerCase();
  const categoryId = normalizePreviousPostCategoryId(input.scope?.categoryId);
  const now = input.now ?? Date.now();
  const count = Math.max(0, Math.min(MAX_PREVIOUS_POST_CARDS, Math.floor(input.count ?? MAX_PREVIOUS_POST_CARDS)));
  if (!/^[a-z0-9_-]+$/.test(blogId) || !Number.isFinite(now) || count === 0) return [];

  const entries = buildEntries(input, blogId, categoryId, now);
  const picks: PreviousPostCardPick[] = [];
  const taken = new Set<string>();
  const pinnedKey = postKey(input.pinned?.publishedUrl);
  const pinnedParsed = parsePreviousPostUrl(input.pinned?.publishedUrl);
  let slots = SLOT_PLAN.slice(0, count);
  if (input.pinned && pinnedKey && pinnedParsed?.blogId === blogId) {
    const pinnedEntry = entries.find(entry => entry.key === pinnedKey);
    picks.push(pinnedEntry ? toPick(pinnedEntry, 'pinned') : {
      url: String(input.pinned.publishedUrl).trim(),
      title: String(input.pinned.title || '').trim() || '이전 글 보기',
      categoryId: normalizePreviousPostCategoryId(input.pinned.publishedCategoryId),
      reason: 'pinned', candidate: input.pinned,
    });
    taken.add(pinnedKey);
    slots = SLOT_PLAN.slice(1, count);
  }
  for (const kind of slots) {
    let pool = entries.filter(entry => !taken.has(entry.key));
    // The first card doubles as the legacy same-category previous post.
    if (picks.length === 0 && pool.some(entry => entry.sameCategory)) pool = pool.filter(entry => entry.sameCategory);
    const chosen = pickForSlot(pool, kind);
    if (!chosen) break;
    taken.add(chosen.entry.key);
    picks.push(toPick(chosen.entry, chosen.reason));
  }
  return picks;
}
