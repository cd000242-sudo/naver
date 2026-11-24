// Board list rows (owner request 1124): the title on the first line, part of the body below it, the picture when the
// post has one, and the author at the right end with the date and counts. Rendered from the real PostList component.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const NOW = new Date('2026-11-24T12:00:00+09:00').getTime();
const LIST = '../../src/components/community/PostList.tsx';

function render(props) {
    fakeBrowser();
    try {
        const Component = createLoader()(LIST).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const load = () => createLoader();
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const post = (id, board = 'free', extra = {}) => load()('../../src/lib/communityData.ts').normalizePost({
    id, board, title: `제목 ${id}`, excerpt: '', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' }, isOperator: false, createdAt: '2026-11-24T09:00:00+09:00',
    views: 3, likes: 1, comments: 0, pinned: false, status: '', mine: false, liked: false, ...extra,
});
const boards = () => load()('../../src/lib/communityModel.mjs').boardList(null);
const listProps = (items, extra = {}) => ({
    title: '전체글', boardId: 'all', boards: boards(), pinned: [], posts: items, total: items.length, page: 1, totalPages: 1, sort: 'latest', now: NOW, onVisit() {}, ...extra,
});
const rowsOf = (html) => html.split('<li class="cm-row').slice(1);
const CELLS = ['board', 'title', 'excerpt', 'end', 'meta', 'time', 'num', 'author', 'more', 'thumb'];
/** The row's cells in document order (first appearance of each cell class). */
const cellsOf = (row) => [...row.matchAll(/class="cm-row-([a-z]+)\b/g)].map((match) => match[1]).filter((name, index, all) => CELLS.includes(name) && all.indexOf(name) === index);

test('the author is the last fact of a row: date, counts, state and title all come before it; only the menu and the picture follow', () => {
    const rows = [
        post('p_1', 'free', { excerpt: '본문 앞부분입니다' }),
        post('p_2', 'free', { thumbId: '_thumb', hasImage: true, excerpt: '사진 있는 글' }),
        post('pr_1', 'promo', { visits: 4 }),
        post('q_1', 'qna', { comments: 2 }),
    ];
    const html = render(listProps(rows, { onReport() {}, reportMode: () => 'report' }));
    for (const row of rowsOf(html)) {
        const cells = cellsOf(row);
        const author = cells.indexOf('author');
        assert.ok(author > 0, 'the row has an author cell');
        for (const before of ['title', 'meta', 'time', 'num', 'end']) assert.ok(cells.indexOf(before) < author, `${before} before the author: ${cells}`);
        assert.deepEqual(cells.slice(author + 1).filter((name) => name !== 'more' && name !== 'thumb'), [], `nothing but the menu and the picture after the author: ${cells}`);
    }
});

test('part of the body is drawn under the title only when the post has some; an empty excerpt draws no line', () => {
    const html = render(listProps([
        post('p_1', 'free', { excerpt: '오늘 바뀐 내용을 짧게 정리했어요' }),
        post('p_2', 'free', { excerpt: '' }),
        post('p_3', 'free', { excerpt: '   ' }),
    ]));
    const [withBody, empty, blank] = rowsOf(html);
    assert.match(withBody, /<span class="cm-row-excerpt">오늘 바뀐 내용을 짧게 정리했어요<\/span>/);
    assert.ok(withBody.indexOf('cm-row-title') < withBody.indexOf('cm-row-excerpt'), 'the body comes after the title');
    assert.ok(!/cm-row-excerpt/.test(empty), 'no empty line');
    assert.ok(!/cm-row-excerpt/.test(blank), 'spaces only: no line either');
});

test('a notice row shows its body too, and its badges, with the 운영자 at the end', () => {
    const notice = post('nt_1', 'notice', { notice: true, noticeBadge: 'update', nickname: '운영자', isOperator: true, excerpt: 'v2.11.395 에서 바뀐 점' });
    const [row] = rowsOf(render(listProps([notice], { boardId: 'notice', page: 2, totalPages: 2 }))); // page 1 newest first: the open card (community-notice-lead)
    assert.match(row, /cm-row-excerpt">v2\.11\.395 에서 바뀐 점</);
    assert.match(text(row), /공지/);
    assert.ok(row.indexOf('cm-row-excerpt') < row.indexOf('cm-row-author'));
});

test('a post with a picture draws the picture with its body; a post without draws neither picture nor empty box', () => {
    const html = render(listProps([post('p_1', 'free', { thumbId: '_thumb', hasImage: true, excerpt: '사진과 글' }), post('p_2', 'free', { excerpt: '글만' })]));
    const [pictured, plain] = rowsOf(html);
    assert.match(pictured, /cm-row-thumb/);
    assert.match(pictured, /cm-row-excerpt">사진과 글</);
    assert.ok(!/cm-row-thumb/.test(plain));
});

test('the counts keep their words (조회 / 좋아요) and the old table header is gone', () => {
    const html = render(listProps([post('p_1', 'free', { views: 12, likes: 5 })]));
    assert.match(text(html), /조회 12/);
    assert.match(text(html), /좋아요 5/);
    const thead = rule(css(), '.cm-thead');
    assert.match(thead, /display:\s*none/, 'the old header row is not shown above rows it no longer matches');
});

test('rows being sent or failed keep their state, resend buttons and failure message', () => {
    const sending = { ...post('l_1', 'free', { excerpt: '보내는 글' }), delivery: 'sending' };
    const failed = { ...post('l_2', 'free'), delivery: 'failed', failure: '저장하지 못했어요' };
    const html = render(listProps([], { local: [sending, failed] }));
    assert.match(html, /보내는 중/);
    assert.match(html, /다시 보내기/);
    assert.match(html, /role="alert">저장하지 못했어요/);
});

// ---- stylesheet contract -------------------------------------------------------------------------------------------

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const css = () => read('../src/components/community/community.css');
const flat = (source) => [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].replace(/@media[^{]*$/, '').trim(), body: match[2] }));
const rule = (source, selector) => flat(source).filter((entry) => entry.selector.split(',').map((part) => part.trim()).includes(selector)).map((entry) => entry.body).join(';');
function mediaBlock(source, query) {
    const start = source.indexOf(query);
    assert.ok(start >= 0, `${query} block exists`);
    let depth = 0;
    for (let index = source.indexOf('{', start); index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}' && (depth -= 1) === 0) return source.slice(source.indexOf('{', start) + 1, index);
    }
    return '';
}

test('stylesheet (desktop): one row layout for every list; the author column is the last before the menu, the date and counts sit under it', () => {
    const desk = mediaBlock(css(), '@media (min-width: 721px)');
    const areas = rule(desk, '.cm-row').match(/grid-template-areas:\s*'([^']+)'\s*'([^']+)'/);
    assert.ok(areas, 'two named lines');
    assert.match(areas[1], /title .*who more$/);
    assert.match(areas[2], /excerpt .*meta more$/);
    assert.match(rule(desk, '.cm-row-author'), /grid-area:\s*who/);
    assert.match(rule(desk, '.cm-row-meta'), /grid-area:\s*meta/);
    assert.match(rule(desk, '.cm-row-title'), /-webkit-line-clamp:\s*2/, 'the title keeps two lines at most');
    const thumbCss = read('../src/components/community/community-thumb.css');
    assert.doesNotMatch(thumbCss, /\.has-thumbs \.cm-row\b/, 'no second desktop layout for lists with pictures');
    assert.match(thumbCss, /thumb who more/, 'the picture sits just before the author, never on top of it');
});

test('stylesheet: the body line is muted, at least 14px, cut with an ellipsis; one line on a phone', () => {
    const excerpt = rule(css(), '.cm-row-excerpt');
    assert.match(excerpt, /color:\s*var\(--lp-muted\)/);
    assert.ok(Number((excerpt.match(/font-size:\s*(\d+)px/) || [])[1]) >= 14);
    assert.match(excerpt, /-webkit-line-clamp:\s*2/);
    const phone = mediaBlock(css(), '@media (max-width: 720px)');
    assert.match(rule(phone, '.cm-row-excerpt'), /-webkit-line-clamp:\s*1/);
    assert.match(rule(phone, '.cm-row-meta'), /display:\s*contents/, 'the phone row keeps its single flowing line of facts');
    assert.ok(Number((rule(phone, '.cm-row-excerpt').match(/font-size:\s*(\d+)px/) || ['', '14'])[1]) >= 14);
});

test('the changed files stay within the 300-line limit', () => {
    for (const file of ['../src/components/community/PostList.tsx', '../src/components/community/community.css', '../src/components/community/community-thumb.css', '../src/components/community/community-forum.css']) {
        assert.ok(read(file).split('\n').length <= 300, file);
    }
});
