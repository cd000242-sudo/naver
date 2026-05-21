/**
 * Shopping image URL utilities — pure, browser-independent helpers.
 * @module crawler/shopping/utils/imageUrlUtils
 *
 * Extracted from BrandStoreProvider / SmartStoreProvider where these three
 * functions were byte-identical inline closures. Centralizing them removes
 * duplication and gives the regression-prone URL logic a unit-tested home.
 */

/** Normalize a URL by stripping the query string (used for dedup keys). */
export function normalizeUrl(u: string): string {
    return u.split('?')[0];
}

/**
 * Upscale a small Naver CDN image URL to a verified high-resolution type.
 *
 * [v2.10.314 BUG FIX] `type=f860` returns HTTP 404 on the Naver CDN — it is
 * an invalid type parameter. Verified: `?type=o1000` returns 200 OK (1000px
 * original-grade image). Only thumbnails under 500px are upscaled; larger
 * images (e.g. `m1000_pd`) are left untouched.
 */
export function upscaleUrl(u: string): string {
    const typeMatch = u.match(/\?type=([a-z])(\d+)/);
    if (typeMatch) {
        const size = parseInt(typeMatch[2]);
        if (size < 500) {
            return u.replace(/\?type=[a-z]\d+[^&]*/, '?type=o1000');
        }
    }
    return u;
}

/** Junk/UI image patterns rejected before a URL is collected. */
const JUNK_PATTERNS = [
    'logo', 'icon', 'searchad-phinf', 'button', 'emoji',
    'storefront', 'sprite', '1x1', 'gnb_', 'favicon',
    'video-phinf', 'ssl.pstatic.net/static', 'placeholder',
    'ncpt.naver.com', 'nid.naver.com',
    'banner', 'member', 'npay', 'npoint', 'badge', 'arrow',
];

/**
 * Return true when a URL is not a real product image (UI element, ad,
 * tracking pixel, data URI, or a GIF/SVG which is almost always a UI asset).
 */
export function isJunkUrl(src: string): boolean {
    if (!src || !src.startsWith('http')) return true;
    if (src.startsWith('data:')) return true;
    const lower = src.toLowerCase();
    if (JUNK_PATTERNS.some(p => lower.includes(p))) return true;
    if (lower.endsWith('.gif') || lower.endsWith('.svg')) return true;
    return false;
}
