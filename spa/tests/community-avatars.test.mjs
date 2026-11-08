// Profile photos (2026-11-08): the round photo next to a nickname. The browser shrinks the picture (centre square,
// 128x128 JPEG, under the server's ~37KB cell), the list shows letters first and photos later, and a server that does not
// know the fields simply keeps the first-letter circle. No live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { separateSessionStorage } from './helpers/feed-fixtures.mjs';
import {
    AVATAR_SIZE, AVATAR_MAX_BYTES, AVATAR_QUALITIES, avatarCrop, dataUrlBytes, fitAvatar, isAvatarKey, safeAvatarUrl, avatarInitial, chunkKeys,
} from '../src/lib/communityAvatarModel.mjs';
import { COMMUNITY_ACTIONS, COMMUNITY_CODES } from '../src/lib/communityContract.mjs';

const require = createRequire(import.meta.url);
const KEY_A = 'a1b2c3d4e5f6a7b8c9d0';
const KEY_B = '0123456789abcdef0123';
const JPEG = (size) => `data:image/jpeg;base64,${'A'.repeat(size)}`;

test('picture rules: 128px square, quality steps down from 0.8, the server cell caps it near 37KB', () => {
    assert.equal(AVATAR_SIZE, 128);
    assert.equal(AVATAR_MAX_BYTES, 37000);
    assert.equal(AVATAR_QUALITIES[0], 0.8);
    assert.ok(AVATAR_QUALITIES.every((value, index, list) => index === 0 || value < list[index - 1]), 'only ever lower');
    assert.equal(COMMUNITY_ACTIONS.setAvatar, 'community-set-avatar');
    assert.equal(COMMUNITY_ACTIONS.avatars, 'community-avatars');
    assert.equal(COMMUNITY_ACTIONS.adminRemoveAvatar, 'community-admin-remove-avatar');
    assert.equal(COMMUNITY_CODES.INVALID_IMAGE, 'INVALID_IMAGE');
});

test('centre crop: a wide or tall picture is cut to its middle square, a square is kept whole', () => {
    assert.deepEqual(avatarCrop(400, 200), { sx: 100, sy: 0, side: 200 });
    assert.deepEqual(avatarCrop(200, 400), { sx: 0, sy: 100, side: 200 });
    assert.deepEqual(avatarCrop(300, 300), { sx: 0, sy: 0, side: 300 });
    assert.deepEqual(avatarCrop(4001, 3000), { sx: 500, sy: 0, side: 3000 });
    assert.equal(avatarCrop(0, 10), null);
    assert.equal(avatarCrop(NaN, 10), null);
});

test('size of a data address in bytes, and the first quality that fits (null when none does)', () => {
    assert.equal(dataUrlBytes(JPEG(4000)), 3000);
    assert.equal(dataUrlBytes('not a data address'), 0);
    const tried = [];
    const sizes = { 0.8: 70000, 0.7: 60000, 0.6: 52000, 0.5: 40000 };
    const fit = fitAvatar((quality) => { tried.push(quality); return JPEG(sizes[quality] ?? 20000); });
    assert.deepEqual(tried.slice(0, 4), [0.8, 0.7, 0.6, 0.5], 'it steps down until the picture fits');
    assert.equal(fit.quality, 0.5);
    assert.ok(dataUrlBytes(fit.dataUrl) <= AVATAR_MAX_BYTES);
    assert.equal(fitAvatar(() => JPEG(90000)), null, 'a picture that never gets small enough is refused');
    assert.deepEqual(fitAvatar(() => JPEG(100)).quality, 0.8, 'a small picture keeps the best quality');
});

test('a key is 20 hex characters; an address is only drawn when it is a plain base64 image', () => {
    assert.equal(isAvatarKey(KEY_A), true);
    for (const bad of ['', 'xyz', 'A1B2C3D4E5F6A7B8C9D0', `${KEY_A}0`, null, undefined, 5, '../etc/passwd0000000']) assert.equal(isAvatarKey(bad), false, String(bad));
    assert.equal(safeAvatarUrl(JPEG(40)), JPEG(40));
    assert.equal(safeAvatarUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'https://x.example/a.jpg', 'data:image/jpeg;base64,AA"onerror=alert(1)', '', null, 7]) {
        assert.equal(safeAvatarUrl(bad), '', String(bad));
    }
    assert.equal(avatarInitial('새싹이'), '새');
    assert.equal(avatarInitial('  abc'), 'A');
    assert.equal(avatarInitial(''), '?');
    assert.equal(avatarInitial(null), '?');
    assert.deepEqual(chunkKeys(Array.from({ length: 120 }, (_, index) => `k${index}`), 50).map((chunk) => chunk.length), [50, 50, 20]);
});

const withStore = async (replies, body) => {
    const browser = fakeBrowser(replies);
    separateSessionStorage();
    try {
        const load = createLoader();
        const session = load('../../src/lib/communitySession.ts');
        session.saveCommunitySession(session.toCommunitySession({ userId: 'member1', role: 'community', nickname: '이웃', communityToken: 'ct_member' }));
        return await body({ browser, load, store: load('../../src/lib/communityAvatars.ts') });
    } finally { restoreBrowser(); }
};

test('the store asks only for keys it does not have, in one call (at most 50), and keeps the answer in localStorage', async () => {
    const replies = { 'community-avatars': (body) => ({ ok: true, avatars: Object.fromEntries(body.keys.map((key) => [key, JPEG(30)])) }) };
    await withStore(replies, async ({ browser, store }) => {
        const first = await store.fetchAvatars([KEY_A, KEY_B, KEY_A, 'bad-key']);
        assert.deepEqual(Object.keys(first).sort(), [KEY_A, KEY_B].sort());
        assert.deepEqual(browser.calls.map((call) => [call.action, call.communityToken, [...call.keys].sort()]), [['community-avatars', 'ct_member', [KEY_A, KEY_B].sort()]]);
        assert.deepEqual(Object.keys(store.readCachedAvatars([KEY_A, KEY_B, 'zzz'])).sort(), [KEY_A, KEY_B].sort(), 'cached keys come back without a call');
        await store.fetchAvatars([KEY_A, KEY_B]);
        assert.equal(browser.calls.length, 1, 'nothing missing, nothing asked');
        const many = Array.from({ length: 120 }, (_, index) => index.toString(16).padStart(20, '0'));
        await store.fetchAvatars(many);
        assert.deepEqual(browser.calls.slice(1).map((call) => call.keys.length), [50, 50, 20], 'chunks of at most 50 keys');
    });
});

test('the saved photos have a ceiling: past it the oldest go first; no token or phone is ever stored with them', async () => {
    const replies = { 'community-avatars': (body) => ({ ok: true, avatars: Object.fromEntries(body.keys.map((key) => [key, JPEG(30)])) }) };
    await withStore(replies, async ({ browser, store }) => {
        const keys = Array.from({ length: store.AVATAR_CACHE_MAX + 10 }, (_, index) => index.toString(16).padStart(20, '0'));
        for (const chunk of [keys.slice(0, 50), keys.slice(50)]) await store.fetchAvatars(chunk);
        const kept = Object.keys(store.readCachedAvatars(keys));
        assert.equal(kept.length, store.AVATAR_CACHE_MAX);
        assert.ok(!kept.includes(keys[0]) && kept.includes(keys[keys.length - 1]), 'the oldest were dropped');
        assert.ok(!browser.store.get(store.AVATAR_STORE_KEY).includes('ct_member'), 'the login token is not in the photo store');
    });
});

test('a server that does not know the photo actions, or answers with garbage, leaves letters: no throw, no repeated asking', async () => {
    await withStore({ 'community-avatars': { ok: false, error: 'Unauthorized' } }, async ({ browser, store }) => {
        assert.deepEqual(await store.fetchAvatars([KEY_A]), {});
        assert.deepEqual(await store.fetchAvatars([KEY_B]), {});
        assert.equal(browser.calls.length, 1, 'after a refusal it waits before asking again');
    });
    await withStore({ 'community-avatars': { ok: true, avatars: { [KEY_A]: 'javascript:alert(1)', [KEY_B]: 5, nokey: JPEG(10) } } }, async ({ store }) => {
        assert.deepEqual(await store.fetchAvatars([KEY_A, KEY_B]), {});
    });
    await withStore({ 'community-avatars': { ok: true } }, async ({ store }) => {
        assert.deepEqual(await store.fetchAvatars([KEY_A]), {});
    });
});

test('set / remove my photo: the data address goes with the token, null removes; the new key lands in the stored login', async () => {
    const replies = { 'community-set-avatar': (body) => ({ ok: true, avatarKey: body.image ? KEY_A : null }) };
    await withStore(replies, async ({ browser, load, store }) => {
        const set = await store.setMyAvatar(JPEG(500));
        assert.deepEqual([set.ok, set.avatarKey], [true, KEY_A]);
        assert.deepEqual([browser.calls[0].action, browser.calls[0].communityToken, browser.calls[0].image], ['community-set-avatar', 'ct_member', JPEG(500)]);
        const session = load('../../src/lib/communitySession.ts');
        assert.equal(session.loadCommunitySession().avatarKey, KEY_A);
        assert.equal(store.readCachedAvatars([KEY_A])[KEY_A], JPEG(500), 'my new photo shows at once, without another call');
        const removed = await store.setMyAvatar(null);
        assert.deepEqual([removed.ok, removed.avatarKey], [true, null]);
        assert.equal(browser.calls[1].image, null);
        assert.equal(session.loadCommunitySession().avatarKey, '');
    });
});

test('a refused photo says why in one sentence; a picture that is not an image address is never sent', async () => {
    await withStore({ 'community-set-avatar': { ok: false, code: 'INVALID_IMAGE', message: 'bad image' } }, async ({ browser, store }) => {
        const refused = await store.setMyAvatar(JPEG(500));
        assert.deepEqual([refused.ok, refused.message], [false, '사진을 올릴 수 없어요. 다른 사진으로 해 주세요.']);
        const blocked = await store.setMyAvatar('javascript:alert(1)');
        assert.equal(blocked.ok, false);
        assert.equal(browser.calls.length, 1, 'only the real one was sent');
    });
});

test('owner removes someone else\'s photo with the author key (or the post id); a missing photo is told plainly', async () => {
    await withStore({ 'community-admin-remove-avatar': (body) => (body.targetKey === KEY_A ? { ok: true, removed: true } : { ok: false, code: 'AVATAR_NOT_FOUND', message: 'none' }) }, async ({ browser, load }) => {
        const moderation = load('../../src/lib/communityModeration.ts');
        assert.equal((await moderation.moderationApi.removeAvatar({ targetKey: KEY_A })).ok, true);
        assert.equal((await moderation.moderationApi.removeAvatar({ id: 'p_1' })).ok, false);
        assert.deepEqual(browser.calls.map((call) => [call.action, call.targetKey, call.id, call.communityToken]), [
            ['community-admin-remove-avatar', KEY_A, undefined, 'ct_member'], ['community-admin-remove-avatar', undefined, 'p_1', 'ct_member'],
        ]);
        const account = createLoader()('../../src/lib/accountModel.mjs');
        assert.equal(account.describeAvatarRemoveFailure({ code: 'AVATAR_NOT_FOUND' }), '지울 사진이 없어요.');
        assert.equal(account.describeAvatarRemoveFailure({ code: 'X', message: '서버 문장' }), '서버 문장');
    });
});

test('posts, comments and profiles carry avatarKey only when it is a real key', () => {
    const load = createLoader();
    const data = load('../../src/lib/communityData.ts');
    assert.equal(data.normalizePost({ id: 'p_1', avatarKey: KEY_A }).avatarKey, KEY_A);
    for (const bad of [undefined, null, 'nope', 12, `${KEY_A}00`]) assert.equal(data.normalizePost({ id: 'p_1', avatarKey: bad }).avatarKey, '');
    assert.equal(data.normalizeComment({ id: 'c_1', avatarKey: KEY_B }).avatarKey, KEY_B);
    assert.equal(data.normalizeComment({ id: 'c_1', avatarKey: '<x>' }).avatarKey, '');
    const session = load('../../src/lib/communitySession.ts');
    assert.equal(session.normalizeProfile({ userId: 'a', avatarKey: KEY_A }).avatarKey, KEY_A);
    assert.equal(session.normalizeProfile({ userId: 'a' }).avatarKey, '');
});

function render(file, props, exportName = 'default') {
    fakeBrowser();
    separateSessionStorage();
    try {
        const Component = createLoader()(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const text = (html) => html.replace(/<[^>]+>/g, '');

test('Avatar: a photo is a round image with empty alt (the nickname is next to it); no photo or a bad address is the first letter', () => {
    const photo = render('../../src/components/community/Avatar.tsx', { name: '새싹이', src: JPEG(40), size: 32 });
    assert.match(photo, /<img[^>]*src="data:image\/jpeg;base64,/);
    assert.match(photo, /alt=""/);
    assert.match(photo, /width:32px/);
    const letter = render('../../src/components/community/Avatar.tsx', { name: '새싹이', size: 32 });
    assert.ok(!/<img/.test(letter));
    assert.equal(text(letter), '새');
    assert.match(letter, /aria-hidden="true"/);
    const hostile = render('../../src/components/community/Avatar.tsx', { name: 'abc', src: 'javascript:alert(1)', size: 28 });
    assert.ok(!/<img/.test(hostile) && !hostile.includes('javascript:'));
});

test('/me: round photo with [프로필 사진 바꾸기] and, when there is a photo, [사진 지우기]; both are tall enough to tap', () => {
    const base = {
        userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, isOperator: false, score: 150,
        activity: { posts: 4, comments: 9, visits: 21, likes: null }, grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' }, linked: false, rewards: [], avatarKey: '',
    };
    const props = (profile) => ({ profile, detail: { ...profile, phoneVerified: true, phoneMasked: '', createdAt: '' }, onChanged() {}, onDetail() {} });
    const without = render('../../src/components/account/ProfileCard.tsx', props(base));
    assert.match(text(without), /프로필 사진 바꾸기/);
    assert.ok(!/사진 지우기/.test(text(without)), 'nothing to remove yet');
    assert.match(without, /<input[^>]*type="file"[^>]*accept="image\/\*"/);
    const withPhoto = render('../../src/components/account/ProfileCard.tsx', props({ ...base, avatarKey: KEY_A }));
    assert.match(text(withPhoto), /사진 지우기/);
    assert.match(withPhoto, /me-avatar-btn/);
});

test('list rows show the round photo or letter next to the author; the list never waits for photos', () => {
    const data = createLoader()('../../src/lib/communityData.ts');
    const model = createLoader()('../../src/lib/communityModel.mjs');
    const rows = [data.normalizePost({ id: 'p_1', board: 'free', title: 't', nickname: '새싹이', avatarKey: KEY_A, createdAt: '2026-11-08T00:00:00Z' })];
    const html = render('../../src/components/community/PostList.tsx', {
        title: '자유게시판', boardId: 'free', boards: model.boardList(null), pinned: [], posts: rows, total: 1, page: 1, totalPages: 1, sort: 'latest', onVisit() {},
    });
    assert.match(html, /cm-avatar[^>]*aria-hidden="true"[^>]*>새</);
    assert.match(html, /cm-row-author/);
});
