// What the reader sees while the community is fast (2026-11-08), rendered from the real components: the grey-bar
// skeleton on a first visit, the small refresh sign over rows that stay, rows and comments that are still being
// sent (with the resend), and the detail page drawn from what the list already knew. Server text stays plain text.
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
        const loader = createLoader();
        const Component = loader(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const modules = () => {
    const loader = createLoader();
    return { data: loader('../../src/lib/communityData.ts'), model: loader('../../src/lib/communityModel.mjs'), posts: loader('../../src/lib/communityPostOutbox.ts') };
};
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const raw = (id, board, extra = {}) => ({
    id, board, title: `제목 ${id}`, excerpt: '요약 문장', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, createdAt: '2026-11-08T11:25:00+09:00',
    views: 10, likes: 3, comments: 0, ...extra,
});
const listProps = (overrides = {}) => {
    const { model } = modules();
    return { title: '전체글', boardId: 'all', boards: model.boardList(null), pinned: [], posts: [], total: 0, page: 1, totalPages: 1, sort: 'latest', now: NOW, onVisit() {}, ...overrides };
};
const LIST = '../../src/components/community/PostList.tsx';

test('first visit with nothing saved: grey bars and "불러오는 중이에요", not an empty page', () => {
    const html = render(LIST, listProps({ loading: true }));
    assert.match(text(html), /불러오는 중이에요/);
    assert.equal((html.match(/class="cm-skel-row"/g) || []).length, 7, 'bars where the rows will be');
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(text(html), /아직 올라온 글이 없어요/, 'never says "no posts" while loading');
});

test('a refresh over drawn rows: a small sign, the rows stay, no skeleton', () => {
    const { data } = modules();
    const rows = [data.normalizePost(raw('p_1', 'free')), data.normalizePost(raw('p_2', 'request'))];
    const busy = render(LIST, listProps({ posts: rows, total: 2, refreshing: true }));
    assert.match(busy, /class="cm-refresh on"/);
    assert.match(text(busy), /새로 불러오는 중/);
    assert.match(text(busy), /제목 p_1/);
    assert.match(text(busy), /제목 p_2/);
    assert.doesNotMatch(busy, /cm-skel/);
    const idle = render(LIST, listProps({ posts: rows, total: 2, refreshing: false }));
    assert.match(idle, /class="cm-refresh"/, 'the sign keeps its place, so nothing jumps when it goes');
    assert.doesNotMatch(idle, /cm-refresh on/);
});

test('my own post: first row, "보내는 중", not a link yet; a failed one shows the reason, [다시 보내기] and [지우기]', () => {
    const { posts, data } = modules();
    const author = { nickname: '이웃', grade: { key: 'sprout', label: '새싹' }, isOperator: false };
    const sending = posts.newOutboxEntry({ board: 'free', title: '막 쓴 글', body: '내용' }, author).post;
    const failed = { ...sending, id: 'pending_x2', title: '못 보낸 글', delivery: 'failed', failure: '오늘은 더 올릴 수 없어요.' };
    const server = data.normalizePost(raw('p_1', 'free'));
    const html = render(LIST, listProps({ local: [sending, failed], posts: [server], total: 1 }));
    const titles = [...html.matchAll(/<span class="t">([^<]*)<\/span>/g)].map((match) => match[1]);
    assert.deepEqual(titles, ['막 쓴 글', '못 보낸 글', '제목 p_1'], 'mine first, then the server rows');
    assert.match(html, /class="cm-sending"[^>]*>보내는 중</);
    assert.match(html, /오늘은 더 올릴 수 없어요\./);
    assert.match(html, />다시 보내기</);
    assert.match(html, />지우기</);
    assert.equal((html.match(/href="\/community\?post=/g) || []).length, 1, 'only the real post is a link');
    assert.doesNotMatch(html, /아직 올라온 글이 없어요/);
});

test('a hostile title in a sending row is drawn as text', () => {
    const { posts } = modules();
    const entry = posts.newOutboxEntry({ board: 'free', title: '<img src=x onerror=alert(1)>', body: '내용' }, { nickname: '<b>x</b>', grade: null, isOperator: false });
    const html = render(LIST, listProps({ local: [entry.post] }));
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('comments: one being sent, one that failed (reason + resend + discard), and a normal one with its buttons', () => {
    const { data } = modules();
    const sending = { ...data.normalizeComment({ id: 'pending_a', nickname: '이웃', body: '보내는 글', mine: true }), delivery: 'sending' };
    const failed = { ...data.normalizeComment({ id: 'pending_b', nickname: '이웃', body: '못 보낸 글', mine: true }), delivery: 'failed', failure: '연결에 실패했어요.' };
    const normal = data.normalizeComment({ id: 'c_1', nickname: '남', body: '정상 댓글', mine: false });
    const html = render('../../src/components/community/CommentTree.tsx', {
        comments: [normal, sending, failed], replyingTo: '', onReply() {}, onLike() {}, onDelete() {}, onReport() {}, onRetry() {}, onDiscard() {},
        renderReplyForm: () => null, now: NOW,
    });
    assert.match(html, /cm-comment is-sending/);
    assert.match(html, /cm-comment is-failed/);
    assert.match(text(html), /보내는 중/);
    assert.match(text(html), /연결에 실패했어요\./);
    assert.equal((html.match(/>다시 보내기</g) || []).length, 1);
    assert.equal((html.match(/>지우기</g) || []).length, 1);
    assert.equal((html.match(/>좋아요|<b>0<\/b> 좋아요/g) || []).length, 1, 'only the confirmed comment can be liked');
    assert.equal((html.match(/>답글</g) || []).length, 1, 'and answered');
    assert.match(html, /정상 댓글/);
});

test('detail page: the title, author and summary are there at once; no buttons until the real post arrives', () => {
    const { data, model } = modules();
    const post = data.normalizePost(raw('p_1', 'free', { title: '미리 보이는 제목', excerpt: '목록에서 이미 아는 요약', nickname: '미리작성자' }));
    const html = render('../../src/components/community/PostPreview.tsx', { post, boards: model.boardList(null), back: '/community', now: NOW });
    assert.match(text(html), /미리 보이는 제목/);
    assert.match(text(html), /미리작성자/);
    assert.match(text(html), /목록에서 이미 아는 요약/);
    assert.match(text(html), /본문을 불러오는 중이에요/);
    assert.doesNotMatch(html, /<button/, 'nothing can be pressed on stale numbers');
    assert.match(html, /aria-busy="true"/);
});

test('detail page preview draws the server text of a notice as plain text', () => {
    const { data, model } = modules();
    const post = data.normalizePost(raw('nt_5', 'news', { title: '<script>alert(1)</script>', badge: 'important' }));
    const html = render('../../src/components/community/PostPreview.tsx', { post, boards: model.boardList(null), back: '/community', now: NOW });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
