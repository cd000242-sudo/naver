/**
 * The lead card of the 최근 소식 board: on page 1 of that board the first post the server sent is drawn as one big card
 * (picture, title, summary); every other post stays a list row. Pure code: the page only draws what this says.
 */

/** The only board whose list has a lead card. */
export const LEAD_BOARD = 'news';

/** A post the card may link to: it has an id, is not pinned and is not one of the reader's own posts still being sent. */
const canLead = (post) => Boolean(post)
    && typeof post.id === 'string'
    && post.id !== ''
    && post.pinned !== true
    && !post.delivery;

/**
 * `{ lead, rest }` for the server's ordinary posts of one list page. `lead` is the first post (whatever the sort is) on
 * page 1 of the news board, else null; `rest` is everything that stays a row, in the server's order. The input is never
 * changed. Pinned posts and the reader's own sending posts are separate lists in the page and are never the card.
 */
export function splitLead({ boardId, page, posts } = {}) {
    const rows = Array.isArray(posts) ? posts : [];
    if (boardId !== LEAD_BOARD || page !== 1 || !canLead(rows[0])) return { lead: null, rest: [...rows] };
    return { lead: rows[0], rest: rows.slice(1) };
}
