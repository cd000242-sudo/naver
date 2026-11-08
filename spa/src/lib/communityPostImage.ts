/**
 * One picture of a post, fetched when it comes into view (forum contract 1114 §3). The answer is a base64 JPEG that
 * becomes a data address for <img>; anything that is not a JPEG shows nothing. Pictures are kept in memory for this
 * visit only (a few at a time), never in storage. No token is sent: the address says which picture, and a hidden or
 * deleted post answers NOT_FOUND.
 */
import { COMMUNITY_ACTIONS } from './communityContract.mjs';
import { toJpegDataUrl } from './communityImage.mjs';
import { GAS_URL } from './siteOps';

export type PostImageResult = { ok: true; src: string } | { ok: false; message: string };

const TIMEOUT_MS = 20000;
const KEEP = 24;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const remembered = new Map<string, string>();
const failed = (message = '사진을 불러오지 못했어요.'): PostImageResult => ({ ok: false, message });

export function clearPostImageCache(): void {
    remembered.clear();
}

/** The picture `imageId` of post `postId` as an address an <img> can show. Never throws. */
export async function fetchPostImage(postId: string, imageId: string): Promise<PostImageResult> {
    if (!ID.test(postId) || !ID.test(imageId)) return failed();
    const key = `${postId}:${imageId}`;
    const known = remembered.get(key);
    if (known) return { ok: true, src: known };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const url = `${GAS_URL}?action=${COMMUNITY_ACTIONS.postImage}&postId=${encodeURIComponent(postId)}&imageId=${encodeURIComponent(imageId)}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const payload = JSON.parse(await response.text()) as Record<string, unknown>;
        const src = payload.ok === true ? toJpegDataUrl(payload.mime, payload.data) : '';
        if (!src) return failed();
        remembered.set(key, src);
        if (remembered.size > KEEP) remembered.delete(remembered.keys().next().value as string);
        return { ok: true, src };
    } catch {
        return failed();
    } finally {
        window.clearTimeout(timer);
    }
}
