// Speed is the point of a community (2026-11-08): a like, a comment, a new post, a report and a moderator click show
// on screen at once, the server confirms in the background, and a failure puts things back (or offers a resend).
// The server is a script with delays and refusals; no live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';

const load = createLoader();
const like = load('../../src/lib/communityLikeSync.ts');
const outbox = load('../../src/lib/communityOutbox.ts');
const posts = load('../../src/lib/communityPostOutbox.ts');
const optimistic = load('../../src/lib/communityOptimistic.ts');
const data = load('../../src/lib/communityData.ts');

const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const author = { nickname: '이웃', grade: { key: 'sprout', label: '새싹' }, isOperator: false };

// ---------- likes ----------

function likeRig(answers, initial = { liked: false, likes: 3 }) {
    const rig = { shown: [], failures: [], sends: 0, inFlight: 0, maxInFlight: 0, state: initial };
    const toggle = like.createLikeToggle({
        send: async () => {
            rig.sends += 1;
            rig.inFlight += 1;
            rig.maxInFlight = Math.max(rig.maxInFlight, rig.inFlight);
            const answer = await answers(rig.sends);
            rig.inFlight -= 1;
            return answer;
        },
        apply: (next) => { rig.state = next; rig.shown.push(next); },
        fail: (message) => rig.failures.push(message),
    });
    rig.click = () => toggle.toggle(rig.state);
    rig.settled = () => toggle.settled();
    return rig;
}

test('LIKE: the heart and the number change the moment it is pressed, before the server answers', async () => {
    const rig = likeRig(() => later(30, { ok: true, liked: true, likes: 4 }));
    rig.click();
    assert.deepEqual(rig.state, { liked: true, likes: 4 }, 'changed synchronously');
    assert.equal(rig.sends, 1);
    await rig.settled();
    assert.deepEqual(rig.state, { liked: true, likes: 4 });
    assert.deepEqual(rig.failures, []);
});

test('LIKE: the server number wins when someone else liked in the meantime', async () => {
    const rig = likeRig(() => later(5, { ok: true, liked: true, likes: 9 }));
    rig.click();
    await rig.settled();
    assert.deepEqual(rig.state, { liked: true, likes: 9 });
});

test('LIKE: a refusal puts the heart back and says why in one short sentence', async () => {
    const rig = likeRig(() => later(5, { ok: false, code: 'NETWORK', message: '연결에 실패했어요.' }));
    rig.click();
    assert.equal(rig.state.liked, true);
    await rig.settled();
    assert.deepEqual(rig.state, { liked: false, likes: 3 }, 'back to what the server last confirmed');
    assert.deepEqual(rig.failures, ['연결에 실패했어요.']);
});

test('LIKE: an unlike works the same way (and never goes below zero)', async () => {
    const rig = likeRig(() => later(5, { ok: true, liked: false, likes: 0 }), { liked: true, likes: 0 });
    rig.click();
    assert.deepEqual(rig.state, { liked: false, likes: 0 });
    await rig.settled();
    assert.deepEqual(rig.state, { liked: false, likes: 0 });
});

test('LIKE: five quick presses send ONE request at a time and end on the last state', async () => {
    const rig = likeRig((n) => later(10, { ok: true, liked: n % 2 === 1, likes: 3 + (n % 2) }));
    for (let i = 0; i < 5; i += 1) rig.click();
    assert.equal(rig.sends, 1, 'one request out, the rest are folded into it');
    assert.equal(rig.state.liked, true, 'the screen already shows the 5th press');
    await rig.settled();
    assert.equal(rig.maxInFlight, 1, 'requests never overlap');
    assert.equal(rig.sends, 1, 'odd presses need one toggle on the server');
    assert.deepEqual(rig.state, { liked: true, likes: 4 });
});

test('LIKE: four quick presses end where they began, with at most one follow-up request', async () => {
    const rig = likeRig((n) => later(10, { ok: true, liked: n % 2 === 1, likes: 3 + (n % 2) }));
    for (let i = 0; i < 4; i += 1) rig.click();
    await rig.settled();
    assert.equal(rig.maxInFlight, 1);
    assert.ok(rig.sends <= 2);
    assert.deepEqual(rig.state, { liked: false, likes: 3 });
});

test('LIKE: a failure in the middle of a burst goes back to the last confirmed state', async () => {
    const rig = likeRig((n) => later(5, n === 1 ? { ok: true, liked: true, likes: 4 } : { ok: false, code: 'BUSY', message: '붐빕니다.' }));
    rig.click();
    rig.click();
    await rig.settled();
    assert.deepEqual(rig.state, { liked: true, likes: 4 }, 'the first toggle did reach the server');
    assert.deepEqual(rig.failures, ['붐빕니다.']);
});

// ---------- comments ----------

function commentRig(initial = []) {
    const rig = { list: initial, updates: 0 };
    rig.port = { update: (change) => { rig.list = change(rig.list); rig.updates += 1; } };
    return rig;
}
const serverComment = (id, body, extra = {}) => ({ id, postId: 'p1', parentId: '', nickname: '이웃', grade: { key: 'sprout', label: '새싹' }, body, createdAt: '2026-11-08T12:00:00+09:00', likes: 0, mine: true, replies: [], ...extra });

test('COMMENT: appears in the list at once as "sending", then becomes the confirmed comment', async () => {
    const rig = commentRig();
    const seen = [];
    const done = outbox.sendComment(rig.port, { postId: 'p1', body: '첫 댓글', author }, async (postId, body, parentId, requestId) => {
        seen.push({ postId, body, parentId, requestId });
        await later(30);
        return { ok: true, comment: serverComment('c_1', body) };
    });
    assert.equal(rig.list.length, 1, 'on screen before the server answered');
    assert.equal(rig.list[0].delivery, 'sending');
    assert.deepEqual([rig.list[0].nickname, rig.list[0].body, rig.list[0].mine], ['이웃', '첫 댓글', true]);
    assert.equal(await done, '');
    assert.deepEqual(rig.list.map((c) => [c.id, c.delivery]), [['c_1', undefined]]);
    assert.match(seen[0].requestId, /^[A-Za-z0-9_-]{8,40}$/);
});

test('COMMENT: a reply is placed under its parent while sending', async () => {
    const parent = data.normalizeComment(serverComment('c_1', '부모', { mine: false }));
    const rig = commentRig([parent]);
    const done = outbox.sendComment(rig.port, { postId: 'p1', body: '답글', parentId: 'c_1', author }, async () => later(10, { ok: true, comment: serverComment('c_2', '답글', { parentId: 'c_1' }) }));
    assert.equal(rig.list.length, 1);
    assert.equal(rig.list[0].replies.length, 1);
    assert.equal(rig.list[0].replies[0].delivery, 'sending');
    await done;
    assert.deepEqual(rig.list[0].replies.map((c) => c.id), ['c_2']);
});

test('COMMENT: a failure leaves the comment in place with the reason; "다시 보내기" reuses the same request id', async () => {
    const rig = commentRig();
    const requestIds = [];
    let attempt = 0;
    const write = async (postId, body, parentId, requestId) => {
        requestIds.push(requestId);
        attempt += 1;
        await later(5);
        return attempt === 1 ? { ok: false, code: 'NETWORK', message: '연결에 실패했어요.' } : { ok: true, comment: serverComment('c_9', body) };
    };
    const failure = await outbox.sendComment(rig.port, { postId: 'p1', body: '다시 보낼 글', author }, write);
    assert.equal(failure, '연결에 실패했어요.');
    assert.equal(rig.list.length, 1);
    assert.deepEqual([rig.list[0].delivery, rig.list[0].failure, rig.list[0].body], ['failed', '연결에 실패했어요.', '다시 보낼 글']);
    const retrying = outbox.retryComment(rig.port, 'p1', rig.list[0], write);
    assert.equal(rig.list[0].delivery, 'sending', 'back to sending right away');
    assert.equal(await retrying, '');
    assert.deepEqual(rig.list.map((c) => c.id), ['c_9']);
    assert.equal(requestIds[0], requestIds[1], 'the server can recognise the repeat and not post twice');
});

test('COMMENT: sending the same text again from the box replaces the failed one instead of making a twin', async () => {
    const rig = commentRig();
    await outbox.sendComment(rig.port, { postId: 'p1', body: '같은 글', author }, async () => ({ ok: false, code: 'BUSY', message: 'x' }));
    assert.equal(rig.list.length, 1);
    await outbox.sendComment(rig.port, { postId: 'p1', body: '같은 글', author }, async () => ({ ok: true, comment: serverComment('c_3', '같은 글') }));
    assert.deepEqual(rig.list.map((c) => c.id), ['c_3']);
});

test('COMMENT: discarding a failed comment removes it; a reload from the server keeps the unsent ones', async () => {
    const rig = commentRig();
    await outbox.sendComment(rig.port, { postId: 'p1', body: '못 보낸 글', author }, async () => ({ ok: false, code: 'BUSY', message: 'x' }));
    const fromServer = data.normalizeComments([serverComment('c_1', '남의 글', { mine: false })]);
    const merged = outbox.mergeServerComments(fromServer, rig.list);
    assert.deepEqual(merged.map((c) => c.body), ['남의 글', '못 보낸 글']);
    assert.equal(merged[1].delivery, 'failed');
    assert.deepEqual(outbox.discardComment(rig.list, rig.list[0].id), []);
});

test('COMMENT: the box is emptied at once and the text comes back only when sending failed and the box is still empty', () => {
    assert.equal(outbox.restoreDraft('', '보낸 글', ''), '', 'success: stays empty');
    assert.equal(outbox.restoreDraft('', '보낸 글', '실패'), '보낸 글', 'failure: text is back');
    assert.equal(outbox.restoreDraft('새로 쓰는 중', '보낸 글', '실패'), '새로 쓰는 중', 'never overwrites what was typed since');
});

// ---------- posts ----------

const draft = { board: 'free', title: '새 글', body: '본문' };
function postRig() {
    const rig = { list: [], refreshed: 0 };
    rig.port = { update: (change) => { rig.list = change(rig.list); }, settled: () => { rig.refreshed += 1; } };
    return rig;
}

test('POST: my new post is at the top of the list at once and is confirmed in the background', async () => {
    const rig = postRig();
    const entry = posts.newOutboxEntry(draft, author);
    rig.list = [entry];
    assert.deepEqual([entry.state, entry.post.title, entry.post.mine, entry.post.nickname, entry.post.delivery], ['sending', '새 글', true, '이웃', 'sending']);
    const done = posts.deliverPost(rig.port, entry, async (sent, requestId) => {
        assert.equal(requestId, entry.requestId);
        await later(20);
        return { ok: true, post: { id: 'p_77', board: 'free', title: sent.title, nickname: '이웃', mine: true, createdAt: '2026-11-08T12:00:00+09:00' } };
    });
    assert.equal(rig.list[0].state, 'sending');
    await done;
    assert.deepEqual([rig.list[0].state, rig.list[0].post.id, rig.list[0].post.delivery], ['sent', 'p_77', undefined]);
    assert.equal(rig.refreshed, 1, 'the page is told to read the list again');
});

test('POST: a failure keeps the draft in the list with the reason; resending uses the same request id', async () => {
    const rig = postRig();
    const entry = posts.newOutboxEntry(draft, author);
    rig.list = [entry];
    const ids = [];
    let attempt = 0;
    const write = async (sent, requestId) => {
        ids.push(requestId);
        attempt += 1;
        await later(5);
        return attempt === 1 ? { ok: false, code: 'DAILY_LIMIT', message: '오늘은 더 올릴 수 없어요.' } : { ok: true, post: { id: 'p_78', board: 'free', title: sent.title, mine: true } };
    };
    await posts.deliverPost(rig.port, entry, write);
    assert.deepEqual([rig.list[0].state, rig.list[0].failure, rig.list[0].draft.body, rig.list[0].post.delivery], ['failed', '오늘은 더 올릴 수 없어요.', '본문', 'failed']);
    assert.equal(rig.refreshed, 0);
    const again = posts.deliverPost(rig.port, rig.list[0], write);
    assert.equal(rig.list[0].state, 'sending');
    await again;
    assert.equal(rig.list[0].post.id, 'p_78');
    assert.equal(ids[0], ids[1]);
    assert.deepEqual(posts.discardOutbox(rig.list, entry.requestId), []);
});

test('POST: only the posts that belong on this screen are drawn, and only until the real list has them', () => {
    const mine = (board, state, id) => ({ ...posts.newOutboxEntry({ ...draft, board }, author), state, post: { ...posts.newOutboxEntry({ ...draft, board }, author).post, id, board } });
    const entries = [mine('free', 'sending', 'pending_a'), mine('news', 'sent', 'p_5'), mine('free', 'sent', 'p_6')];
    const ids = (view, serverIds = []) => posts.visibleOutbox(entries, view, new Set(serverIds)).map((p) => p.id);
    assert.deepEqual(ids({ board: 'all', page: 1 }), ['pending_a', 'p_5', 'p_6']);
    assert.deepEqual(ids({ board: 'free', page: 1 }), ['pending_a', 'p_6']);
    assert.deepEqual(ids({ board: 'free', page: 2 }), [], 'not on page 2');
    assert.deepEqual(ids({ board: 'all', page: 1 }, ['p_5']), ['pending_a', 'p_6'], 'the real list already shows p_5');
    assert.deepEqual(posts.pruneOutbox(entries, new Set(['p_5', 'p_6'])).map((e) => e.post.id), ['pending_a']);
});

// ---------- report / moderator clicks ----------

test('OPTIMISTIC: the change shows first; a refusal puts it back and returns the reason', async () => {
    const events = [];
    const ok = await optimistic.runOptimistic({
        apply: () => events.push('apply'), revert: () => events.push('revert'),
        call: async () => { events.push('call'); await later(10); return { ok: true }; },
    });
    assert.deepEqual(events, ['apply', 'call']);
    assert.equal(ok, '');
    events.length = 0;
    const failed = await optimistic.runOptimistic({
        apply: () => events.push('apply'), revert: () => events.push('revert'),
        call: async () => { await later(10); return { ok: false, code: 'FORBIDDEN', message: '운영자만 할 수 있어요.' }; },
        describe: (result) => `거절: ${result.message}`,
    });
    assert.deepEqual(events, ['apply', 'revert']);
    assert.equal(failed, '거절: 운영자만 할 수 있어요.');
});

test('OPTIMISTIC: nothing is applied twice and a thrown call is a failure too', async () => {
    let applied = 0;
    const message = await optimistic.runOptimistic({
        apply: () => { applied += 1; }, revert: () => { applied -= 1; },
        call: async () => { throw new Error('boom'); },
    });
    assert.equal(applied, 0);
    assert.match(message, /못했어요/);
});
