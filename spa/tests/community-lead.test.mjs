// 최근 소식 lead card: which post of the list becomes the one big card. Pure code only.
// Rule: the board view is `news`, page 1, and the card is the FIRST post the server sent (whatever the sort is).
// Pinned posts and the reader's own posts that are being sent are never the card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAD_BOARD, splitLead } from '../src/lib/communityLead.mjs';

const item = (id, extra = {}) => ({ id, title: `글 ${id}`, pinned: false, ...extra });
const posts = (count) => Array.from({ length: count }, (_, index) => item(`p${index + 1}`));
const ids = (list) => list.map((entry) => entry.id);

test('the lead card belongs to the 최근 소식 board only', () => {
    assert.equal(LEAD_BOARD, 'news');
});

test('news, page 1: the first post is the card and the others stay rows, in the server order', () => {
    const { lead, rest } = splitLead({ boardId: 'news', page: 1, posts: posts(4) });
    assert.equal(lead.id, 'p1');
    assert.deepEqual(ids(rest), ['p2', 'p3', 'p4']);
});

test('the card is the first post of whatever order the server sent (the sort is the server\'s business)', () => {
    const popular = [item('hot'), item('mid'), item('old')];
    assert.equal(splitLead({ boardId: 'news', page: 1, posts: popular }).lead.id, 'hot');
    assert.equal(splitLead({ boardId: 'news', page: 1, posts: [...popular].reverse() }).lead.id, 'old');
});

test('a lone post is the card and nothing is left for the rows', () => {
    const { lead, rest } = splitLead({ boardId: 'news', page: 1, posts: posts(1) });
    assert.equal(lead.id, 'p1');
    assert.deepEqual(rest, []);
});

test('other boards, the all-posts view and any page after the first have no card: every post stays a row', () => {
    for (const boardId of ['all', 'notice', 'qna', 'request', 'inquiry', 'free', 'promo', '', undefined]) {
        const { lead, rest } = splitLead({ boardId, page: 1, posts: posts(3) });
        assert.equal(lead, null, `board ${String(boardId)}`);
        assert.deepEqual(ids(rest), ['p1', 'p2', 'p3']);
    }
    for (const page of [2, 3, 10, 0, -1, undefined, null, '1x']) {
        const { lead, rest } = splitLead({ boardId: 'news', page, posts: posts(3) });
        assert.equal(lead, null, `page ${String(page)}`);
        assert.deepEqual(ids(rest), ['p1', 'p2', 'p3']);
    }
});

test('no posts (loading, empty board, an error) gives no card and an empty list, never a throw', () => {
    for (const empty of [[], null, undefined, 'x', 5, {}]) {
        assert.deepEqual(splitLead({ boardId: 'news', page: 1, posts: empty }), { lead: null, rest: [] });
    }
});

test('a pinned post or a post still being sent is never the card', () => {
    const pinnedFirst = [item('pin', { pinned: true }), item('a'), item('b')];
    const pinned = splitLead({ boardId: 'news', page: 1, posts: pinnedFirst });
    assert.equal(pinned.lead, null);
    assert.deepEqual(ids(pinned.rest), ['pin', 'a', 'b']);
    for (const delivery of ['sending', 'failed']) {
        const local = splitLead({ boardId: 'news', page: 1, posts: [item('mine', { delivery }), item('a')] });
        assert.equal(local.lead, null, delivery);
        assert.deepEqual(ids(local.rest), ['mine', 'a']);
    }
});

test('a row without an id cannot be linked to, so it is not the card', () => {
    for (const first of [null, {}, { id: '' }, { id: 7 }]) {
        const { lead, rest } = splitLead({ boardId: 'news', page: 1, posts: [first, item('a')] });
        assert.equal(lead, null);
        assert.equal(rest.length, 2);
    }
});

test('the input is never changed and the result is new arrays', () => {
    const input = Object.freeze(posts(3).map((entry) => Object.freeze(entry)));
    const result = splitLead({ boardId: 'news', page: 1, posts: input });
    assert.deepEqual(ids(input), ['p1', 'p2', 'p3']);
    assert.notEqual(result.rest, input);
    assert.equal(result.lead, input[0], 'the card is the very post, not a copy');
    const none = splitLead({ boardId: 'free', page: 1, posts: input });
    assert.notEqual(none.rest, input, 'a fresh array even when nothing is cut');
});
