// "NEW!" on a board row (2026-11-25): which boards hold a post the reader has not seen yet, judged on this device only.
// Pure rules: the newest post time of each board, the time the board was last opened, and "now".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    NEW_WINDOW_MS, isBoardNew, latestByBoard, markOpened, mergeLatest, newBoardMap, toMillis, newestMillis,
} from '../src/lib/boardNew.mjs';

const NOW = Date.parse('2026-11-25T12:00:00+09:00');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (offsetMs) => new Date(NOW + offsetMs).toISOString();

test('the first-visit window is exactly three days', () => {
    assert.equal(NEW_WINDOW_MS, 3 * DAY);
});

test('toMillis reads ISO times, day-only dates and dotted dates; anything else is 0', () => {
    assert.equal(toMillis('2026-11-25T03:00:00.000Z'), Date.parse('2026-11-25T03:00:00.000Z'));
    assert.equal(toMillis('2026-11-25'), Date.parse('2026-11-25'));
    assert.equal(toMillis('2026.11.25'), Date.parse('2026-11-25'));
    assert.equal(toMillis('2026/11/5'), Date.parse('2026-11-05'));
    assert.equal(toMillis(1764000000000), 1764000000000);
    for (const bad of ['', '   ', 'yesterday', null, undefined, {}, NaN, -5, 0]) assert.equal(toMillis(bad), 0, String(bad));
});

test('newestMillis picks the newest readable time of a list of dates', () => {
    assert.equal(newestMillis(['2026-11-20', 'junk', '2026-11-24', '2026-11-22']), Date.parse('2026-11-24'));
    assert.equal(newestMillis([]), 0);
    assert.equal(newestMillis(null), 0);
});

test('latestByBoard keeps the newest createdAt per board and ignores rows it cannot read', () => {
    const rows = [
        { board: 'free', createdAt: at(-5 * HOUR) },
        { board: 'free', createdAt: at(-1 * HOUR) },
        { board: 'qna', createdAt: at(-2 * DAY) },
        { board: 'free', createdAt: at(-9 * HOUR) },
        { board: 'nowhere', createdAt: at(-1 * HOUR) },
        { board: 'qna', createdAt: '' },
        { board: '', createdAt: at(-1 * HOUR) },
        null,
        { createdAt: at(-1 * HOUR) },
    ];
    assert.deepEqual(latestByBoard(rows), { free: NOW - HOUR, qna: NOW - 2 * DAY });
    assert.deepEqual(latestByBoard(undefined), {});
});

test('latestByBoard does not use updatedAt: an edit is not a new post', () => {
    assert.deepEqual(latestByBoard([{ board: 'free', createdAt: at(-3 * DAY), updatedAt: at(-1 * HOUR) }]), { free: NOW - 3 * DAY });
});

test('mergeLatest only ever moves a board forward, and returns the same object when nothing changed', () => {
    const before = { free: NOW - DAY, qna: NOW - HOUR };
    const merged = mergeLatest(before, { free: NOW - 2 * DAY, qna: NOW, news: NOW - HOUR });
    assert.deepEqual(merged, { free: NOW - DAY, qna: NOW, news: NOW - HOUR });
    assert.notEqual(merged, before);
    assert.deepEqual(before, { free: NOW - DAY, qna: NOW - HOUR }, 'the input is not changed');
    assert.equal(mergeLatest(before, { free: NOW - 2 * DAY }), before);
    assert.equal(mergeLatest(before, {}), before);
    assert.equal(mergeLatest(before, null), before);
    assert.deepEqual(mergeLatest(null, { free: 5 }), { free: 5 });
    assert.deepEqual(mergeLatest(before, { free: 'x', qna: -3, bogus: NOW }), before, 'junk values and unknown boards are dropped');
});

test('never opened: NEW only when the newest post is within three days', () => {
    assert.equal(isBoardNew({ latest: NOW - HOUR, opened: 0, now: NOW }), true);
    assert.equal(isBoardNew({ latest: NOW - 3 * DAY, opened: 0, now: NOW }), true, 'the third day still counts');
    assert.equal(isBoardNew({ latest: NOW - 3 * DAY - 1000, opened: undefined, now: NOW }), false);
    assert.equal(isBoardNew({ latest: NOW - 30 * DAY, opened: undefined, now: NOW }), false);
});

test('opened before: NEW only when the newest post is later than that visit', () => {
    assert.equal(isBoardNew({ latest: NOW - HOUR, opened: NOW - 2 * HOUR, now: NOW }), true);
    assert.equal(isBoardNew({ latest: NOW - 2 * HOUR, opened: NOW - HOUR, now: NOW }), false);
    assert.equal(isBoardNew({ latest: NOW - HOUR, opened: NOW - HOUR, now: NOW }), false, 'the same moment is already seen');
    assert.equal(isBoardNew({ latest: NOW - 5 * DAY, opened: NOW - 20 * DAY, now: NOW }), true, 'a long absence is not capped by the three days');
});

test('no information, no NEW', () => {
    assert.equal(isBoardNew({ latest: undefined, opened: NOW - DAY, now: NOW }), false);
    assert.equal(isBoardNew({ latest: 0, opened: 0, now: NOW }), false);
    assert.equal(isBoardNew({ latest: 'x', opened: 0, now: NOW }), false);
    assert.equal(isBoardNew(undefined), false);
});

test('newBoardMap lists only the boards that are new, in a plain object', () => {
    const latest = { notice: NOW - HOUR, news: NOW - 2 * DAY, free: NOW - HOUR, qna: NOW - 10 * DAY, promo: NOW - HOUR };
    const opened = { free: NOW - 30 * 60 * 1000, promo: NOW - 3 * HOUR };
    assert.deepEqual(newBoardMap({ latest, opened, now: NOW }), { notice: true, news: true, promo: true });
});

test('newBoardMap leaves out the boards it is told to exclude (시크릿 클래스 without access)', () => {
    const latest = { free: NOW - HOUR, secret: NOW - HOUR };
    assert.deepEqual(newBoardMap({ latest, opened: {}, now: NOW, exclude: ['secret'] }), { free: true });
    assert.deepEqual(newBoardMap({ latest, opened: {}, now: NOW }), { free: true, secret: true });
});

test('newBoardMap copes with missing or broken input', () => {
    assert.deepEqual(newBoardMap({ latest: null, opened: null, now: NOW }), {});
    assert.deepEqual(newBoardMap({}), {});
    assert.deepEqual(newBoardMap(undefined), {});
});

test('markOpened stamps the visit with the later of "now" and the newest known post, so a fast server clock cannot keep NEW stuck', () => {
    const latest = { free: NOW + 10 * 60 * 1000, qna: NOW - HOUR };
    const opened = markOpened({ news: NOW - DAY }, 'free', latest, NOW);
    assert.deepEqual(opened, { news: NOW - DAY, free: NOW + 10 * 60 * 1000 });
    assert.equal(isBoardNew({ latest: latest.free, opened: opened.free, now: NOW }), false);
    assert.deepEqual(markOpened({}, 'qna', latest, NOW), { qna: NOW });
});

test('markOpened ignores boards it does not know and does not change its input', () => {
    const before = { free: NOW - DAY };
    assert.equal(markOpened(before, 'nowhere', {}, NOW), before);
    assert.equal(markOpened(before, 'all', {}, NOW), before, 'the all-boards screen is not a board');
    const after = markOpened(before, 'free', {}, NOW);
    assert.deepEqual(before, { free: NOW - DAY });
    assert.deepEqual(after, { free: NOW });
});
