import { BOARD_ORDER } from './communityModel.mjs';

/**
 * "NEW!" on a community board row (2026-11-25): does the board hold a post this device has not seen yet?
 * Pure rules on three plain values per board — the newest post time known, the time the board was last opened on
 * this device, and "now". No browser, no network: node:test pins it directly. The browser memory is boardNewStore.ts.
 */

/** A board never opened on this device counts as new only for posts of the last three days. */
export const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const DOTTED_DATE = /^(\d{4})[./](\d{1,2})[./](\d{1,2})/;

/** Milliseconds since 1970 of an ISO time, a day-only date ("2026-11-25", "2026.11.25") or a number; 0 when unreadable. */
export function toMillis(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
    if (typeof value !== 'string') return 0;
    const text = value.trim().replace(DOTTED_DATE, (_all, year, month, day) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    const parsed = text ? Date.parse(text) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** The newest readable time of a list of dates; 0 for an empty or unreadable list. */
export function newestMillis(values) {
    return (Array.isArray(values) ? values : []).reduce((newest, value) => Math.max(newest, toMillis(value)), 0);
}

/** `{ board: newest createdAt }` of post rows. Only `createdAt` counts (an edit is not a new post); unknown boards are skipped. */
export function latestByBoard(rows) {
    const latest = {};
    for (const row of Array.isArray(rows) ? rows : []) {
        if (!row || !BOARD_ORDER.includes(row.board)) continue;
        const at = toMillis(row.createdAt);
        if (at > (latest[row.board] || 0)) latest[row.board] = at;
    }
    return latest;
}

/** Only the known boards with a readable time (what a damaged saved value is cut down to). */
export function pickTimes(raw) {
    return latestByBoard(
        raw && typeof raw === 'object' && !Array.isArray(raw)
            ? BOARD_ORDER.map((board) => ({ board, createdAt: raw[board] }))
            : [],
    );
}

/** `previous` moved forward by `incoming`, never backward. The same object comes back when nothing moved. */
export function mergeLatest(previous, incoming) {
    const base = previous && typeof previous === 'object' ? previous : {};
    const forward = pickTimes(incoming);
    const moved = Object.keys(forward).filter((board) => forward[board] > (base[board] || 0));
    if (moved.length === 0) return previous && typeof previous === 'object' ? previous : {};
    return { ...base, ...Object.fromEntries(moved.map((board) => [board, forward[board]])) };
}

/** One board: opened before = a post later than that visit; never opened = a post of the last three days. No time known = not new. */
export function isBoardNew({ latest, opened, now = Date.now() } = {}) {
    const newest = toMillis(latest);
    if (!newest) return false;
    const seen = toMillis(opened);
    if (seen) return newest > seen;
    return Number(now) - newest <= NEW_WINDOW_MS;
}

/** `{ boardId: true }` of the boards that are new (the others are left out). `exclude` names boards that never get the mark. */
export function newBoardMap({ latest, opened, now = Date.now(), exclude = [] } = {}) {
    const marks = {};
    for (const board of BOARD_ORDER) {
        if (exclude.includes(board)) continue;
        if (isBoardNew({ latest: latest?.[board], opened: opened?.[board], now })) marks[board] = true;
    }
    return marks;
}

/**
 * The visit times after opening `board`. The stamp is the later of "now" and the newest post known for the board, so a
 * server clock that runs ahead of this device cannot keep the mark on a board that was just read.
 */
export function markOpened(opened, board, latest, now = Date.now()) {
    const base = opened && typeof opened === 'object' ? opened : {};
    if (!BOARD_ORDER.includes(board)) return opened && typeof opened === 'object' ? opened : base;
    return { ...base, [board]: Math.max(toMillis(now), toMillis(latest?.[board])) };
}
