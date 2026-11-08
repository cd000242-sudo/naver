// Community screen pieces (2026-11-08), rendered from the real components: list, weekly top, post, comments,
// write form, sidebar, nickname, report. Server text is hostile on purpose: it must come out as plain text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-08T12:00:00+09:00').getTime();

function load() {
    const loader = createLoader();
    return {
        loader,
        data: loader('../../src/lib/communityData.ts'),
        model: loader('../../src/lib/communityModel.mjs'),
    };
}

function render(file, props, exportName = 'default') {
    const browser = fakeBrowser();
    try {
        const { loader } = load();
        const Component = loader(file)[exportName];
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally {
        restoreBrowser();
        void browser;
    }
}

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) || [])[1];
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

const rawPost = (id, board, extra = {}) => ({
    id, board, title: `제목 ${id}`, excerpt: '', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, isOperator: false,
    createdAt: '2026-11-08T11:25:00+09:00', updatedAt: '', views: 10, likes: 3, comments: 0, pinned: false, status: '', mine: false, liked: false, ...extra,
});

function posts(...raws) {
    const { data } = load();
    return raws.map((raw) => data.normalizePost(raw));
}

const listProps = (overrides = {}) => {
    const { model } = load();
    return {
        title: '전체글', boardId: 'all', boards: model.boardList(null), pinned: [], posts: [], total: 0, page: 1, totalPages: 1,
        sort: 'latest', now: NOW, onVisit() {}, ...overrides,
    };
};

test('list: five-column header, the comment count next to the title, grade badges, dates and numbers', () => {
    const [a, b] = posts(
        rawPost('p_1', 'free', { comments: 12, createdAt: '2026-11-08T11:25:00+09:00', views: 188, likes: 3 }),
        rawPost('p_2', 'request', { grade: { key: 'leaf', label: '잎새' }, createdAt: '2026-11-07T09:00:00+09:00' }),
    );
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: [a, b], total: 2 }));
    for (const heading of ['게시판', '제목', '글쓴이', '작성일', '조회', '좋아요']) assert.match(text(html), new RegExp(heading));
    assert.match(html, /<em class="cm-cmt">\[12\]<\/em>/);
    assert.doesNotMatch(html, /\[0\]/);
    assert.match(html, /lp-g-sprout[^>]*>새싹</);
    assert.match(html, /lp-g-leaf[^>]*>잎새</);
    assert.match(text(html), /35분 전/);
    assert.match(text(html), /11\.07/);
    assert.match(text(html), /자유게시판/);
    assert.match(text(html), /요청사항/);
});

test('list: title links open the post inside the community address, keeping the board and sort', () => {
    const [a] = posts(rawPost('p_1', 'free'));
    const html = render('../../src/components/community/PostList.tsx', listProps({ boardId: 'free', sort: 'popular', posts: [a], total: 1 }));
    const link = tags(html, 'a').find((tag) => /post=p_1/.test(tag));
    assert.ok(link, 'row link');
    assert.equal(attr(link, 'href'), '/community?board=free&amp;sort=popular&amp;post=p_1');
});

test('list: operator posts wear the staff badge; pinned posts are marked and highlighted', () => {
    const [op, pin] = posts(rawPost('n_1', 'news', { isOperator: true, grade: null, nickname: '운영자' }), rawPost('n_2', 'news', { pinned: true }));
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: [op], pinned: [pin], total: 1 }));
    assert.match(html, /lp-g-staff[^>]*>운영진</);
    assert.match(html, /<li class="[^"]*is-pin[^"]*"/);
    assert.equal((html.match(/is-pin/g) || []).length, 1);
});

test('list: inquiry and request rows show their status badge, other boards none', () => {
    const items = posts(
        rawPost('i_1', 'inquiry', { status: '답변 완료' }), rawPost('i_2', 'inquiry', { status: '대기' }),
        rawPost('r_1', 'request', { status: '검토 중' }), rawPost('r_2', 'request', { status: '반영됨' }), rawPost('f_1', 'free', { status: '반영됨' }),
    );
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: items, total: 5 }));
    assert.equal((html.match(/lp-state-done/g) || []).length, 2);
    assert.equal((html.match(/lp-state-wait/g) || []).length, 1);
    assert.equal((html.match(/lp-state-review/g) || []).length, 1);
    assert.equal((html.match(/class="lp-state /g) || []).length, 4, 'free board shows no badge');
});

test('list: three sort links, the current one marked; pager marks the current page', () => {
    const [a] = posts(rawPost('p_1', 'free'));
    const html = render('../../src/components/community/PostList.tsx', listProps({ boardId: 'free', sort: 'comments', page: 2, totalPages: 4, posts: [a], total: 60 }));
    const sorts = tags(html, 'a').filter((tag) => /sort=|cm-sort/.test(tag) && /cm-sort/.test(tag));
    assert.equal(sorts.length, 3);
    assert.match(text(html), /최신순/);
    assert.match(text(html), /인기순/);
    assert.match(text(html), /댓글많은순/);
    assert.equal(sorts.filter((tag) => attr(tag, 'aria-current') === 'true').length, 1);
    assert.match(sorts.find((tag) => attr(tag, 'aria-current') === 'true'), /sort=comments|댓글/);
    const pages = tags(html, 'a').filter((tag) => /cm-pg/.test(tag));
    assert.deepEqual(pages.map((tag) => attr(tag, 'aria-label')), ['1쪽', '2쪽', '3쪽', '4쪽']);
    assert.equal(pages.filter((tag) => attr(tag, 'aria-current') === 'page').length, 1);
    assert.match(attr(pages[2], 'href'), /page=3/);
});

test('list: promo rows have the visit button with the visit count; the others do not', () => {
    const items = posts(rawPost('pr_1', 'promo', { url: 'https://blog.naver.com/a/1', platform: 'naver', visits: 7 }), rawPost('f_1', 'free'));
    const html = render('../../src/components/community/PostList.tsx', listProps({ boardId: 'promo', posts: items, total: 2 }));
    const buttons = tags(html, 'button').filter((tag) => /cm-visit/.test(tag));
    assert.equal(buttons.length, 1);
    assert.match(html, /cm-visit[^>]*>[\s\S]*?<b>7<\/b>[\s\S]*?들르기/);
    assert.ok(!html.includes('blog.naver.com'), 'the outside address is not in the list');
});

test('list: empty, loading and error states speak plainly', () => {
    assert.match(text(render('../../src/components/community/PostList.tsx', listProps())), /아직 올라온 글이 없어요/);
    assert.match(text(render('../../src/components/community/PostList.tsx', listProps({ loading: true }))), /불러오는 중/);
    const failed = render('../../src/components/community/PostList.tsx', listProps({ error: '서버가 잠시 붐빕니다.', onRetry() {} }));
    assert.match(text(failed), /서버가 잠시 붐빕니다\./);
    assert.match(failed, />다시 불러오기</);
});

test('list: a board note appears under the title when given', () => {
    const html = render('../../src/components/community/PostList.tsx', listProps({ title: '문의', boardId: 'inquiry', note: '궁금한 점을 남기면 운영자가 답해 드려요.' }));
    assert.match(text(html), /궁금한 점을 남기면 운영자가 답해 드려요\./);
});

test('list: hostile titles and nicknames are text, never markup', () => {
    const [evil] = posts(rawPost('p_1', 'free', { title: '<img src=x onerror=alert(1)>', nickname: '<script>alert(2)</script>' }));
    const html = render('../../src/components/community/PostList.tsx', listProps({ posts: [evil], total: 1 }));
    assert.ok(!/<img\b/.test(html) && !/<script\b/.test(html));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&lt;script&gt;'));
});

test('weekly top: ranked list with like counts, first three highlighted; empty message otherwise', () => {
    const items = posts(...Array.from({ length: 4 }, (_, index) => rawPost(`p_${index}`, 'free', { title: `인기 ${index}`, likes: 10 - index })));
    const html = render('../../src/components/community/WeeklyTop.tsx', { posts: items, boardId: 'all' });
    assert.match(text(html), /이번 주 인기글/);
    assert.match(text(html), /좋아요 많은 순/);
    assert.equal((html.match(/class="cm-rank cm-rank-top"/g) || []).length, 3);
    assert.match(html, /<em[^>]*>10<\/em>/);
    assert.ok(tags(html, 'a').some((tag) => /post=p_0/.test(tag)));
    assert.match(text(render('../../src/components/community/WeeklyTop.tsx', { posts: [], boardId: 'all' })), /아직 이번 주 인기글이 없어요/);
});

function commentsFixture() {
    const { data } = load();
    const base = { postId: 'p_1', parentId: '', nickname: '댓글러', grade: { key: 'leaf', label: '잎새' }, isOperator: false, body: '댓글 본문', createdAt: '2026-11-08T11:55:00+09:00', likes: 2, liked: false, mine: false, deleted: false, hidden: false, replies: [] };
    return data.normalizeComments([
        { ...base, id: 'c_1', replies: [{ ...base, id: 'c_2', parentId: 'c_1', nickname: '답글러', body: '답글 본문', mine: true }] },
        { ...base, id: 'c_3', deleted: true, replies: [{ ...base, id: 'c_4', parentId: 'c_3', body: '살아남은 답글' }] },
    ]);
}

const treeProps = (overrides = {}) => ({
    comments: commentsFixture(), replyingTo: '', onReply() {}, onLike() {}, onDelete() {}, onReport() {}, renderReplyForm: () => null, now: NOW, ...overrides,
});

test('comments: replies sit inside their comment, a removed comment with replies stays as a placeholder', () => {
    const html = render('../../src/components/community/CommentTree.tsx', treeProps());
    assert.equal((html.match(/class="cm-replies"/g) || []).length, 2);
    assert.match(text(html), /댓글 본문/);
    assert.match(text(html), /답글 본문/);
    assert.match(text(html), /삭제된 댓글입니다/);
    assert.match(text(html), /살아남은 답글/);
    assert.doesNotMatch(html.slice(html.indexOf('삭제된 댓글입니다') - 200, html.indexOf('삭제된 댓글입니다')), /댓글러/, 'no author on a removed comment');
});

test('comments: reply button only on top-level comments; delete only on my own, report only on others; like count shown', () => {
    const html = render('../../src/components/community/CommentTree.tsx', treeProps());
    const labels = (name) => (html.match(new RegExp(`>${name}<`, 'g')) || []).length;
    assert.equal(labels('답글'), 1, 'one live top-level comment (the removed one has no reply button)');
    assert.equal(labels('삭제'), 1, 'only my reply can be deleted');
    assert.equal(labels('신고'), 2, 'the other two live comments can be reported');
    assert.match(html, /cm-like[^>]*>[\s\S]*?<b>2<\/b>/);
});

test('comments: the reply form is drawn under the comment being answered', () => {
    const html = render('../../src/components/community/CommentTree.tsx', treeProps({ replyingTo: 'c_1', renderReplyForm: (parent) => createElement('form', { id: `reply-${parent.id}` }) }));
    assert.match(html, /id="reply-c_1"/);
    assert.doesNotMatch(html, /id="reply-c_3"/);
});

test('comments: hostile bodies are text', () => {
    const { data } = load();
    const evil = data.normalizeComments([{ id: 'c_9', postId: 'p_1', parentId: '', nickname: '<b>x</b>', grade: null, body: '<img src=x onerror=alert(1)>', createdAt: '2026-11-08T11:55:00+09:00', likes: 0, replies: [] }]);
    const html = render('../../src/components/community/CommentTree.tsx', treeProps({ comments: evil }));
    assert.ok(!/<img\b/.test(html) && !/<b>x<\/b>/.test(html));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

const viewProps = (post, overrides = {}) => {
    const { model } = load();
    return { post, boards: model.boardList(null), onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {}, now: NOW, ...overrides };
};

test('post: title, author badge, date, numbers, body with line breaks kept — and the body is text', () => {
    const [post] = posts(rawPost('p_1', 'free', { title: '<b>굵게</b>', body: '첫 줄\n<script>alert(1)</script>', views: 41, likes: 5, status: '' }));
    const html = render('../../src/components/community/PostView.tsx', viewProps(post));
    assert.ok(!/<script\b/.test(html) && !/<b>굵게/.test(html));
    assert.ok(html.includes('&lt;b&gt;굵게&lt;/b&gt;'));
    assert.match(html, /class="cm-body"/);
    assert.match(text(html), /조회 41/);
    assert.match(html, /cm-like[^>]*>[\s\S]*?<b>5<\/b>/);
    assert.match(text(html), /자유게시판/);
});

test('post: mine can edit and delete; others can report; nobody sees both', () => {
    const [mine] = posts(rawPost('p_1', 'free', { mine: true }));
    const [other] = posts(rawPost('p_2', 'free', { mine: false }));
    const mineHtml = render('../../src/components/community/PostView.tsx', viewProps(mine));
    assert.match(mineHtml, />수정</);
    assert.match(mineHtml, />삭제</);
    assert.doesNotMatch(mineHtml, />신고</);
    const otherHtml = render('../../src/components/community/PostView.tsx', viewProps(other));
    assert.match(otherHtml, />신고</);
    assert.doesNotMatch(otherHtml, />수정</);
    assert.doesNotMatch(otherHtml, />삭제</);
});

test('post: a promo post shows its address as text with a visit button; a script address is dropped', () => {
    const [promo] = posts(rawPost('pr_1', 'promo', { url: 'https://blog.naver.com/a/1', platform: 'naver', visits: 7, given: 2 }));
    const html = render('../../src/components/community/PostView.tsx', viewProps(promo));
    assert.match(html, /<code[^>]*>https:\/\/blog\.naver\.com\/a\/1<\/code>/);
    assert.match(html, /cm-visit/);
    assert.match(text(html), /네이버/);
    const [bad] = posts(rawPost('pr_2', 'promo', { url: 'javascript:alert(1)' }));
    assert.ok(!render('../../src/components/community/PostView.tsx', viewProps(bad)).includes('javascript:'));
});

test('post: status badge on an inquiry', () => {
    const [post] = posts(rawPost('i_1', 'inquiry', { status: '답변 완료' }));
    assert.match(render('../../src/components/community/PostView.tsx', viewProps(post)), /lp-state-done[^>]*>답변 완료</);
});

const profileOf = (extra = {}) => ({
    userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, score: 150,
    activity: { posts: 4, comments: 9, visits: 21 }, grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' }, linked: false, ...extra,
});

test('write form: members choose among four boards, the operator among five; news is not offered to members, notice to nobody', () => {
    const { model } = load();
    const member = render('../../src/components/community/PostWriteForm.tsx', { boards: model.boardList(null), defaultBoard: 'free', profile: profileOf(), onDone() {}, onCancel() {} });
    const options = [...member.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(options, ['request', 'inquiry', 'free', 'promo']);
    const owner = render('../../src/components/community/PostWriteForm.tsx', { boards: model.boardList(null), defaultBoard: 'news', profile: profileOf({ role: 'owner', canWriteNews: true }), onDone() {}, onCancel() {} });
    assert.deepEqual([...owner.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), ['news', 'request', 'inquiry', 'free', 'promo']);
    assert.match(owner, /<option value="news" selected/);
});

test('write form: ordinary boards have title and body; promo has address, title (read from the address) and intro', () => {
    const { model } = load();
    const free = render('../../src/components/community/PostWriteForm.tsx', { boards: model.boardList(null), defaultBoard: 'free', profile: profileOf(), onDone() {}, onCancel() {} });
    assert.equal(tags(free, 'input').length, 1);
    assert.equal(tags(free, 'textarea').length, 1);
    assert.match(free, /<button[^>]*type="submit"[^>]*>올리기<\/button>/);
    const promo = render('../../src/components/community/PostWriteForm.tsx', { boards: model.boardList(null), defaultBoard: 'promo', profile: profileOf(), onDone() {}, onCancel() {} });
    assert.equal(tags(promo, 'input').length, 2, 'address and title');
    assert.match(tags(promo, 'input')[1], /readonly=""/i);
    assert.equal(tags(promo, 'textarea').length, 1);
    assert.match(text(promo), /한 줄 소개/);
});

test('write form: a member without a nickname is asked for one first', () => {
    const { model } = load();
    const html = render('../../src/components/community/PostWriteForm.tsx', { boards: model.boardList(null), defaultBoard: 'free', profile: profileOf({ nickname: '', needsNickname: true }), onDone() {}, onCancel() {} });
    assert.match(text(html), /닉네임을 먼저 정해 주세요/);
    assert.equal(tags(html, 'textarea').length, 0);
});

test('sidebar: my activity (nickname, grade badge, score bar, counts), board menu with counts, grade guide', () => {
    const { model } = load();
    const html = render('../../src/components/community/CommunitySidebar.tsx', { profile: profileOf(), boards: model.boardList(null), boardId: 'free', counts: { free: 3, inquiry: 2 } });
    assert.match(text(html), /새싹이/);
    assert.match(html, /lp-g-leaf[^>]*>잎새</);
    assert.match(text(html), /150점/);
    const bar = tags(html, 'div').find((tag) => attr(tag, 'role') === 'progressbar');
    assert.ok(bar);
    assert.deepEqual([attr(bar, 'aria-valuenow'), attr(bar, 'aria-valuemin'), attr(bar, 'aria-valuemax')], ['13', '0', '100']);
    assert.match(text(html), /열매까지 350점/);
    for (const label of ['내 글', '내 댓글', '들른 글']) assert.match(text(html), new RegExp(label));
    assert.match(text(html), /21/);
    for (const label of ['전체글', '공지사항', '최근 소식', '요청사항', '문의', '자유게시판', '내 글 홍보']) assert.match(text(html), new RegExp(label));
    const menu = tags(html, 'a').map((tag) => attr(tag, 'href')).filter((href) => /board=/.test(href || '')).map((href) => /board=(\w+)/.exec(href)[1]);
    assert.deepEqual(menu, ['notice', 'news', 'request', 'inquiry', 'free', 'promo'], 'the menu follows the agreed order');
    const current = tags(html, 'a').filter((tag) => attr(tag, 'aria-current') === 'page');
    assert.equal(current.length, 1);
    assert.match(attr(current[0], 'href'), /board=free/);
    assert.match(text(html), /글 10점 · 댓글 2점 · 들르기 1점/);
    for (const range of ['0~99점', '100~499점', '500~1,499점', '1,500~4,999점', '5,000점~']) assert.match(text(html), new RegExp(range));
});

test('sidebar: no nickname yet asks for one; a hostile nickname is text', () => {
    const { model } = load();
    const html = render('../../src/components/community/CommunitySidebar.tsx', { profile: profileOf({ nickname: '', needsNickname: true }), boards: model.boardList(null), boardId: 'all', counts: {} });
    assert.match(text(html), /닉네임을 정해 주세요/);
    const evil = render('../../src/components/community/CommunitySidebar.tsx', { profile: profileOf({ nickname: '<img src=x onerror=alert(1)>' }), boards: model.boardList(null), boardId: 'all', counts: {} });
    assert.ok(!/<img\b/.test(evil));
});

test('nickname form: one field and one button', () => {
    const html = render('../../src/components/community/NicknameForm.tsx', { onDone() {} });
    assert.equal(tags(html, 'input').length, 1);
    assert.match(html, /<button[^>]*type="submit"[^>]*>닉네임 정하기<\/button>/);
    assert.match(text(html), /2~12자/);
});

test('report dialog: six reasons, an optional note, send and cancel', () => {
    const { model } = load();
    const html = render('../../src/components/community/ReportDialog.tsx', { reasons: model.reportReasons(null), busy: false, error: '', onSubmit() {}, onClose() {} });
    assert.equal(attr(tags(html, 'div').find((tag) => attr(tag, 'role') === 'dialog'), 'aria-modal'), 'true');
    assert.equal(tags(html, 'input').filter((tag) => attr(tag, 'type') === 'radio').length, 6);
    assert.match(tags(html, 'textarea')[0], /maxLength="200"/);
    assert.match(html, />신고하기</);
    assert.match(html, />취소</);
});
