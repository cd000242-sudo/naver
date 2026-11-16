/**
 * Tracking-only keyword pick.
 *
 * Posts made without a URL and without a typed keyword (title-only posts, scheduled posts) never got a
 * search keyword, so the exposure tracker could only check whether their own title was indexed
 * (168 of 273 published posts, measured 2026-11-17). This picks one for EXPOSURE TRACKING ONLY:
 * the result is never fed back into generation.
 *
 * Only a keyword with measured monthly search volume is accepted. Without a volume lookup (no ad keys)
 * no model call is made at all — an unverified keyword would not count as a ranking measurement anyway.
 * Every failure means "no keyword": this step must never break a finished generation.
 */
import { resolveUrlModeKeyword, type UrlKeywordDeps } from './urlModeKeywordResolve.js';

export interface TrackingKeywordPick {
  readonly keyword: string;
  readonly decidedBy: 'search-volume';
}

export interface TrackingPickDeps {
  readonly inferCandidates: UrlKeywordDeps['inferCandidates'];
  readonly lookupVolume: UrlKeywordDeps['lookupVolume'];
}

/** Below this much text there is nothing to infer a search keyword from. */
const MIN_TEXT_CHARS = 200;
const DEFAULT_TIMEOUT_MS = 45_000;
/** The inference prompt only needs the gist; a long body is trimmed to keep the side call small. */
const MAX_TEXT_CHARS = 6000;

/** Collected source text when there is enough of it, otherwise the generated body. */
export function trackingPickText(source: unknown, generated: unknown): string {
  const raw = String((source as { rawText?: unknown } | null)?.rawText ?? '').trim();
  if (raw.length >= MIN_TEXT_CHARS) return raw;
  const bag = (generated ?? {}) as { bodyPlain?: unknown; body?: unknown; content?: unknown };
  return String(bag.bodyPlain ?? bag.body ?? bag.content ?? '').trim();
}

export async function pickTrackingOnlyKeyword(
  text: string,
  title: string | undefined,
  deps: TrackingPickDeps,
  options: { timeoutMs?: number } = {},
): Promise<TrackingKeywordPick | null> {
  const body = String(text || '').trim();
  if (body.length < MIN_TEXT_CHARS || !deps.lookupVolume) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
    const pick = await Promise.race([
      resolveUrlModeKeyword(body.slice(0, MAX_TEXT_CHARS), title || undefined, {
        inferCandidates: deps.inferCandidates,
        lookupVolume: deps.lookupVolume,
      }),
      timeout,
    ]);
    if (!pick || !pick.keyword || pick.decidedBy !== 'search-volume') return null;
    return { keyword: pick.keyword, decidedBy: 'search-volume' };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
