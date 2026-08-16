// src/crawler/issueHarness/urlPolicy.ts
// Issue-mode URL policy: unlike the shopping filter (imageFilters.ts), news CDNs
// are ALLOWED here — celebrity/sports issue photos mostly live on news CDNs.
// Visible watermarks/captions are handled later by the Vision gate (R3),
// so this layer only blocks what a URL alone can prove is garbage.
// Deliberately NOT reusing filterDuplicateAndLowQualityImages: that list blocks
// imgnews.pstatic etc., and touching it would risk shopping-flow regressions.

/** Stock/watermark domains — always blocked regardless of mode. */
const STOCK_WATERMARK_PATTERNS = [
  'watermark', 'gettyimages', 'shutterstock', 'istockphoto', 'alamy.com',
  'dreamstime', '123rf.com', 'depositphotos', 'stock.adobe',
];

/** Non-photo UI garbage that a URL alone can prove. */
const UI_GARBAGE_PATTERNS = [
  '.svg', '.gif', 'data:image', 'sprite', 'spacer', '1x1',
  '/icon/', '/logo/', '/banner/', '_icon', '_logo', '_banner',
  'btn_', '_btn', 'button', 'arrow', 'emoji', 'emoticon',
  'placeholder', 'loading', 'blank.', 'noimage', 'no_image',
];

/** Tiny-size markers embedded in URLs. */
const TINY_SIZE_PATTERNS = [
  '50x50', '60x60', '80x80', '100x100', '120x120',
  'type=f40', 'type=f60', 'type=f80', 'type=f100',
  '_thumb.', '_small.',
];

/**
 * true when the URL must be excluded in issue mode.
 * News CDNs (imgnews.pstatic, dispatch 등) intentionally pass through.
 */
export function isIssueBlockedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  if (!/^https?:\/\//i.test(url)) return true;
  const lower = url.toLowerCase();
  for (const p of STOCK_WATERMARK_PATTERNS) {
    if (lower.includes(p)) return true;
  }
  for (const p of UI_GARBAGE_PATTERNS) {
    if (lower.includes(p)) return true;
  }
  for (const p of TINY_SIZE_PATTERNS) {
    if (lower.includes(p)) return true;
  }
  return false;
}

/**
 * Normalize a URL so the same photo served in different sizes/params dedupes.
 * (Perceptual pHash dedup lands in R3 — this is the cheap URL-level pass.)
 */
export function normalizeIssueUrl(url: string): string {
  return url
    .split('#')[0]
    .replace(/[?&]type=[a-z]\d+/gi, '')
    .replace(/[?&](w|h|width|height|size|quality|q)=\d+/gi, '')
    .replace(/_\d+x\d+(?=\.)/g, '')
    .replace(/-\d+x\d+(?=\.)/g, '')
    .replace(/\/\d+x\d+\//g, '/')
    .replace(/\?$/, '');
}

/** Filter + URL-level dedupe, preserving order. */
export function filterIssueCandidates<T extends { url: string }>(
  candidates: T[],
  cap: number,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const cand of candidates) {
    if (out.length >= cap) break;
    if (isIssueBlockedUrl(cand.url)) continue;
    const key = normalizeIssueUrl(cand.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cand);
  }
  return out;
}
