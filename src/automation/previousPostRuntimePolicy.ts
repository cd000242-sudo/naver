import { applyPreviousPostPolicy, normalizePreviousPostCategoryId, type PreviousPostCandidate, type PreviousPostScope } from '../shared/previousPostPolicy.js';

/** Read only Naver editor addresses after the account/editor readiness gate succeeded. */
export function readEditorBlogId(urls: readonly string[]): string | undefined {
  const identities = new Set<string>();
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (!['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) || url.username || url.password || url.port) continue;
      if (url.searchParams.getAll('blogId').length > 1) return undefined;
      const id = url.searchParams.get('blogId') || (url.searchParams.get('Redirect') === 'Write' ? /^\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] : undefined);
      if (id && /^[A-Za-z0-9_-]{1,100}$/.test(id)) identities.add(id.toLowerCase());
    } catch { /* Blank/browser-internal URLs carry no identity. */ }
  }
  return identities.size === 1 ? [...identities][0] : undefined;
}

export function guardRuntimePreviousPost<T extends Record<string, any>>(payload: T, editorUrls: readonly string[]): T {
  return applyPreviousPostPolicy(payload, payload.previousPostCandidate ? [payload.previousPostCandidate] : [], {
    blogId: readEditorBlogId(editorUrls),
    categoryId: payload.categoryName ? normalizePreviousPostCategoryId(payload.categoryId) : undefined,
  });
}

function categoryLabel(value: string): string {
  return String(value || '').replace(/[└├│─]+/g, '').replace(/하위\s*카테고리/g, '').replace(/\s+/g, ' ').trim();
}

/** An explicit ID must match the DOM identity; labels alone never establish the ID. */
export function matchPublicationCategory(targetId: unknown, targetName: string, item: { id?: string; name: string }): boolean {
  const id = normalizePreviousPostCategoryId(targetId);
  if (targetId && !id) return false;
  return (!id || normalizePreviousPostCategoryId(item.id) === id) && categoryLabel(item.name) === categoryLabel(targetName);
}

export function verifyCategorySelection(id: unknown, itemName: string, selectedName: string): string | undefined {
  return categoryLabel(itemName) === categoryLabel(selectedName) ? normalizePreviousPostCategoryId(id) : undefined;
}

/** Refresh automatic selection immediately before typing, after the actual editor identity is known. */
export async function refreshRuntimePreviousPost<T extends Record<string, any>>(
  payload: T,
  editorUrls: readonly string[],
  lookup: (scope: PreviousPostScope) => Promise<PreviousPostCandidate[]>,
  log: (message: string) => void = () => undefined,
  resolveCategory?: (scope: PreviousPostScope, categoryName: string) => Promise<string | undefined>,
): Promise<T> {
  const blogId = readEditorBlogId(editorUrls);
  let categoryId = payload.categoryName ? normalizePreviousPostCategoryId(payload.categoryId) : undefined;
  const requested = payload.ctaType === 'previous-post' || payload.previousPostSelection || payload.previousPostRequestedUrl || payload.previousPostUrl;
  if (requested && blogId && !categoryId && payload.categoryName && resolveCategory) {
    try {
      categoryId = normalizePreviousPostCategoryId(await resolveCategory({ blogId }, payload.categoryName));
    } catch {
      log('📎 실제 카테고리 ID 조회를 완료하지 못했습니다.');
    }
  }
  const resolvedPayload = { ...payload, categoryId };
  // Legacy renderer helpers also stamp auto on ordinary/custom CTA payloads.
  // Only the explicit previous-post mode promises that publication includes this link.
  const required = payload.ctaType === 'previous-post';
  if (required && (!blogId || !categoryId)) {
    throw Object.assign(new Error('[NETWORK_WAIT] 이전글을 연결할 블로그와 카테고리를 확인하지 못했습니다. 원고는 보존됐습니다. 계정과 카테고리를 확인한 뒤 다시 발행해 주세요.'), { code: 'PREVIOUS_POST_CATEGORY_UNCONFIRMED' });
  }
  const manual = payload.previousPostSelection === 'manual'
    || (payload.previousPostSelection !== 'auto' && Boolean(payload.previousPostRequestedUrl || payload.previousPostUrl));
  if (!requested || !blogId || !categoryId || (manual && String(payload.blogId || '').toLowerCase() === blogId)) {
    return guardRuntimePreviousPost(resolvedPayload, editorUrls);
  }
  try {
    const candidates = await lookup({ blogId, categoryId });
    // The public index can lag behind a confirmed publish in this queue.
    const mergedCandidates = resolvedPayload.previousPostCandidate
      ? [...candidates, resolvedPayload.previousPostCandidate] : candidates;
    return applyPreviousPostPolicy(resolvedPayload, mergedCandidates, { blogId, categoryId });
  } catch {
    const fallback = guardRuntimePreviousPost(resolvedPayload, editorUrls);
    if (required && !fallback.previousPostUrl) {
      throw Object.assign(new Error('[NETWORK_WAIT] 같은 블로그·카테고리의 이전글 조회를 완료하지 못했습니다. 원고는 보존됐습니다. 연결 상태를 확인한 뒤 다시 발행해 주세요.'), { code: 'PREVIOUS_POST_LOOKUP_UNAVAILABLE' });
    }
    log(fallback.previousPostUrl
      ? '📎 최신 이전 글 조회에 실패하여 같은 블로그·카테고리로 확인된 기존 글을 연결합니다.'
      : '📎 실제 블로그의 이전 글 조회에 실패하여 이전 글 연결을 생략합니다.');
    return fallback;
  }
}
