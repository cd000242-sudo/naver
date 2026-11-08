// Forum stage on the data and request layer (contract 1114): post fields, the profile level, what is sent when
// writing or editing, the level-up call, one picture fetched on demand, the promo platform in the feed request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { member, raw } from './helpers/feed-fixtures.mjs';

const load = createLoader();

async function withMember(replies, body, profile = member()) {
    const browser = fakeBrowser(replies);
    try {
        const session = load('../../src/lib/communitySession.ts');
        session.saveCommunitySession(session.toCommunitySession(profile));
        return await body(browser, { api: load('../../src/lib/communityApi.ts'), data: load('../../src/lib/communityData.ts'), session });
    } finally { restoreBrowser(); }
}
const last = (browser) => browser.calls[browser.calls.length - 1];

test('a post carries its format, its picture ids and whether it has a picture', () => {
    const { normalizePost } = load('../../src/lib/communityData.ts');
    const rich = normalizePost(raw('p_1', 'free', { format: 'rich', imageIds: ['a1', 'b2', 5, '<x>'], hasImage: true }));
    assert.equal(rich.format, 'rich');
    assert.deepEqual(rich.imageIds, ['a1', 'b2'], 'only well-formed ids survive');
    assert.equal(rich.hasImage, true);
    const old = normalizePost(raw('p_2', 'free'));
    assert.equal(old.format, '');
    assert.deepEqual(old.imageIds, []);
    assert.equal(old.hasImage, false);
    assert.equal(normalizePost(raw('p_3', 'free', { format: 'weird', hasImage: 'yes' })).format, '', 'only the word rich counts');
    assert.equal(normalizePost(raw('p_3', 'free', { hasImage: 'yes' })).hasImage, false);
});

test('the profile has a level: associates are 준회원 whatever the server says about the grade, everyone else a member', () => {
    const { normalizeProfile } = load('../../src/lib/communitySession.ts');
    const base = member();
    const associate = normalizeProfile({ ...base, level: 'associate', levelUp: { post: true, comment: false }, score: 4000, grade: { key: 'tree', label: '나무' } });
    assert.equal(associate.level, 'associate');
    assert.deepEqual(associate.levelUp, { post: true, comment: false });
    assert.deepEqual([associate.grade.key, associate.grade.label], ['associate', '준회원']);
    assert.equal(associate.score, 4000, 'the score still counts');
    const grandfathered = normalizeProfile(base);
    assert.equal(grandfathered.level, 'member');
    assert.deepEqual(grandfathered.levelUp, { post: false, comment: false });
    assert.equal(grandfathered.grade.key, 'sprout');
    const owner = normalizeProfile({ ...base, role: 'owner', level: 'associate' });
    assert.equal(owner.level, 'member', 'the owner is always a member');
    assert.equal(owner.grade.key, 'forest');
});

test('the level survives a save and a load of the stored login', async () => {
    await withMember({}, async (_browser, { session }) => {
        session.saveCommunitySession(session.toCommunitySession({ ...member(), level: 'associate', levelUp: { post: false, comment: true } }));
        const loaded = session.loadCommunitySession();
        assert.equal(loaded.level, 'associate');
        assert.deepEqual(loaded.levelUp, { post: false, comment: true });
    });
});

test('writing a rich post sends the format and the pictures; a plain post sends neither', async () => {
    await withMember({ 'community-post-write': { ok: true } }, async (browser, { api }) => {
        const images = [{ id: 'a1', mime: 'image/jpeg', data: 'QUJD' }];
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '{"v":1,"blocks":[]}', format: 'rich', images }, 'w_req');
        assert.deepEqual(last(browser), {
            board: 'free', title: '제목', body: '{"v":1,"blocks":[]}', format: 'rich', images, requestId: 'w_req', communityToken: 'ct_member_secret', action: 'community-post-write',
        });
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '{"v":1,"blocks":[]}', format: 'rich', images: [] }, 'w_req2');
        assert.ok(!('images' in last(browser)), 'no pictures: the field is left out');
        await api.boardApi.writePost({ board: 'free', title: '제목', body: '평문' }, 'w_req3');
        assert.ok(!('format' in last(browser)) && !('images' in last(browser)));
    });
});

test('a promo post sends the platform with the address; editing keeps its fields as before', async () => {
    await withMember({ 'community-post-write': { ok: true }, 'community-post-update': { ok: true } }, async (browser, { api }) => {
        await api.boardApi.writePost({ board: 'promo', title: '제목', body: '소개', url: 'https://abc.blogspot.com/1', platform: 'google' }, 'w_p');
        assert.deepEqual(last(browser), {
            board: 'promo', title: '제목', url: 'https://abc.blogspot.com/1', platform: 'google', summary: '소개', requestId: 'w_p', communityToken: 'ct_member_secret', action: 'community-post-write',
        });
        await api.boardApi.updatePost('p_1', { title: '제목', body: '소개', promo: true });
        assert.deepEqual(last(browser), { id: 'p_1', title: '제목', summary: '소개', communityToken: 'ct_member_secret', action: 'community-post-update' });
        const images = [{ id: 'n1', mime: 'image/jpeg', data: 'QUJD' }];
        await api.boardApi.updatePost('p_2', { title: '제목', body: '{"v":1,"blocks":[]}', promo: false, images });
        assert.deepEqual(last(browser), { id: 'p_2', title: '제목', body: '{"v":1,"blocks":[]}', images, communityToken: 'ct_member_secret', action: 'community-post-update' });
    });
});

test('the list asks for one platform of the promo board only', async () => {
    await withMember({ 'community-posts': { ok: true, posts: [] } }, async (browser, { api }) => {
        await api.boardApi.posts({ board: 'promo', sort: 'latest', page: 1, platform: 'google' });
        assert.equal(last(browser).platform, 'google');
        await api.boardApi.posts({ board: 'free', sort: 'latest', page: 1, platform: 'google' });
        assert.ok(!('platform' in last(browser)), 'other boards have no platform');
        await api.boardApi.posts({ board: 'promo', sort: 'latest', page: 1 });
        assert.equal(last(browser).platform, 'naver', 'naver is the default list');
    });
});

test('[등업 신청] is one call with the token; a refusal keeps what is still missing', async () => {
    const refusal = { ok: false, code: 'LEVEL_UP_NOT_READY', message: '조건이 아직이에요.', need: { post: false, comment: true } };
    await withMember({ 'community-level-up': refusal }, async (browser, { api }) => {
        const result = await api.boardApi.levelUp();
        assert.deepEqual(last(browser), { communityToken: 'ct_member_secret', action: 'community-level-up' });
        assert.equal(result.ok, false);
        assert.deepEqual(result.need, { post: false, comment: true });
    });
    await withMember({ 'community-level-up': { ok: true, level: 'member' } }, async (_browser, { api }) => {
        const result = await api.boardApi.levelUp();
        assert.equal(result.ok, true);
        assert.equal(result.level, 'member');
    });
});

test('one picture is fetched on demand from the server, as a jpeg data address, and remembered', async () => {
    const browser = fakeBrowser();
    try {
        const urls = [];
        globalThis.fetch = async (url) => {
            urls.push(String(url));
            return { text: async () => JSON.stringify({ ok: true, mime: 'image/jpeg', data: '/9j/4AAQ' }) };
        };
        const { fetchPostImage, clearPostImageCache } = load('../../src/lib/communityPostImage.ts');
        clearPostImageCache();
        const first = await fetchPostImage('p_1', 'a1');
        assert.deepEqual(first, { ok: true, src: 'data:image/jpeg;base64,/9j/4AAQ' });
        assert.match(urls[0], /\?action=community-post-image&postId=p_1&imageId=a1$/);
        assert.ok(!urls[0].includes('communityToken'), 'a token never rides in an address');
        await fetchPostImage('p_1', 'a1');
        assert.equal(urls.length, 1, 'the second time comes from memory');
        void browser;
    } finally { restoreBrowser(); }
});

test('a picture reply that is not a jpeg, or a missing post, shows nothing', async () => {
    const browser = fakeBrowser();
    try {
        let reply = { ok: true, mime: 'image/svg+xml', data: 'PHN2Zz4=' };
        globalThis.fetch = async () => ({ text: async () => JSON.stringify(reply) });
        const { fetchPostImage, clearPostImageCache } = load('../../src/lib/communityPostImage.ts');
        clearPostImageCache();
        assert.equal((await fetchPostImage('p_1', 'a1')).ok, false);
        reply = { ok: false, code: 'NOT_FOUND', message: '없는 글이에요.' };
        assert.equal((await fetchPostImage('p_1', 'a2')).ok, false);
        reply = { ok: true, mime: 'image/jpeg', data: '<script>' };
        assert.equal((await fetchPostImage('p_1', 'a3')).ok, false);
        for (const [postId, imageId] of [['p 1', 'a1'], ['p_1', '../a']]) assert.equal((await fetchPostImage(postId, imageId)).ok, false, 'odd ids are never put in an address');
        void browser;
    } finally { restoreBrowser(); }
});

// ---- the feed: promo sub-tabs ----
import { feedReply, legacyReplies, withFeed } from './helpers/feed-fixtures.mjs';

test('the feed asks for the platform of the promo board; other boards carry none', async () => {
    await withFeed({ 'community-feed': feedReply() }, async ({ browser, feed }) => {
        await feed.loadCommunityFeed({ board: 'promo', sort: 'latest', page: 1, platform: 'google' });
        await feed.loadCommunityFeed({ board: 'promo', sort: 'latest', page: 1 });
        await feed.loadCommunityFeed({ board: 'free', sort: 'latest', page: 1, platform: 'google' });
        assert.deepEqual(browser.calls.map((call) => call.platform), ['google', 'naver', undefined]);
    });
});

test('an old server is read the old way with the same platform', async () => {
    await withFeed({ ...legacyReplies({ ok: false, code: 'Unauthorized', message: 'Unauthorized' }) }, async ({ browser, feed }) => {
        await feed.loadCommunityFeed({ board: 'promo', sort: 'latest', page: 1, platform: 'google' });
        const lists = browser.calls.filter((call) => call.action === 'community-posts');
        assert.equal(lists.length, 1);
        assert.equal(lists[0].platform, 'google');
    });
});

test('the two promo lists are saved apart', async () => {
    await withFeed({ 'community-feed': (body) => feedReply({ posts: [raw(`p_${body.platform}`, 'promo')], pinned: [] }) }, async ({ feed }) => {
        await feed.loadCommunityFeed({ board: 'promo', sort: 'latest', page: 1, platform: 'google' });
        await feed.loadCommunityFeed({ board: 'promo', sort: 'latest', page: 1, platform: 'naver' });
        assert.deepEqual(feed.peekCommunityFeed({ board: 'promo', sort: 'latest', page: 1, platform: 'google' }).bundle.posts.map((post) => post.id), ['p_google']);
        assert.deepEqual(feed.peekCommunityFeed({ board: 'promo', sort: 'latest', page: 1, platform: 'naver' }).bundle.posts.map((post) => post.id), ['p_naver']);
    });
});
