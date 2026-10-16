import { normalizePreviousPostCategoryId, type PreviousPostCandidate, type PreviousPostScope } from '../../shared/previousPostPolicy.js';

function validLookupScope(scope: PreviousPostScope): { blogId: string; categoryId: string } | null {
  const blogId = String(scope.blogId || '').trim().toLowerCase();
  const categoryId = normalizePreviousPostCategoryId(scope.categoryId);
  return /^[a-z0-9_-]{1,100}$/.test(blogId) && categoryId ? { blogId, categoryId } : null;
}

/** Public API evidence must identify each item's actual category, not merely the list's parent category. */
export function parseNaverPreviousPostCandidates(data: unknown, scope: PreviousPostScope, now = Date.now()): PreviousPostCandidate[] {
  const target = validLookupScope(scope);
  const response = data as { isSuccess?: boolean; result?: { categoryNo?: unknown; items?: unknown[] } };
  if (!target || response?.isSuccess !== true || !Array.isArray(response.result?.items)
    || normalizePreviousPostCategoryId(response.result.categoryNo) !== target.categoryId) {
    throw new Error('PREVIOUS_POST_RESPONSE_INVALID');
  }
  return response.result.items.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    const postId = normalizePreviousPostCategoryId(item.logNo);
    const timestamp = typeof item.addDate === 'number' ? item.addDate : NaN;
    if (!postId || String(item.domainIdOrBlogId || '').toLowerCase() !== target.blogId
      || normalizePreviousPostCategoryId(item.categoryNo) !== target.categoryId
      || item.allOpenPost !== true || item.categoryOpenYn !== true
      || item.postBlocked === true || item.categoryBlockYn === true || item.notOpen === true
      || item.buddyOpen === true || item.bothBuddyOpen === true
      || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) return [];
    return [{
      id: `naver:${target.blogId}:${postId}`,
      title: String(item.titleWithInspectMessage || '').trim() || '이전 글 보기',
      publishedUrl: `https://blog.naver.com/${target.blogId}/${postId}`,
      publishedBlogId: target.blogId,
      publishedCategoryId: target.categoryId,
      publishedAt: new Date(timestamp).toISOString(),
      publishMode: 'publish',
      isPublished: true,
    }];
  });
}

/** Retry a transient API failure or confirm an empty index before declaring that no history exists. */
async function withLookupRecovery<T>(lookup: () => Promise<T>, isEmpty: (value: T) => boolean = () => false): Promise<T> {
  try {
    const value = await lookup();
    if (!isEmpty(value)) return value;
  } catch {
    // The final attempt propagates its error; a failed confirmation is never an empty history.
  }
  await new Promise(resolve => setTimeout(resolve, 350));
  return lookup();
}

/** Read fresh public history immediately before publishing; failures remain visible to the caller. */
export async function fetchNaverPreviousPostCandidates(
  scope: PreviousPostScope,
  options: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<PreviousPostCandidate[]> {
  const target = validLookupScope(scope);
  if (!target) return [];
  return withLookupRecovery(() => fetchPreviousPostPages(target, options), candidates => candidates.length === 0);
}

async function fetchPreviousPostPages(
  target: { blogId: string; categoryId: string },
  options: { fetchImpl?: typeof fetch; now?: number },
): Promise<PreviousPostCandidate[]> {
  const url = new URL(`https://m.blog.naver.com/api/blogs/${target.blogId}/post-list`);
  const signal = AbortSignal.timeout(8000);
  for (let page = 1; page <= 10; page += 1) {
    url.search = new URLSearchParams({ categoryNo: target.categoryId, itemCount: '30', page: String(page) }).toString();
    const response = await (options.fetchImpl || fetch)(url.href, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.blog.naver.com/' + target.blogId, Accept: 'application/json', 'Cache-Control': 'no-cache' },
      redirect: 'error', signal,
    });
    if (!response.ok) throw new Error('PREVIOUS_POST_HTTP_' + response.status);
    const data = await response.json();
    const candidates = parseNaverPreviousPostCandidates(data, target, options.now ?? Date.now());
    // Parent-category lists include child posts. Continue until the first exact-category post.
    if (candidates.length || data.result.items.length < 30) return candidates;
  }
  throw new Error('PREVIOUS_POST_LOOKUP_LIMIT');
}

/** Upgrade name-only account settings using this blog's authoritative category list; ambiguous names stay unknown. */
export async function resolveNaverPreviousPostCategoryId(
  scope: PreviousPostScope,
  categoryName: unknown,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<string | undefined> {
  const known = normalizePreviousPostCategoryId(scope.categoryId);
  if (known) return known;
  const blogId = String(scope.blogId || '').trim().toLowerCase();
  const name = actualCategoryLabel(categoryName);
  if (!/^[a-z0-9_-]{1,100}$/.test(blogId) || !name) return undefined;
  return withLookupRecovery(() => fetchPreviousPostCategoryId(blogId, name, options));
}

async function fetchPreviousPostCategoryId(blogId: string, name: string, options: { fetchImpl?: typeof fetch }): Promise<string | undefined> {
  const response = await (options.fetchImpl || fetch)(`https://m.blog.naver.com/api/blogs/${blogId}/category-list`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: `https://m.blog.naver.com/${blogId}`, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`PREVIOUS_CATEGORY_HTTP_${response.status}`);
  const data = await response.json();
  if (data?.isSuccess !== true || !data.result || typeof data.result !== 'object') throw new Error('PREVIOUS_CATEGORY_RESPONSE_INVALID');
  const matches = new Set<string>();
  const visit = (items: unknown, depth = 0): void => {
    if (!Array.isArray(items) || depth > 10) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const id = normalizePreviousPostCategoryId(item.categoryNo);
      if (id && item.openYN !== false && !item.categoryBlocked && !item.divisionLine && actualCategoryLabel(item.categoryName) === name) matches.add(id);
      visit(item.childCategoryList, depth + 1);
    }
  };
  visit(data.result.mylogCategoryList);
  visit(data.result.boardCategoryList);
  return matches.size === 1 ? [...matches][0] : undefined;
}

function actualCategoryLabel(value: unknown): string {
  return String(value || '').replace(/[└├│─]+/g, '').replace(/하위\s*카테고리/g, '').replace(/\s+/g, ' ').trim();
}
