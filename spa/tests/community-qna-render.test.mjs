// 질문하기 screens (contract 1116, Site), rendered from the real components: the list row with its status chip and
// comment count, the empty sentence, the post header chip, and the answer-accept buttons under the post.
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
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community?board=qna'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}

const loadLib = () => { const loader = createLoader(); return { data: loader('../../src/lib/communityData.ts'), model: loader('../../src/lib/communityModel.mjs') }; };
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);

const rawPost = (id, extra = {}) => ({
    id, board: 'qna', title: `질문 ${id}`, excerpt: '', nickname: '질문자', grade: { key: 'sprout', label: '새싹' }, isOperator: false,
    createdAt: '2026-11-08T11:25:00+09:00', updatedAt: '', views: 10, likes: 3, comments: 0, pinned: false, status: '답변 대기', mine: false, liked: false, ...extra,
});
const post = (id, extra) => loadLib().data.normalizePost(rawPost(id, extra));
const listProps = (overrides = {}) => ({
    title: '질문하기', boardId: 'qna', boards: loadLib().model.boardList(null), pinned: [], posts: [], total: 0, page: 1, totalPages: 1,
    sort: 'latest', now: NOW, onVisit() {}, ...overrides,
});

test('qna list: the status chip sits before the title, the comment count is its own pill, the old [n] mark and the right-hand badge are gone', () => {
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: [post('q_1', { comments: 3 })], total: 1 }));
    const chip = html.indexOf('cm-qna-chip');
    assert.ok(chip > 0, 'chip is drawn');
    assert.ok(chip < html.indexOf('질문 q_1'), 'chip comes before the title');
    assert.match(html, /lp-state lp-state-wait cm-qna-chip">답변 대기</);
    assert.match(html, /<span class="cm-qna-count[^"]*">댓글 <b>3<\/b><\/span>/);
    assert.doesNotMatch(html, /\[3\]/);
    assert.equal((html.match(/class="lp-state /g) || []).length, 1, 'one chip per row, not two');
});

test('qna list: solved rows are green (flag or status word), a question without comments still shows 댓글 0', () => {
    const rows = [post('q_2', { status: '해결됨', comments: 2 }), post('q_3', { status: '', solved: true }), post('q_4', { comments: 0 })];
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: rows, total: 3 }));
    assert.equal((html.match(/lp-state lp-state-done cm-qna-chip">해결됨</g) || []).length, 2);
    assert.equal((html.match(/lp-state lp-state-wait cm-qna-chip">답변 대기</g) || []).length, 1);
    assert.match(html, /cm-qna-count[^"]*">댓글 <b>0<\/b>/);
});

test('qna rows inside the all-boards list get the chip too; other boards keep the [n] mark and no chip', () => {
    const free = loadLib().data.normalizePost({ ...rawPost('f_1'), board: 'free', status: '', comments: 5 });
    const html = render('../../src/components/community/PostList.tsx', listProps({ boardId: 'all', title: '전체글', posts: [post('q_1', { comments: 1 }), free], total: 2 }));
    assert.equal((html.match(/cm-qna-chip/g) || []).length, 1);
    assert.match(html, /<em class="cm-cmt">\[5\]<\/em>/);
});

test('qna list: the empty board says the board sentence; another board keeps the old one', () => {
    assert.match(text(render('../../src/components/community/PostList.tsx', listProps())), /궁금한 걸 물어보세요\. 답을 채택하면 답한 분께 점수가 갑니다\./);
    assert.doesNotMatch(text(render('../../src/components/community/PostList.tsx', listProps())), /첫 글을 남겨 보세요/);
    assert.match(text(render('../../src/components/community/PostList.tsx', listProps({ boardId: 'free', title: '자유게시판' }))), /아직 올라온 글이 없어요/);
});

test('qna post page: the header wears the chip (waiting / solved)', () => {
    const view = (item) => render('../../src/components/community/PostView.tsx', {
        post: item, boards: loadLib().model.boardList(null), onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {}, now: NOW,
    });
    assert.match(view(post('q_1')), /lp-state-wait cm-qna-chip">답변 대기</);
    assert.match(view(post('q_2', { status: '해결됨', acceptedCommentId: 'c_1' })), /lp-state-done cm-qna-chip">해결됨</);
});

const base = { postId: 'q_1', parentId: '', nickname: '답변자', grade: { key: 'leaf', label: '잎새' }, isOperator: false, body: '이렇게 하세요', createdAt: '2026-11-08T11:55:00+09:00', likes: 0, liked: false, mine: false, deleted: false, hidden: false, replies: [] };
const rawComments = () => [
    { ...base, id: 'c_1', nickname: '첫째' },
    { ...base, id: 'c_2', nickname: '둘째', accepted: true, replies: [{ ...base, id: 'c_5', parentId: 'c_2', nickname: '대댓글' }] },
    { ...base, id: 'c_3', nickname: '질문자본인', mine: true },
    { ...base, id: 'c_4', nickname: '삭제됨', deleted: true },
];
const profile = {
    userId: 'asker01', role: 'community', nickname: '질문자', needsNickname: false, canWriteNews: false, score: 5,
    activity: { posts: 1, comments: 1, visits: 0 }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 300, nextLabel: '잎새' }, linked: false,
};
const section = (qna) => render('../../src/components/community/CommentSection.tsx', {
    postId: 'q_1', comments: loadLib().data.normalizeComments(rawComments()), profile, onComments() {}, onReload: async () => {}, onReport() {}, qna,
});
const buttons = (html, label) => (html.match(new RegExp(`>${label}<`, 'g')) || []).length;

test('answers: the asker gets [채택] on other people\'s live top-level comments only, and [채택 취소] on the accepted one', () => {
    const html = section({ busy: false, onAccept() {} });
    assert.equal(buttons(html, '채택'), 1, 'c_1 only: c_2 is accepted, c_3 is the asker\'s own, c_4 is removed, c_5 is a reply');
    assert.equal(buttons(html, '채택 취소'), 1);
});

test('answers: the accepted answer comes first under the post with the 채택된 답변 badge; the others keep their order', () => {
    const html = section({ busy: false, onAccept() {} });
    assert.equal((html.match(/채택된 답변/g) || []).length, 1);
    assert.ok(html.indexOf('둘째') < html.indexOf('첫째'), 'accepted comment first');
    assert.ok(html.indexOf('첫째') < html.indexOf('질문자본인'));
    assert.ok(html.indexOf('둘째') < html.indexOf('대댓글'), 'its reply stays under it');
    assert.match(html, /<li class="cm-comment is-accepted"/);
    assert.equal((html.match(/is-accepted/g) || []).length, 1);
});

test('answers: someone who is not the asker sees the badge and the order but no accept buttons', () => {
    const html = section(undefined);
    assert.equal(buttons(html, '채택'), 0);
    assert.equal(buttons(html, '채택 취소'), 0);
    assert.equal((html.match(/채택된 답변/g) || []).length, 1);
    assert.ok(html.indexOf('둘째') < html.indexOf('첫째'));
});

test('answers: while a request is under way the accept buttons are disabled', () => {
    const html = section({ busy: true, onAccept() {} });
    const accept = tags(html, 'button').filter((tag) => /cm-accept/.test(tag));
    assert.equal(accept.length, 2);
    assert.ok(accept.every((tag) => /\sdisabled=""/.test(tag)));
});
