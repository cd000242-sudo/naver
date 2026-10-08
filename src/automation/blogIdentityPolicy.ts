/**
 * Which blog may the session probe accept for a Naver login?
 *
 * A Naver login ID can differ from the blog address (login tnqls6550- -> blog leader_248). Comparing the editor's blog with the
 * login ID therefore blocked every such user. The rules:
 *   - a CONFIGURED blog (a registered account names it) stays strict;
 *   - otherwise the first well-formed blog the editor confirms is LEARNED, and later runs compare against it;
 *   - a blog already owned by a different Naver ID is never learned (positive evidence of another account);
 *   - only an explicit user verification may replace a learned blog, and never a configured one.
 */
export const WELL_FORMED_BLOG_ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface BlogIdentityContext {
  /** Blog id read from the editor URL (may be missing or malformed). */
  observed: string | undefined;
  /** A registered account names this blog for the Naver ID. */
  configured?: string;
  /** Learned from an earlier editor sighting. */
  learned?: string;
  /** The user pressed [확인 후 재개]: the window being looked at may replace a learned blog. */
  allowRelearn: boolean;
  /** True when the (lower-case) blog is configured or learned for a DIFFERENT Naver ID. */
  claimedByOther: (blogId: string) => boolean;
}

export type BlogIdentityDecision =
  | { outcome: 'match' }
  | { outcome: 'learn'; blogId: string; replaced?: string }
  /** Positive evidence that the window holds another blog. `expected` is absent when this account has no known blog. */
  | { outcome: 'mismatch'; observed: string; expected: string | undefined }
  /** Missing or malformed identity: nothing is confirmed, nothing is learned. */
  | { outcome: 'unreadable' };

export function decideBlogIdentity(ctx: BlogIdentityContext): BlogIdentityDecision {
  if (typeof ctx.observed !== 'string' || !WELL_FORMED_BLOG_ID.test(ctx.observed)) return { outcome: 'unreadable' };
  const observed = ctx.observed.toLowerCase();
  const configured = ctx.configured?.toLowerCase();
  const learned = ctx.learned?.toLowerCase();
  if (configured) return observed === configured ? { outcome: 'match' } : { outcome: 'mismatch', observed, expected: configured };
  if (learned) {
    if (observed === learned) return { outcome: 'match' };
    if (ctx.allowRelearn && !ctx.claimedByOther(observed)) return { outcome: 'learn', blogId: observed, replaced: learned };
    return { outcome: 'mismatch', observed, expected: learned };
  }
  if (ctx.claimedByOther(observed)) return { outcome: 'mismatch', observed, expected: undefined };
  return { outcome: 'learn', blogId: observed };
}
