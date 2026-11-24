import {
  applyPreviousPostPolicy,
  normalizePreviousPostCategoryId,
  parsePreviousPostUrl,
  type PreviousPostCandidate,
  type PreviousPostScope,
} from '../shared/previousPostPolicy.js';
import { selectPreviousPostCards, type PreviousPostCardPick } from '../shared/previousPostCardSelection.js';

/** Optional extra sources; without them the payload keeps exactly one previous-post card. */
export interface RuntimePreviousPostCardSources {
  readonly lookupBlogWide?: (blogId: string) => Promise<PreviousPostCandidate[]>;
  readonly readRecentCardUrls?: (blogId: string) => readonly string[] | Promise<readonly string[]>;
  readonly count?: number;
}

export interface PreviousPostCardLink {
  readonly url: string;
  readonly title: string;
}

interface AttachContext {
  readonly blogId?: string;
  /** Same-category candidates already fetched by the single selection; undefined when not fetched or failed. */
  readonly sameCategory?: PreviousPostCandidate[];
  readonly lookup: (scope: PreviousPostScope) => Promise<PreviousPostCandidate[]>;
  readonly log: (message: string) => void;
  readonly sources?: RuntimePreviousPostCardSources;
}

function samePost(a: unknown, b: unknown): boolean {
  const left = parsePreviousPostUrl(a);
  const right = parsePreviousPostUrl(b);
  return Boolean(left && right && left.blogId === right.blogId && left.postId === right.postId);
}

async function orFallback<V>(read: () => V | Promise<V>, fallback: V): Promise<V> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function collectKeywords(payload: Record<string, any>): string[] {
  const values = [payload.keyword, ...(Array.isArray(payload.keywords) ? payload.keywords : [payload.keywords]),
    ...(Array.isArray(payload.hashtags) ? payload.hashtags : [])];
  return values.map(value => String(value || '').replace(/^#/, '').trim()).filter(Boolean);
}

function summarize(picks: readonly PreviousPostCardPick[]): string {
  const count = (reason: string) => picks.filter(pick => pick.reason === reason).length;
  return `관련 ${count('related')} · 인기 ${count('popular')} · 최신 ${count('latest')}${count('pinned') ? ' · 직접 선택 1' : ''}`;
}

/**
 * Adds previousPostCards (max 3) after the single selection. The first card always equals
 * previousPostUrl so legacy fields, CTA mirroring and validation keep working unchanged.
 */
export async function attachRuntimePreviousPostCards<T extends Record<string, any>>(payload: T, ctx: AttachContext): Promise<T> {
  // Cards are never trusted from upstream; they are rebuilt from verified candidates here.
  const { previousPostCards: _upstream, ...clean } = payload as Record<string, any>;
  const firstUrl = String(clean.previousPostUrl || '').trim();
  if (!firstUrl) return clean as T;
  const single = { ...clean, previousPostCards: [{ url: firstUrl, title: String(clean.previousPostTitle || '이전 글 보기') }] } as unknown as T;
  const categoryId = normalizePreviousPostCategoryId(clean.categoryId);
  const blogId = ctx.blogId;
  if (!ctx.sources || !blogId || !categoryId || parsePreviousPostUrl(firstUrl)?.blogId !== blogId) return single;

  const scope = { blogId, categoryId };
  const manual = clean.previousPostSelection === 'manual';
  const sameCategory = ctx.sameCategory ?? (manual ? await orFallback(() => ctx.lookup(scope), undefined) : undefined);
  // Same-category lookup failed (verified fallback in use): keep the single verified card.
  if (!sameCategory) return single;
  const { lookupBlogWide, readRecentCardUrls, count } = ctx.sources;
  const blogWide = lookupBlogWide ? await orFallback(() => lookupBlogWide(blogId), [] as PreviousPostCandidate[]) : [];
  const recentUrls = readRecentCardUrls ? await orFallback(() => readRecentCardUrls(blogId), [] as readonly string[]) : [];
  const verifiedFirst = clean.previousPostCandidate as PreviousPostCandidate | undefined;
  const picks = selectPreviousPostCards({
    candidates: [...sameCategory, ...(verifiedFirst ? [verifiedFirst] : []), ...blogWide],
    scope,
    title: clean.title,
    keywords: collectKeywords(clean),
    excludePostId: clean.postId || clean.currentPostId,
    recentUrls,
    pinned: manual ? verifiedFirst || { publishedUrl: firstUrl, title: clean.previousPostTitle } : undefined,
    count,
  });
  if (picks.length === 0) return single;

  let base: Record<string, any> = clean;
  if (!samePost(picks[0].url, firstUrl)) {
    // Re-run the legacy policy on the new first card so CTA and legacy fields follow it.
    base = applyPreviousPostPolicy(clean, [picks[0].candidate], scope);
    if (!samePost(base.previousPostUrl, picks[0].url)) return single;
  }
  ctx.log(`📎 글 끝 이전글 카드 ${picks.length}개를 고릅니다 (${summarize(picks)}).`);
  const cards: PreviousPostCardLink[] = picks.map(pick => ({ url: pick.url, title: pick.title }));
  return { ...base, previousPostCards: cards } as unknown as T;
}
