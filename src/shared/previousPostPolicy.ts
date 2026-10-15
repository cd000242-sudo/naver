/** Publication identity used for previous-post links; content topic names are never identity. */
export interface PreviousPostScope {
  readonly blogId?: string;
  readonly categoryId?: string;
}

export interface PreviousPostCandidate {
  readonly id?: string;
  readonly title?: string;
  readonly publishedUrl?: string;
  readonly publishedBlogId?: string;
  readonly publishedCategoryId?: string;
  readonly publishedAt?: string;
  readonly publishMode?: string;
  readonly isPublished?: boolean;
}

export function normalizePreviousPostCategoryId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return undefined;
  const normalized = text.replace(/^0+/, '');
  return normalized || undefined;
}

function normalizePreviousPostBlogId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(id) ? id : undefined;
}

export function parsePreviousPostUrl(value: unknown): { blogId: string; postId: string } | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname.toLowerCase())) return null;
    if (url.searchParams.getAll('blogId').length > 1 || url.searchParams.getAll('logNo').length > 1) return null;
    const path = url.pathname.match(/^\/([a-z0-9_-]+)\/(\d+)\/?$/i);
    const view = /^\/PostView\.naver$/i.test(url.pathname);
    const blogId = normalizePreviousPostBlogId(path?.[1] || (view ? url.searchParams.get('blogId') : undefined));
    const postId = normalizePreviousPostCategoryId(path?.[2] || (view ? url.searchParams.get('logNo') : undefined));
    if (!blogId || !postId) return null;
    const queryBlog = url.searchParams.get('blogId');
    const queryPost = url.searchParams.get('logNo');
    if (queryBlog !== null && normalizePreviousPostBlogId(queryBlog) !== blogId) return null;
    if (queryPost !== null && normalizePreviousPostCategoryId(queryPost) !== postId) return null;
    return { blogId, postId };
  } catch {
    return null;
  }
}

function samePreviousPostUrl(left: unknown, right: unknown): boolean {
  const a = parsePreviousPostUrl(left);
  const b = parsePreviousPostUrl(right);
  return Boolean(a && b && a.blogId === b.blogId && a.postId === b.postId);
}

export function selectPreviousPost<T extends PreviousPostCandidate>(
  candidates: readonly T[],
  scope: PreviousPostScope,
  options: { excludePostId?: string; requestedUrl?: string; now?: number | Date } = {},
): T | null {
  const blogId = normalizePreviousPostBlogId(scope?.blogId);
  const categoryId = normalizePreviousPostCategoryId(scope?.categoryId);
  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  if (!blogId || !categoryId || !Number.isFinite(now) || !Array.isArray(candidates)) return null;
  const requested = options.requestedUrl?.trim();
  if (requested && !parsePreviousPostUrl(requested)) return null;
  const eligible = candidates.filter((candidate) => {
    if (!candidate || (options.excludePostId && candidate.id === options.excludePostId)) return false;
    if (candidate.isPublished === false || candidate.publishMode !== 'publish') return false;
    const published = Date.parse(candidate.publishedAt || '');
    const url = parsePreviousPostUrl(candidate.publishedUrl);
    return Number.isFinite(published) && published <= now && url?.blogId === blogId
      && normalizePreviousPostBlogId(candidate.publishedBlogId) === blogId
      && normalizePreviousPostCategoryId(candidate.publishedCategoryId) === categoryId
      && (!requested || samePreviousPostUrl(requested, candidate.publishedUrl));
  });
  return [...eligible].sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))[0] || null;
}

export interface PreviousPostPolicyFields {
  previousPostUrl?: string;
  previousPostTitle?: string;
  previousPostCandidate?: PreviousPostCandidate;
  previousPostSelection: 'auto' | 'manual';
  previousPostRequestedUrl?: string;
}

/** Keeps custom CTA content intact; only previous-post CTA fields follow this policy. */
export function applyPreviousPostPolicy<T extends Record<string, any>>(
  payload: T,
  candidates: readonly PreviousPostCandidate[],
  scope: PreviousPostScope,
): T & PreviousPostPolicyFields {
  const previousCta = payload.ctaType === 'previous-post';
  const existingUrl = String(payload.previousPostRequestedUrl || payload.previousPostUrl
    || (previousCta ? payload.ctaUrl || payload.ctaLink : '') || '').trim();
  const selection = payload.previousPostSelection === 'auto' ? 'auto'
    : payload.previousPostSelection === 'manual' || existingUrl ? 'manual' : 'auto';
  const requestedUrl = selection === 'manual' ? existingUrl : '';
  const selected = selection === 'manual' && !requestedUrl ? null : selectPreviousPost(candidates, scope, {
    excludePostId: payload.postId || payload.currentPostId,
    requestedUrl: requestedUrl || undefined,
  });
  const result: Record<string, any> = {
    ...payload,
    previousPostSelection: selection,
    previousPostRequestedUrl: selection === 'manual' ? requestedUrl : undefined,
  };
  delete result.previousPostUrl;
  delete result.previousPostTitle;
  delete result.previousPostCandidate;
  if (selected) {
    result.previousPostUrl = selected.publishedUrl;
    result.previousPostTitle = selected.title || '이전 글 보기';
    result.previousPostCandidate = { ...selected };
  }
  if (previousCta) {
    const previousLinks = [payload.previousPostRequestedUrl, payload.previousPostUrl, payload.ctaUrl, payload.ctaLink].filter(Boolean);
    const previousCtaEntry = (cta: any) => previousLinks.some((link) => String(cta?.link || '').trim() === String(link).trim() || samePreviousPostUrl(cta?.link, link))
      || cta?.type === 'previous-post' || cta?.ctaType === 'previous-post';
    delete result.ctaUrl;
    delete result.ctaLink;
    delete result.ctaText;
    if (Array.isArray(payload.ctas)) result.ctas = payload.ctas.filter((cta) => !previousCtaEntry(cta));
    if (selected) {
      result.ctaUrl = selected.publishedUrl;
      result.ctaLink = selected.publishedUrl;
      result.ctaText = `📖 추천 글: ${selected.title || '이전 글 보기'}`;
      result.ctas = [{ text: result.ctaText, link: selected.publishedUrl }, ...(result.ctas || [])];
    }
  }
  return result as T & PreviousPostPolicyFields;
}
