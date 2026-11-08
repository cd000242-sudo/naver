/**
 * Pure rules for the one-call community feed (`community-feed`): how to judge the server's answer, and how the
 * settings, counts and saved-list keys are shaped. No browser, no network — node:test pins it directly.
 */
import { BOARD_ORDER } from './communityModel.mjs';

export const FEED_PAGE_SIZE = 20;

/** Answers that mean "the old way would fail the same", so asking again with many calls only costs time. */
const FATAL_CODES = new Set(['LOGIN_REQUIRED', 'SESSION_INVALID', 'NO_SESSION', 'NETWORK', 'BUSY']);

/** An old server rejects an unknown action with `Unauthorized` (it is not on the public list) or `Unknown action`. */
const UNSUPPORTED_PATTERN = /unknown[ _-]?action|invalid[ _-]?action|unsupported|not[ _-]?supported|알 수 없는|지원하지|없는 액션/i;

/**
 * What to do with the answer of `community-feed`:
 *   use           a list came back
 *   unsupported   the server does not know the action yet (remember it for a while)
 *   fatal         login or connection problem: show it, do not retry the long way
 *   retry-legacy  the new action failed for another reason: read the old way once, but do not remember it
 */
export function judgeFeedReply(result) {
    if (!result || typeof result !== 'object') return 'unsupported';
    if (result.ok === true) return Array.isArray(result.posts) ? 'use' : 'unsupported';
    const code = String(result.code || '');
    if (FATAL_CODES.has(code)) return 'fatal';
    const words = `${code} ${String(result.message || '')} ${String(result.error || '')}`;
    if (code === 'Unauthorized' || UNSUPPORTED_PATTERN.test(words)) return 'unsupported';
    return 'retry-legacy';
}

/** Post counts per board id: only the five known boards, only real numbers. */
export function pickCounts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const counts = {};
    for (const id of BOARD_ORDER) {
        const value = Number(source[id]);
        if (source[id] !== undefined && source[id] !== null && Number.isFinite(value) && value >= 0) counts[id] = Math.floor(value);
    }
    return counts;
}

const text = (value) => (typeof value === 'string' ? value : '');

function pickBoard(entry) {
    const id = text(entry?.id);
    if (!BOARD_ORDER.includes(id)) return null;
    const picked = { id };
    if (text(entry.label)) picked.label = entry.label;
    if (entry.writeRole === 'operator' || entry.writeRole === 'member') picked.writeRole = entry.writeRole;
    if (Number.isFinite(entry.dailyLimit)) picked.dailyLimit = entry.dailyLimit;
    if (Array.isArray(entry.statuses)) picked.statuses = entry.statuses.map(String);
    if (typeof entry.defaultStatus === 'string') picked.defaultStatus = entry.defaultStatus;
    return picked;
}

/**
 * The board settings of a feed answer, cut down to what the screen reads (`boardList` + `reportReasons`).
 * The answer may carry the whole `community-boards` reply or only its board list; null when it carries neither.
 */
export function pickConfig(result) {
    const source = result && typeof result === 'object' ? result : {};
    const holder = Array.isArray(source.boards) ? source : (source.boards && typeof source.boards === 'object' ? source.boards : null);
    if (!holder || !Array.isArray(holder.boards)) return null;
    const boards = holder.boards.map(pickBoard).filter(Boolean);
    if (boards.length === 0) return null;
    const reasonSource = Array.isArray(holder.reportReasons) ? holder.reportReasons : source.reportReasons;
    const reportReasons = (Array.isArray(reasonSource) ? reasonSource : [])
        .filter((entry) => text(entry?.key) && text(entry?.label))
        .map((entry) => ({ key: entry.key, label: entry.label }));
    return { boards, reportReasons };
}

/** A short one-way tag of the user id, so a saved key can tell users apart without spelling the id out. */
export function userTag(userId) {
    let hash = 0x811c9dc5;
    for (const char of String(userId || '')) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

/** Saved-list key part for one screen: board, sort and page. */
export const feedViewKey = (view) => `${view.board}:${view.sort}:${view.page}`;
