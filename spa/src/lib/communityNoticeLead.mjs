/**
 * The open card of the 공지사항 list: on page 1 of that board, newest first, the top post is drawn with its whole body.
 * The list only carries an excerpt, so the body comes from one post read, made once per id. Pure code + a small store.
 */
import { canLead } from './communityLead.mjs';

/** The only board whose list has an open card. */
export const NOTICE_LEAD_BOARD = 'notice';

/**
 * `{ lead, rest }` for the server's ordinary posts of one list page. `lead` is the first post on page 1 of the notice
 * board sorted newest first (same post rule as the 최근 소식 card: not pinned, not being sent), else null. The input is
 * never changed.
 */
export function splitNoticeLead({ boardId, page, sort, posts } = {}) {
    const rows = Array.isArray(posts) ? posts : [];
    if (boardId !== NOTICE_LEAD_BOARD || page !== 1 || sort !== 'latest' || !canLead(rows[0])) return { lead: null, rest: [...rows] };
    return { lead: rows[0], rest: rows.slice(1) };
}

/** `{ body, format }` from a post read, or null when the read failed or the post has no text. */
export function bodyFromReply(reply) {
    const source = reply && reply.ok === true && reply.post && typeof reply.post === 'object' ? reply.post : null;
    const body = source && typeof source.body === 'string' ? source.body : '';
    if (body.trim() === '') return null;
    return { body, format: source.format === 'rich' ? 'rich' : '' };
}

/**
 * Bodies by post id. `load(id)` reads a post at most once (a failure is kept too, so a redraw never asks again) and
 * resolves to `{ body, format }` or null; it never rejects. `peek(id)` is the body already read, else null.
 */
export function createNoticeBodyStore(fetchPost) {
    const reads = new Map();
    const done = new Map();
    const peek = (id) => done.get(id) ?? null;
    const load = (id) => {
        if (typeof id !== 'string' || id === '') return Promise.resolve(null);
        if (!reads.has(id)) {
            const read = Promise.resolve()
                .then(() => fetchPost(id))
                .then(bodyFromReply, () => null)
                .then((detail) => { done.set(id, detail); return detail; });
            reads.set(id, read);
        }
        return reads.get(id);
    };
    return { peek, load };
}
