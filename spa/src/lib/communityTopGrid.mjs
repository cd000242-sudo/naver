/**
 * The "인기글" grid of the community home (forum contract 1115, section B): which post goes where, by rank.
 * Desktop: rank 1 is a big card (2 columns x 2 rows), ranks 2-5 are medium cards beside it, ranks 6-10 a numbered list.
 * Phone: rank 1 full width, ranks 2-5 two by two, ranks 6-10 a list. When the week has few posts the grid shrinks
 * so no hole is left. Pure code: the page only draws what this says.
 */

export const TOP_MAX = 10;
/** The posts that get a card; the rest are the numbered list. */
const CARD_COUNT = 5;
/** Widths up to this are the phone grid (the same break as the community page). */
const PHONE_MAX_WIDTH = 720;

const TONES = Object.freeze(['notice', 'news', 'request', 'inquiry', 'free', 'promo']);

/** The posts in rank order: the server's `rank` first (position when it sent none), no post twice, ten at most, ranks 1..n. */
export function orderTop(items) {
    const rows = (Array.isArray(items) ? items : [])
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id !== '')
        .map(({ entry, index }) => ({ entry, index, key: Number.isFinite(entry.rank) && entry.rank > 0 ? entry.rank : index + 1 }))
        .sort((a, b) => a.key - b.key || a.index - b.index);
    const seen = new Set();
    const unique = rows.filter(({ entry }) => (seen.has(entry.id) ? false : seen.add(entry.id)));
    return unique.slice(0, TOP_MAX).map(({ entry }, position) => ({ ...entry, rank: position + 1 }));
}

const cell = (item, rank, col, row, colSpan, rowSpan, zone) => ({ item, rank, zone, col, row, colSpan, rowSpan });

function wideCards(posts) {
    const [hero, ...rest] = posts;
    if (!hero) return [];
    if (rest.length === 0) return [cell(hero, 1, 1, 1, 4, 1, 'hero')];
    if (rest.length === 1) return [cell(hero, 1, 1, 1, 3, 1, 'hero'), cell(rest[0], 2, 4, 1, 1, 1, 'card')];
    const tall = rest.length >= 3;
    const spots = [[3, 1, 1], [4, 1, 1], [3, 2, 1], [4, 2, 1]];
    return [
        cell(hero, 1, 1, 1, 2, tall ? 2 : 1, 'hero'),
        ...rest.map((post, index) => {
            const [col, row, span] = spots[index];
            // The last card of an odd second row takes both places.
            const fills = tall && rest.length === 3 && index === 2;
            return cell(post, index + 2, col, row, fills ? 2 : span, 1, 'card');
        }),
    ];
}

function narrowCards(posts) {
    const [hero, ...rest] = posts;
    if (!hero) return [];
    return [
        cell(hero, 1, 1, 1, 2, 1, 'hero'),
        ...rest.map((post, index) => {
            const alone = index === rest.length - 1 && rest.length % 2 === 1;
            return cell(post, index + 2, alone ? 1 : (index % 2) + 1, 2 + Math.floor(index / 2), alone ? 2 : 1, 1, 'card');
        }),
    ];
}

/** `{ cards, list, columns }`: the cards with their grid place, and the numbered list of ranks 6-10. */
export function placeTopGrid(items, layout) {
    const ordered = orderTop(items);
    const narrow = layout === 'narrow';
    const posts = ordered.slice(0, CARD_COUNT);
    return {
        cards: narrow ? narrowCards(posts) : wideCards(posts),
        list: ordered.slice(CARD_COUNT).map((item) => ({ item, rank: item.rank })),
        columns: narrow ? 2 : 4,
    };
}

/** 'narrow' for a phone width, 'wide' for everything else (also when the width is unknown). */
export function topLayoutFor(width) {
    const value = Number(width);
    return Number.isFinite(value) && value > 0 && value <= PHONE_MAX_WIDTH ? 'narrow' : 'wide';
}

/** The badge of a rank: 1 gold, 2 silver, 3 bronze, the rest plain. */
export function rankBadge(rank) {
    return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'plain';
}

/** The colour family of a board (a fixed word, never the board text itself); 'other' for an unknown board. */
export const boardTone = (boardId) => (TONES.includes(boardId) ? boardId : 'other');
