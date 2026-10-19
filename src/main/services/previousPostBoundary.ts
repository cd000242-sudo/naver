import { applyPreviousPostPolicy, parsePreviousPostUrl, normalizePreviousPostCategoryId, type PreviousPostCandidate, type PreviousPostScope } from '../../shared/previousPostPolicy.js';

export interface PublicationDestination { blogId: string; categoryId?: string }
export interface ScheduledPublicationSnapshot {
  blogId?: string;
  categoryId?: string;
  categoryName?: string;
  ctaType?: string;
  ctaUrl?: string;
  ctaLink?: string;
  ctaText?: string;
  ctas?: any[];
  ctaPosition?: string;
  skipCta?: boolean;
  previousPostUrl?: string;
  previousPostTitle?: string;
  previousPostCandidate?: PreviousPostCandidate;
  previousPostSelection?: 'auto' | 'manual';
  previousPostRequestedUrl?: string;
}

/** Only runtime-confirmed category identity can become published history. */
export function publicationCompletion(
  result: { url?: string; publicationDestination?: PublicationDestination },
  payload: { postId?: string; publishMode?: 'draft' | 'publish' | 'schedule'; blogId?: string; categoryId?: string },
): { postId?: string; publishMode: 'draft' | 'publish' | 'schedule'; publicationDestination?: PublicationDestination } {
  const actual = parsePreviousPostUrl(result.url);
  const confirmed = result.publicationDestination;
  const categoryId = actual && confirmed?.blogId?.trim().toLowerCase() === actual.blogId
    ? normalizePreviousPostCategoryId(confirmed.categoryId) : undefined;
  return {
    postId: payload.postId,
    publishMode: payload.publishMode || 'publish',
    publicationDestination: actual ? { blogId: actual.blogId, ...(categoryId ? { categoryId } : {}) } : undefined,
  };
}

/** Copy the publication settings independently of the mutable editor and content-topic classification. */
export function snapshotScheduledPublication(input: ScheduledPublicationSnapshot): ScheduledPublicationSnapshot {
  const keys: Array<keyof ScheduledPublicationSnapshot> = [
    'blogId', 'categoryId', 'categoryName', 'ctaType', 'ctaUrl', 'ctaLink', 'ctaText', 'ctas',
    'ctaPosition', 'skipCta', 'previousPostUrl', 'previousPostTitle', 'previousPostCandidate',
    'previousPostSelection', 'previousPostRequestedUrl',
  ];
  return Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key,
    Array.isArray(input[key]) ? input[key].map((value: any) => ({ ...value }))
      : typeof input[key] === 'object' && input[key] !== null ? { ...input[key] as object } : input[key],
  ]));
}


export function enforcePreviousPostScope<T extends Record<string, any>>(payload: T, scope: PreviousPostScope): T {
  if (payload.ctaType !== 'previous-post' && !payload.previousPostSelection && !payload.previousPostUrl && !payload.previousPostRequestedUrl) {
    const { previousPostCandidate: _unused, ...plain } = payload;
    return plain as T;
  }
  const candidate = payload.previousPostCandidate;
  return applyPreviousPostPolicy(payload, candidate ? [candidate] : [], scope);
}

/** Re-evaluate automatic links at execution: a month of queued posts is not a month of published posts. */
export function resolveDuePreviousPost<T extends Record<string, any>>(
  payload: T, candidates: readonly PreviousPostCandidate[], scope: PreviousPostScope,
): T {
  if (payload.ctaType !== 'previous-post' && !payload.previousPostSelection && !payload.previousPostUrl && !payload.previousPostRequestedUrl) return payload;
  return applyPreviousPostPolicy(payload, candidates, scope);
}
