import { applyPreviousPostPolicy, normalizePreviousPostCategoryId, type PreviousPostCandidate, type PreviousPostScope } from '../../shared/previousPostPolicy.js';
import { getVerifiedRealBlogCategoryId } from './realBlogCategoryPolicy.js';

/** Capture identity once; callers must retain this snapshot through asynchronous generation. */
export function resolveRendererPublicationScope(payload: Record<string, any> = {}): PreviousPostScope {
  const host = typeof window !== 'undefined' ? window as any : {};
  const doc = typeof document !== 'undefined' ? document : undefined;
  const naverId = String(payload.naverId || (doc?.getElementById('naver-id') as HTMLInputElement | null)?.value || '').trim();
  const selected = host.currentMainAccountPublicationScope;
  const selectedBlogId = selected && selected.naverId === naverId ? selected.blogId : undefined;
  const explicitBlog = Object.prototype.hasOwnProperty.call(payload, 'blogId');
  const blogId = String((explicitBlog ? payload.blogId : selectedBlogId || naverId) || '').trim() || undefined;
  const categoryId = Object.prototype.hasOwnProperty.call(payload, 'categoryId')
    ? normalizePreviousPostCategoryId(payload.categoryId)
    : explicitBlog ? undefined : getVerifiedRealBlogCategoryId(doc?.getElementById('real-blog-category-select') as HTMLSelectElement | null);
  return { blogId, categoryId };
}

export function captureRendererPublicationScope<T extends Record<string, any>>(payload: T): T & PreviousPostScope {
  return { ...payload, ...resolveRendererPublicationScope(payload) };
}

/** History is optional enrichment; unreadable history must clear stale links, not block publishing. */
export function resolveRendererPreviousPostPayload<T extends Record<string, any>>(
  payload: T,
  readCandidates: () => readonly PreviousPostCandidate[],
) {
  const snapshot = captureRendererPublicationScope(payload);
  let candidates: readonly PreviousPostCandidate[] = [];
  try {
    candidates = readCandidates() || [];
  } catch (error) {
    console.warn('[PreviousPost] History unavailable; skipping previous-post links:', error);
  }
  return applyPreviousPostPolicy(snapshot, candidates, snapshot);
}

/** A generated previous-post URL remains automatic until the user edits the input. */
export function markAutomaticPreviousPostCta(input: HTMLInputElement, url: string): void {
  input.value = url;
  if (url.trim()) input.dataset.autoPreviousPostUrl = url.trim();
  else delete input.dataset.autoPreviousPostUrl;
  if (input.dataset.autoPreviousPostBound !== 'true') {
    const clearAutomaticOrigin = () => { delete input.dataset.autoPreviousPostUrl; };
    input.addEventListener('input', clearAutomaticOrigin);
    input.addEventListener('change', clearAutomaticOrigin);
    input.dataset.autoPreviousPostBound = 'true';
  }
}

export function isAutomaticPreviousPostCtaInput(input: HTMLInputElement | null | undefined): boolean {
  const value = String(input?.value || '').trim();
  return Boolean(value && input?.dataset.autoPreviousPostUrl === value);
}

export function readManualCtaLink(input: HTMLInputElement | null | undefined): string {
  return isAutomaticPreviousPostCtaInput(input) ? '' : String(input?.value || '').trim();
}
