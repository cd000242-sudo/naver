// Moderator view of the community (2026-11-08), rendered from the real components: the buttons exist for the owner
// only, a notice post (nt_) loses hide / delete, hidden and reported items are marked, comments can be closed by the
// server. The click-through (calls and refusals) is checked in the browser with a scripted server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const COMMUNITY_KEY = 'leaderspro.community.session.v1';
const NOW = new Date('2026-11-08T12:00:00+09:00').getTime();
const stored = (extra = {}) => ({
    userId: 'boss', role: 'community', nickname: '사장님', needsNickname: false, canWriteNews: false, isOperator: false, score: 0,
    activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' },
    linked: false, communityToken: 'ct_x', sessionExpiresAt: '2099-01-01T00:00:00.000Z', savedAt: '2026-11-08T00:00:00Z', ...extra,
});
const owner = stored({ role: 'owner', isOperator: true, canWriteNews: true });
const member = stored({ userId: 'user01', nickname: '회원' });

function show(file, props, { exportName = 'default', community } = {}) {
    const browser = fakeBrowser();
    if (community) browser.store.set(COMMUNITY_KEY, JSON.stringify(community));
    try {
        const loader = createLoader();
        const Component = loader(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const make = (raw) => {
    const loader = createLoader();
    return loader('../../src/lib/communityData.ts').normalizePost({ id: 'p_1', board: 'free', title: '제목', body: '본문', nickname: '글쓴이', createdAt: '2026-11-08T11:00:00+09:00', ...raw });
};
const boards = () => createLoader()('../../src/lib/communityModel.mjs').boardList(null);
const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const buttonTexts = (html) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, '').trim());

const adminBar = (post, profile) => show('../../src/components/community/PostAdminBar.tsx', { post, boards: boards(), profile, onChanged() {}, onRemoved() {} });

test('post admin bar: nothing at all for a member (the buttons do not exist, not just hidden)', () => {
    const html = adminBar(make({}), createLoader()('../../src/lib/communitySession.ts').toCommunitySession(member));
    assert.equal(html, '');
});

test('post admin bar: the owner gets hide, pin and delete on someone else\'s post', () => {
    const profile = createLoader()('../../src/lib/communitySession.ts').toCommunitySession(owner);
    const html = adminBar(make({}), profile);
    assert.deepEqual(buttonTexts(html), ['숨기기', '고정', '삭제']);
    assert.match(html, /aria-label="관리자 도구"/);
});

test('post admin bar: a hidden, pinned post offers the opposite actions', () => {
    const profile = createLoader()('../../src/lib/communitySession.ts').toCommunitySession(owner);
    const html = adminBar(make({ hidden: true, pinned: true }), profile);
    assert.deepEqual(buttonTexts(html), ['보이기', '고정 해제', '삭제']);
    assert.match(words(html), /숨겨진 글/);
});

test('post admin bar: inquiry and request posts get the two-state switch with the current one pressed', () => {
    const profile = createLoader()('../../src/lib/communitySession.ts').toCommunitySession(owner);
    const inquiry = adminBar(make({ board: 'inquiry', status: '대기' }), profile);
    assert.deepEqual(buttonTexts(inquiry).slice(0, 2), ['대기', '답변 완료']);
    assert.match(inquiry, /aria-pressed="true"[^>]*>대기</);
    assert.match(inquiry, /aria-pressed="false"[^>]*>답변 완료</);
    const request = adminBar(make({ board: 'request', status: '반영됨' }), profile);
    assert.deepEqual(buttonTexts(request).slice(0, 2), ['검토 중', '반영됨']);
    assert.match(request, /aria-pressed="true"[^>]*>반영됨</);
});

test('post admin bar: a notice post has no moderator button at all, only where to edit it', () => {
    const profile = createLoader()('../../src/lib/communitySession.ts').toCommunitySession(owner);
    const html = adminBar(make({ id: 'nt_20261108_1', board: 'news' }), profile);
    assert.deepEqual(buttonTexts(html), []);
    assert.match(words(html), /공지는 어드민 홈 운영에서 고쳐요/);
});

test('post admin bar: my own post leaves the delete to the author buttons', () => {
    const profile = createLoader()('../../src/lib/communitySession.ts').toCommunitySession(owner);
    assert.deepEqual(buttonTexts(adminBar(make({ mine: true }), profile)), ['숨기기', '고정']);
});

test('post view: a notice shows its category, its date, no view count, no edit / delete / report, and keeps the like button', () => {
    const notice = make({ id: 'nt_5', board: 'news', badge: 'update', views: 0, likes: 2, mine: true });
    const html = show('../../src/components/community/PostView.tsx', { post: notice, boards: boards(), now: NOW, onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {} });
    assert.match(html, /<span class="lp-state lp-state-notice">공지<\/span>/);
    assert.match(html, /<span class="lp-state lp-state-notice-kind">업데이트<\/span>/);
    assert.doesNotMatch(words(html), /조회/);
    assert.deepEqual(buttonTexts(html).filter((text) => ['수정', '삭제', '신고'].includes(text)), []);
    assert.match(html, /aria-pressed/, 'likes stay open unless the server closes them');
});

test('post view: a notice wears the 공지 badge and has no like button when the server says likes are closed', () => {
    const notice = make({ id: 'nt_1', board: 'news', likable: false, likes: 7 });
    const html = show('../../src/components/community/PostView.tsx', { post: notice, boards: boards(), now: NOW, onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {} });
    assert.match(html, /<span class="lp-state lp-state-notice">공지<\/span>/);
    assert.match(html, /cm-like-static/);
    assert.doesNotMatch(html, /aria-pressed/);
    const plain = show('../../src/components/community/PostView.tsx', { post: make({}), boards: boards(), now: NOW, onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {} });
    assert.doesNotMatch(plain, /공지/);
    assert.match(plain, /aria-pressed/);
});

test('list rows: 공지 and its category for notices (no view count); 숨김 and 신고 N only in the moderator view', () => {
    const posts = [make({ id: 'nt_2', board: 'news', badge: 'important', views: 0 }), make({ id: 'p_3', hidden: true, openReports: 2 })];
    const props = (moderator) => ({ title: '전체글', boardId: 'all', boards: boards(), pinned: [], posts, total: 2, page: 1, totalPages: 1, sort: 'latest', now: NOW, moderator, onVisit() {} });
    const member = words(show('../../src/components/community/PostList.tsx', props(false)));
    assert.ok(member.includes('공지') && member.includes('중요'));
    assert.ok(!member.includes('숨김') && !member.includes('신고 2'));
    const admin = words(show('../../src/components/community/PostList.tsx', props(true)));
    assert.ok(admin.includes('공지') && admin.includes('숨김') && admin.includes('신고 2'));
});

const comments = () => createLoader()('../../src/lib/communityData.ts').normalizeComments([
    { id: 'c_1', nickname: '이웃', body: '보이는 댓글', createdAt: '2026-11-08T11:00:00+09:00' },
    { id: 'c_2', nickname: '숨김이', body: '가려진 내용', hidden: true, createdAt: '2026-11-08T11:00:00+09:00' },
    { id: 'c_3', nickname: '지움이', body: '지운 내용', deleted: true, createdAt: '2026-11-08T11:00:00+09:00' },
]);

const tree = (profile) => show('../../src/components/community/CommentSection.tsx', {
    postId: 'p_1', comments: comments(), profile, onComments() {}, onReload: async () => {}, onReport() {}, commentable: true,
});

test('comments: the owner can hide / show and delete; a hidden comment keeps its text for the owner only', () => {
    const toProfile = (raw) => createLoader()('../../src/lib/communitySession.ts').toCommunitySession(raw);
    const html = tree(toProfile(owner));
    assert.equal(buttonTexts(html).filter((text) => text === '숨기기').length, 1);
    assert.equal(buttonTexts(html).filter((text) => text === '보이기').length, 1);
    assert.equal(buttonTexts(html).filter((text) => text === '삭제').length, 2, 'visible + hidden comment; the deleted one has no buttons');
    assert.match(words(html), /숨긴 댓글/);
    assert.match(words(html), /가려진 내용/);
    const plain = words(tree(toProfile(member)));
    assert.ok(!plain.includes('가려진 내용') && !plain.includes('지운 내용'));
    assert.deepEqual(buttonTexts(tree(toProfile(member))).filter((text) => ['숨기기', '보이기'].includes(text)), []);
});

test('comments: when the server closes comments the box is gone and one short line says so', () => {
    const profile = createLoader()('../../src/lib/communitySession.ts').toCommunitySession(member);
    const html = show('../../src/components/community/CommentSection.tsx', {
        postId: 'nt_1', comments: [], profile, onComments() {}, onReload: async () => {}, onReport() {}, commentable: false,
    });
    assert.doesNotMatch(html, /<textarea/);
    assert.match(words(html), /이 글은 댓글을 받지 않아요/);
});

const report = (extra = {}) => ({
    reportId: 'r_1', targetType: 'post', targetId: 'p_1', reasonLabel: '광고·도배', detail: '링크가 많아요', reporterNickname: '이웃',
    createdAt: '2026-11-08T11:00:00+09:00', status: 'open', target: { missing: false, board: 'free', postId: 'p_1', title: '문제 글', excerpt: '앞부분', nickname: '글쓴이', hidden: false }, ...extra,
});
const reportProps = (extra = {}) => ({
    reports: [report()], status: 'open', page: 1, totalPages: 1, loading: false, error: '', busyId: '', now: NOW,
    onResolve() {}, onHideToggle() {}, onStatus() {}, onPage() {}, onRetry() {}, ...extra,
});

test('report list: reason, who and what, with the three things an owner does', () => {
    const html = show('../../src/components/community/ReportList.tsx', reportProps());
    const text = words(html);
    for (const part of ['광고·도배', '링크가 많아요', '이웃', '문제 글', '글쓴이']) assert.ok(text.includes(part), part);
    assert.ok(buttonTexts(html).includes('문제 없어요'));
    assert.ok(buttonTexts(html).includes('조치했어요'));
    assert.ok(buttonTexts(html).includes('숨기기'));
    assert.match(html, /href="\/community\?board=free&amp;post=p_1"/);
});

test('report list: a hidden target offers 보이기; a vanished one has no open / hide buttons; empty and error words', () => {
    const hidden = show('../../src/components/community/ReportList.tsx', reportProps({ reports: [report({ target: { ...report().target, hidden: true } })] }));
    assert.ok(buttonTexts(hidden).includes('보이기'));
    const gone = show('../../src/components/community/ReportList.tsx', reportProps({ reports: [report({ target: { missing: true, board: '', postId: '', title: '', excerpt: '', nickname: '', hidden: false } })] }));
    assert.ok(!buttonTexts(gone).includes('숨기기'));
    assert.doesNotMatch(gone, /post=p_1/);
    assert.match(words(gone), /이미 지워졌어요/);
    assert.match(words(show('../../src/components/community/ReportList.tsx', reportProps({ reports: [] }))), /처리할 신고가 없어요/);
    assert.match(words(show('../../src/components/community/ReportList.tsx', reportProps({ reports: [], error: '운영자만 할 수 있습니다.' }))), /운영자만 할 수 있습니다\./);
});

test('community page: the 신고 목록 button appears for the owner, never for a member', () => {
    const page = (community) => show('../../src/pages/CommunityPage.tsx', {}, { community });
    assert.match(words(page(owner)), /신고 목록/);
    assert.match(page(owner), /href="\/community\?reports=1"/);
    assert.doesNotMatch(page(member), /신고 목록/);
    assert.doesNotMatch(page(member), /reports=1/);
});
