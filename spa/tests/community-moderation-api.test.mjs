// Moderator calls and the data they need (2026-11-08): the shape of every admin request (always with the community
// token, never an admin token), the server's refusal sentence, the notice-post and report fields in the data layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const FUTURE = '2099-01-01T00:00:00.000Z';
const owner = {
    userId: 'boss', role: 'owner', nickname: '사장님', needsNickname: false, canWriteNews: true, score: 0,
    activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'tree', label: '나무' }, linked: true,
    communityToken: 'ct_owner', sessionExpiresAt: FUTURE, isOperator: true,
};

async function withOwner(replies, body, signedIn = true) {
    const browser = fakeBrowser(replies);
    try {
        const load = createLoader();
        const modules = { mod: load('../../src/lib/communityModeration.ts'), data: load('../../src/lib/communityData.ts'), session: load('../../src/lib/communitySession.ts') };
        if (signedIn) modules.session.saveCommunitySession(modules.session.toCommunitySession(owner));
        return await body(browser, modules);
    } finally { restoreBrowser(); }
}
const last = (browser) => browser.calls[browser.calls.length - 1];

test('hide / show, pin, delete and status are sent with the community token and exact fields', async () => {
    const ok = { ok: true };
    const replies = { 'community-admin-hide': ok, 'community-admin-pin': ok, 'community-admin-delete': ok, 'community-admin-status': ok };
    await withOwner(replies, async (browser, { mod }) => {
        await mod.moderationApi.hide('post', 'p_1', true);
        assert.deepEqual(last(browser), { targetType: 'post', targetId: 'p_1', hidden: true, communityToken: 'ct_owner', action: 'community-admin-hide' });
        await mod.moderationApi.hide('comment', 'c_4', false);
        assert.deepEqual([last(browser).targetType, last(browser).targetId, last(browser).hidden], ['comment', 'c_4', false]);
        await mod.moderationApi.pin('p_1', true);
        assert.deepEqual(last(browser), { id: 'p_1', pinned: true, communityToken: 'ct_owner', action: 'community-admin-pin' });
        await mod.moderationApi.remove('comment', 'c_4');
        assert.deepEqual(last(browser), { targetType: 'comment', targetId: 'c_4', communityToken: 'ct_owner', action: 'community-admin-delete' });
        await mod.moderationApi.setStatus('p_2', '답변 완료');
        assert.deepEqual(last(browser), { id: 'p_2', status: '답변 완료', communityToken: 'ct_owner', action: 'community-admin-status' });
        assert.ok(browser.calls.every((call) => call.adminToken === undefined), 'the screen never holds an admin token');
    });
});

test('report list and report resolution use the agreed field names', async () => {
    await withOwner({ 'community-admin-reports': { ok: true, reports: [], total: 0 }, 'community-admin-report-resolve': { ok: true } }, async (browser, { mod }) => {
        await mod.moderationApi.reports('open', 2, 10);
        assert.deepEqual(last(browser), { status: 'open', page: 2, pageSize: 10, communityToken: 'ct_owner', action: 'community-admin-reports' });
        await mod.moderationApi.resolveReport('r_7', 'dismissed');
        assert.deepEqual(last(browser), { reportId: 'r_7', status: 'dismissed', communityToken: 'ct_owner', action: 'community-admin-report-resolve' });
        await mod.moderationApi.hiddenPosts(1, 10);
        assert.deepEqual([last(browser).action, last(browser).filter, last(browser).page], ['community-admin-posts', 'hidden', 1]);
    });
});

test('the server refusing a non-owner is passed through as its own sentence', async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', message: '운영자만 할 수 있습니다.' };
    await withOwner({ 'community-admin-hide': refusal }, async (_browser, { mod }) => {
        const result = await mod.moderationApi.hide('post', 'p_1', true);
        assert.deepEqual([result.ok, result.code, result.message], [false, 'FORBIDDEN', '운영자만 할 수 있습니다.']);
    });
});

test('the bare refusal { ok:false, error:"Unauthorized" } (no code) is handled and keeps the login', async () => {
    await withOwner({ 'community-admin-hide': { ok: false, error: 'Unauthorized' } }, async (_browser, { mod, session }) => {
        const result = await mod.moderationApi.hide('post', 'p_1', true);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'Unauthorized');
        assert.ok(session.loadCommunitySession(), 'a refused moderator call is not a dead login');
    });
});

test('no login, no moderator call', async () => {
    await withOwner({}, async (browser, { mod }) => {
        const result = await mod.moderationApi.pin('p_1', true);
        assert.deepEqual([result.ok, result.code], [false, 'LOGIN_REQUIRED']);
        assert.deepEqual(browser.calls, []);
    }, false);
});

test('report items are coerced for drawing; a vanished target is marked', async () => {
    await withOwner({}, async (_browser, { mod }) => {
        const list = mod.normalizeReports([
            { reportId: 'r_1', targetType: 'post', targetId: 'p_1', reason: 'spam', reasonLabel: '광고·도배', detail: '링크가 많아요', reporterNickname: '이웃', createdAt: '2026-11-08T01:00:00Z', status: 'open', target: { board: 'free', postId: 'p_1', title: '문제 글', excerpt: '앞부분', nickname: '글쓴이', hidden: true } },
            { reportId: 'r_2', targetType: 'comment', targetId: 'c_1', status: 'open', target: { missing: true } },
            { reportId: '' },
            'junk',
        ]);
        assert.equal(list.length, 2);
        assert.deepEqual([list[0].reportId, list[0].reasonLabel, list[0].target.title, list[0].target.hidden, list[0].target.postId], ['r_1', '광고·도배', '문제 글', true, 'p_1']);
        assert.deepEqual([list[1].target.missing, list[1].targetType, list[1].reasonLabel], [true, 'comment', '']);
        assert.deepEqual(mod.normalizeReports(undefined), []);
    });
});

test('data layer: a notice post is recognised by its id, and the server limits are read', async () => {
    await withOwner({}, async (_browser, { data }) => {
        const base = { board: 'news', title: '업데이트', createdAt: '2026-11-08T00:00:00Z' };
        const notice = data.normalizePost({ ...base, id: 'nt_20261108_1', commentable: false, likable: false });
        assert.deepEqual([notice.notice, notice.commentable, notice.likable], [true, false, false]);
        const plain = data.normalizePost({ ...base, id: 'p_5' });
        assert.deepEqual([plain.notice, plain.commentable, plain.likable, plain.hidden, plain.openReports], [false, true, true, false, 0]);
        const flagged = data.normalizePost({ ...base, id: 'p_6', hidden: true, openReports: 3 });
        assert.deepEqual([flagged.hidden, flagged.openReports], [true, 3]);
        assert.equal(data.normalizePost({ ...base, id: 'p_7', commentable: 'no' }).commentable, true, 'only a literal false closes comments');
    });
});

test('data layer: a notice carries its category and date', async () => {
    await withOwner({}, async (_browser, { data }) => {
        const notice = data.normalizePost({ id: 'nt_77', notice: true, badge: 'update', noticeDate: '2026-11-07', board: 'news', title: '업데이트 안내', views: 0, pinned: false });
        assert.deepEqual([notice.notice, notice.noticeBadge, notice.createdAt], [true, 'update', '2026-11-07']);
        assert.equal(data.normalizePost({ id: 'nt_78', board: 'news', title: 't', badge: 'bogus' }).noticeBadge, '', 'an unknown category is dropped');
        assert.equal(data.normalizePost({ id: 'p_8', board: 'free', title: 't', badge: 'update' }).noticeBadge, '', 'only notices have a category');
        assert.equal(data.normalizePost({ id: 'nt_79', board: 'news', title: 't', createdAt: '2026-11-01T00:00:00Z', noticeDate: '2026-11-07' }).createdAt, '2026-11-01T00:00:00Z');
    });
});

test('data layer: a hidden comment is still a placeholder for everyone; the text rides along only as hiddenBody', async () => {
    await withOwner({}, async (_browser, { data }) => {
        const [hidden, deleted, plain] = data.normalizeComments([
            { id: 'c_1', nickname: 'a', body: '숨긴 내용', hidden: true },
            { id: 'c_2', nickname: 'b', body: '지운 내용', deleted: true },
            { id: 'c_3', nickname: 'c', body: '보이는 내용' },
        ]);
        assert.deepEqual([hidden.gone, hidden.hidden, hidden.body, hidden.hiddenBody], [true, true, '', '숨긴 내용']);
        assert.deepEqual([deleted.gone, deleted.hidden, deleted.hiddenBody], [true, false, '']);
        assert.deepEqual([plain.gone, plain.hidden, plain.body], [false, false, '보이는 내용']);
    });
});

test('session profile keeps the operator flag', async () => {
    await withOwner({}, async (_browser, { session }) => {
        assert.equal(session.loadCommunitySession().isOperator, true);
        assert.equal(session.normalizeProfile({ userId: 'a', role: 'community' }).isOperator, false);
        assert.equal(session.normalizeProfile({ userId: 'a', isOperator: 'yes' }).isOperator, false);
    });
});
