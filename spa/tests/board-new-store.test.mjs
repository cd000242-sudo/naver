// "NEW!" memory of this device (2026-11-25): the newest post time seen per board and the time each board was last
// opened, kept in localStorage. No server call is made here — the rows come from lists the screen already received.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const NOW = Date.parse('2026-11-25T12:00:00+09:00');
const HOUR = 60 * 60 * 1000;
const LATEST_KEY = 'leaderspro:board-latest:v1';
const OPENED_KEY = 'leaderspro:board-opened:v1';
const iso = (offset) => new Date(NOW + offset).toISOString();
const load = () => createLoader()('../../src/lib/boardNewStore.ts');

test('rows of a list are remembered per board and survive a reload of the page', () => {
    const browser = fakeBrowser();
    try {
        const store = load();
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-2 * HOUR) }, { board: 'free', createdAt: iso(-HOUR) }, { board: 'qna', createdAt: iso(-5 * HOUR) }]);
        assert.deepEqual(store.getBoardNewSnapshot().latest, { free: NOW - HOUR, qna: NOW - 5 * HOUR });
        assert.deepEqual(JSON.parse(browser.store.get(LATEST_KEY)), { free: NOW - HOUR, qna: NOW - 5 * HOUR });
        const again = load();
        assert.deepEqual(again.getBoardNewSnapshot().latest, { free: NOW - HOUR, qna: NOW - 5 * HOUR }, 'a fresh page reads what the last one saved');
    } finally {
        restoreBrowser();
    }
});

test('a board only moves forward: an older list never lowers what is known', () => {
    fakeBrowser();
    try {
        const store = load();
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-HOUR) }]);
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-9 * HOUR) }]);
        assert.deepEqual(store.getBoardNewSnapshot().latest, { free: NOW - HOUR });
    } finally {
        restoreBrowser();
    }
});

test('opening a board stamps that board only, remembers it, and tells the listeners', () => {
    const browser = fakeBrowser();
    try {
        const store = load();
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-HOUR) }, { board: 'qna', createdAt: iso(-HOUR) }]);
        let calls = 0;
        const stop = store.subscribeBoardNew(() => { calls += 1; });
        store.markBoardOpened('free', NOW);
        assert.deepEqual(store.getBoardNewSnapshot().opened, { free: NOW });
        assert.deepEqual(JSON.parse(browser.store.get(OPENED_KEY)), { free: NOW });
        assert.equal(calls, 1);
        stop();
        store.markBoardOpened('qna', NOW);
        assert.equal(calls, 1, 'an unsubscribed listener hears nothing');
        assert.deepEqual(load().getBoardNewSnapshot().opened, { free: NOW, qna: NOW });
    } finally {
        restoreBrowser();
    }
});

test('recording nothing new does not wake the listeners and keeps the same snapshot object', () => {
    fakeBrowser();
    try {
        const store = load();
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-HOUR) }]);
        const first = store.getBoardNewSnapshot();
        let calls = 0;
        store.subscribeBoardNew(() => { calls += 1; });
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-3 * HOUR) }]);
        store.recordBoardPosts([]);
        store.recordBoardLatest({ free: NOW - 4 * HOUR });
        assert.equal(calls, 0);
        assert.equal(store.getBoardNewSnapshot(), first);
        store.recordBoardLatest({ notice: NOW - HOUR });
        assert.equal(calls, 1);
        assert.notEqual(store.getBoardNewSnapshot(), first);
        assert.deepEqual(store.getBoardNewSnapshot().latest, { free: NOW - HOUR, notice: NOW - HOUR });
    } finally {
        restoreBrowser();
    }
});

test('the stamp of a visit is never earlier than the newest post known for that board', () => {
    fakeBrowser();
    try {
        const store = load();
        store.recordBoardPosts([{ board: 'free', createdAt: iso(+10 * 60 * 1000) }]);
        store.markBoardOpened('free', NOW);
        assert.equal(store.getBoardNewSnapshot().opened.free, NOW + 10 * 60 * 1000);
    } finally {
        restoreBrowser();
    }
});

test('damaged or foreign saved data is ignored, never thrown at the screen', () => {
    const browser = fakeBrowser();
    try {
        browser.store.set(LATEST_KEY, '{not json');
        browser.store.set(OPENED_KEY, JSON.stringify({ free: 'soon', qna: -4, nowhere: NOW, news: NOW - HOUR }));
        const store = load();
        assert.deepEqual(store.getBoardNewSnapshot().latest, {});
        assert.deepEqual(store.getBoardNewSnapshot().opened, { news: NOW - HOUR });
        browser.store.set(LATEST_KEY, '[1,2,3]');
        assert.deepEqual(load().getBoardNewSnapshot().latest, {});
    } finally {
        restoreBrowser();
    }
});

test('without usable storage (private window) nothing throws and the page session still remembers', () => {
    fakeBrowser();
    delete globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
        const store = load();
        assert.deepEqual(store.getBoardNewSnapshot(), { latest: {}, opened: {} });
        store.recordBoardPosts([{ board: 'free', createdAt: iso(-HOUR) }]);
        store.markBoardOpened('free', NOW);
        assert.deepEqual(store.getBoardNewSnapshot(), { latest: { free: NOW - HOUR }, opened: { free: NOW } });
    } finally {
        delete globalThis.localStorage;
        restoreBrowser();
    }
});

test('a storage that refuses to write (full) does not break remembering in memory', () => {
    const browser = fakeBrowser();
    try {
        const store = load();
        globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
        store.recordBoardPosts([{ board: 'qna', createdAt: iso(-HOUR) }]);
        store.markBoardOpened('qna', NOW);
        assert.equal(store.getBoardNewSnapshot().opened.qna, NOW);
        assert.equal(browser.store.size, 0);
    } finally {
        restoreBrowser();
    }
});
