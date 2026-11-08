// Notice board screens (2026-11-08): the write form opened from 공지사항, and the 공지사항 name on list rows and post headers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-08T12:00:00+09:00').getTime();

function render(file, props) {
    fakeBrowser();
    try {
        const Component = createLoader()(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}

const loadLib = () => { const loader = createLoader(); return { data: loader('../../src/lib/communityData.ts'), model: loader('../../src/lib/communityModel.mjs') }; };
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const rawPost = (id, board, extra = {}) => ({
    id, board, title: `제목 ${id}`, excerpt: '', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, isOperator: false,
    createdAt: '2026-11-08T11:25:00+09:00', updatedAt: '', views: 10, likes: 3, comments: 0, pinned: false, status: '', mine: false, liked: false, ...extra,
});
const posts = (...raws) => raws.map((raw) => loadLib().data.normalizePost(raw));
const profileOf = (extra = {}) => ({
    userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, score: 150,
    activity: { posts: 4, comments: 9, visits: 21 }, grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' }, linked: false, ...extra,
});
const listProps = (overrides = {}) => ({
    title: '공지사항', boardId: 'notice', boards: loadLib().model.boardList(null), pinned: [], posts: [], total: 0, page: 1, totalPages: 1,
    sort: 'latest', now: NOW, onVisit() {}, ...overrides,
});

test('write form opened from 공지사항: no notice option, and one sentence says why (owner and member wording differ)', () => {
    const { model } = loadLib();
    const props = (profile) => ({ boards: model.boardList(null), defaultBoard: 'notice', profile, onDone() {}, onCancel() {} });
    const owner = render('../../src/components/community/PostWriteForm.tsx', props(profileOf({ role: 'owner', canWriteNews: true })));
    assert.ok(![...owner.matchAll(/<option value="([^"]+)"/g)].some((match) => match[1] === 'notice'));
    assert.match(text(owner), /공지는 어드민 홈 운영에서 써요\./);
    const member = render('../../src/components/community/PostWriteForm.tsx', props(profileOf()));
    assert.match(text(member), /공지사항에는 글을 쓸 수 없어요/);
    assert.match(member, /<option value="free" selected/);
    const free = render('../../src/components/community/PostWriteForm.tsx', { ...props(profileOf()), defaultBoard: 'free' });
    assert.ok(!/공지/.test(text(free)), 'other boards show no notice sentence');
});

test('notice rows: the list names the board 공지사항 and hides views; the post header too', () => {
    const rows = posts(rawPost('nt_5', 'news', { notice: true, badge: 'update', views: 0 }), rawPost('n_1', 'news'));
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: rows, total: 2 }));
    assert.match(html, /cm-row-board[^>]*>공지사항</);
    assert.match(html, /cm-row-board[^>]*>최근 소식</);
    const view = render('../../src/components/community/PostView.tsx', { post: rows[0], boards: loadLib().model.boardList(null), onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {}, now: NOW });
    assert.match(view, /cm-board-tag[^>]*>공지사항</);
});
