/**
 * Thumbnails of community posts (forum contract 1115, section A). The page makes one small JPEG from the FIRST picture
 * of a rich post and sends it next to the post; the server keeps it under the picture id `_thumb`. The numbers, the
 * quality retry and the decisions live here as pure code; the canvas itself is in communityThumbEncode.ts.
 */
import { fitWithin } from './communityImage.mjs';

export const THUMB_LIMITS = Object.freeze({
    /** Long side in pixels. */
    side: 360,
    quality: 0.7,
    retryQuality: 0.5,
    /** The most base64 characters the server takes for a thumbnail. */
    maxBase64: 40000,
});

/** The picture id the server files the thumbnail under. */
export const THUMB_ID = '_thumb';

const IMAGE_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** "/9j/" is the base64 form of the JPEG signature FF D8 FF. */
const THUMB_DATA = /^\/9j\/[A-Za-z0-9+/]*={0,2}$/;

/** An https address (parsed, so `javascript:` and relative text never pass); '' for anything else. */
function httpsUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
        const parsed = new URL(value.trim());
        return parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
        return '';
    }
}

/** Size after cutting the long side to 360; the shape is kept and a small picture is never enlarged. */
export const thumbSize = (width, height) => fitWithin(width, height, THUMB_LIMITS.side);

/** A picture id that is safe to put into an address: letters, digits, `_` and `-`, at most 40; else ''. */
export const normalizeThumbId = (value) => (typeof value === 'string' && IMAGE_ID.test(value) ? value : '');

/** Is this what the server accepts as a thumbnail: padded base64 of a JPEG, at most 40,000 characters. */
export function isThumbData(value) {
    return typeof value === 'string'
        && value.length >= 8
        && value.length <= THUMB_LIMITS.maxBase64
        && value.length % 4 === 0
        && THUMB_DATA.test(value);
}

/**
 * Encodes at 0.7 and, when the text is over 40,000 characters, once more at a lower quality; still over means no
 * thumbnail at all. `encode(quality)` resolves to the base64 text (or null). Never throws.
 */
export async function encodeThumbWithinBudget(encode) {
    for (const quality of [THUMB_LIMITS.quality, THUMB_LIMITS.retryQuality]) {
        let data;
        try {
            data = await encode(quality);
        } catch {
            return { ok: false };
        }
        if (typeof data !== 'string') return { ok: false };
        if (isThumbData(data)) return { ok: true, quality, data };
        // Over the length: try the lower quality. Anything else wrong (not a JPEG, no padding) will not get better.
        if (data.length <= THUMB_LIMITS.maxBase64) return { ok: false };
    }
    return { ok: false };
}

/** The id of the first picture block of a rich post ('' when there is none). */
export function firstImageId(blocks) {
    for (const block of Array.isArray(blocks) ? blocks : []) {
        if (block && block.t === 'img' && normalizeThumbId(block.id)) return block.id;
    }
    return '';
}

/**
 * Where the thumbnail of this send comes from:
 *   none      send no `thumb` (no picture; or the stored one is still right; or nothing can be read)
 *   attached  the first picture was just added in this editor: its bytes are in the page
 *   server    the first picture is an old one of the post being edited: read it back from the server first
 * A new post has no post id, so a picture that is not attached cannot be fetched and is not guessed at.
 */
export function planThumb({ blocks, attachedIds = [], editingPostId = '', originalFirstId = '', hadThumb = false }) {
    const id = firstImageId(blocks);
    if (!id) return { action: 'none' };
    if (attachedIds.includes(id)) return { action: 'attached', id };
    if (!editingPostId) return { action: 'none' };
    if (id === originalFirstId && hadThumb) return { action: 'none' };
    return { action: 'server', id };
}

/** What a list row draws: our own picture (the stored thumbnail or the first picture) or an https address. */
export function pickRowThumb(item) {
    const id = normalizeThumbId(item?.thumbId);
    if (id) return { has: true, id, url: '' };
    const url = httpsUrl(item?.thumbUrl);
    return url ? { has: true, id: '', url } : { has: false, id: '', url: '' };
}
