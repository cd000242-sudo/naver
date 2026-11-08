/**
 * The thumbnail of a list row, fetched when the row comes near the screen (forum contract 1115 section A). Same answer
 * as a post picture (`community-post-image`: base64 JPEG), but a list can hold many rows, so: at most four requests at
 * a time, one request for a picture however many rows ask, and the result kept in memory for this visit only.
 * Nothing is written to storage and no token is sent (reading a picture needs no login).
 */
import { COMMUNITY_ACTIONS } from './communityContract.mjs';
import { toJpegDataUrl } from './communityImage.mjs';
import { createLimiter, createLru } from './communityLimiter.mjs';
import { GAS_URL } from './siteOps';

export type ThumbResult = { ok: true; src: string } | { ok: false };

const TIMEOUT_MS = 20000;
const PARALLEL = 4;
const KEEP = 150;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FAILED: ThumbResult = { ok: false };
const limiter = createLimiter(PARALLEL);
const remembered = createLru<string>(KEEP);
const inFlight = new Map<string, Promise<ThumbResult>>();

const keyOf = (postId: string, imageId: string): string => `${postId}:${imageId}`;

/** What the server said for one picture, as an address an <img> may show. */
async function request(postId: string, imageId: string): Promise<ThumbResult> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const url = `${GAS_URL}?action=${COMMUNITY_ACTIONS.postImage}&postId=${encodeURIComponent(postId)}&imageId=${encodeURIComponent(imageId)}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const payload = JSON.parse(await response.text()) as Record<string, unknown>;
        const src = payload.ok === true ? toJpegDataUrl(payload.mime, payload.data) : '';
        if (!src) return FAILED;
        remembered.set(keyOf(postId, imageId), src);
        return { ok: true, src };
    } catch {
        return FAILED;
    } finally {
        window.clearTimeout(timer);
    }
}

/** The picture `imageId` of post `postId`. Never throws; a failure is not remembered, so the next look asks again. */
export function fetchThumb(postId: string, imageId: string): Promise<ThumbResult> {
    if (!ID.test(postId) || !ID.test(imageId)) return Promise.resolve(FAILED);
    const key = keyOf(postId, imageId);
    const known = remembered.get(key);
    if (known) return Promise.resolve({ ok: true, src: known });
    const running = inFlight.get(key);
    if (running) return running;
    const job = limiter.run(() => request(postId, imageId)).finally(() => { inFlight.delete(key); });
    inFlight.set(key, job);
    return job;
}

/** What is already in memory for a picture ('' when nothing): lets a row that scrolls back draw at once. */
export function peekThumb(postId: string, imageId: string): string {
    return remembered.get(keyOf(postId, imageId)) ?? '';
}

/** After a post was edited or deleted its pictures may have changed: forget what is remembered for it. */
export function forgetThumbs(postId: string): void {
    for (const key of remembered.keys()) if (key.startsWith(`${postId}:`)) remembered.delete(key);
}
