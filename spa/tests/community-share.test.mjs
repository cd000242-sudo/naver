// [2026-11-20] Owner: "내가 쓴 글 공유할 수 있도록 — 카톡이나 원하는 곳에". The community is login-only, so what is
// shared is the title, a short summary and the address: the reader gets the gist at once and the full post after login.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText, sharePost, shareSummaryLines } from '../src/lib/communityShare.mjs';

const run = (x) => ({ x });
const rich = (...blocks) => JSON.stringify({ v: 1, blocks });
const newsBody = rich(
    { t: 'p', c: [run('이번 주 소식을 정리했습니다.')] },
    { t: 'h', l: 2, c: [run('3줄 요약')] },
    { t: 'ol', items: [[run('첫째 '), run('줄입니다.')], [run('둘째 줄입니다.')], [run('셋째 줄입니다.')], [run('넷째 줄입니다.')]] },
    { t: 'hr' },
    { t: 'h', l: 2, c: [run('1. 본문')] },
    { t: 'p', c: [run('본문 문단입니다.')] },
);
const post = (extra = {}) => ({ id: 'p_0123456789abcdef', board: 'news', title: '블로그 소식 3가지', body: newsBody, format: 'rich', ...extra });

test('summary: the list under a "요약" heading, three lines at most, runs joined', () => {
    assert.deepEqual(shareSummaryLines(post()), ['첫째 줄입니다.', '둘째 줄입니다.', '셋째 줄입니다.']);
});

test('summary: without a "요약" list it is the opening words of the post, never the stored JSON', () => {
    const plainRich = rich({ t: 'p', c: [run('여는 문단입니다.')] }, { t: 'p', c: [run('다음 문단입니다.')] });
    assert.deepEqual(shareSummaryLines(post({ body: plainRich })), ['여는 문단입니다. 다음 문단입니다.']);
    assert.deepEqual(shareSummaryLines(post({ body: '옛 글의 본문\n둘째 줄', format: '' })), ['옛 글의 본문 둘째 줄']);
    const long = shareSummaryLines(post({ body: 'ㄱ'.repeat(400), format: '' }))[0];
    assert.ok(long.length <= 121 && long.endsWith('…'));
    assert.deepEqual(shareSummaryLines(post({ body: '', format: '' })), []);
});

test('summary: a "요약" heading followed by something other than a list falls back to the opening words', () => {
    const body = rich({ t: 'h', l: 2, c: [run('요약')] }, { t: 'p', c: [run('목록이 아닌 문단')] });
    assert.deepEqual(shareSummaryLines(post({ body })), ['요약 목록이 아닌 문단']);
});

test('share text: title, bulleted summary, then the post address with the login note', () => {
    const shared = buildShareText(post(), 'https://leaderspro.kr');
    assert.equal(shared.title, '블로그 소식 3가지');
    assert.equal(shared.url, 'https://leaderspro.kr/community?board=news&post=p_0123456789abcdef');
    assert.equal(shared.text, [
        '블로그 소식 3가지',
        '',
        '· 첫째 줄입니다.',
        '· 둘째 줄입니다.',
        '· 셋째 줄입니다.',
        '',
        '전체 글 보기(로그인 필요): https://leaderspro.kr/community?board=news&post=p_0123456789abcdef',
    ].join('\n'));
});

test('share text: no summary leaves just the title and the address; a trailing slash on the origin is not doubled', () => {
    const shared = buildShareText(post({ body: '', format: '' }), 'https://leaderspro.kr/');
    assert.equal(shared.text, '블로그 소식 3가지\n\n전체 글 보기(로그인 필요): https://leaderspro.kr/community?board=news&post=p_0123456789abcdef');
});

test('sharing: the device share sheet is used when there is one, and gets the whole text', async () => {
    const calls = [];
    const outcome = await sharePost({ title: '제목', text: '본문', url: 'u' }, { share: async (data) => { calls.push(data); }, copy: async () => { calls.push('copy'); } });
    assert.equal(outcome, 'shared');
    assert.deepEqual(calls, [{ title: '제목', text: '본문' }]);
});

test('sharing: closing the share sheet is not an error and copies nothing', async () => {
    let copied = false;
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    const outcome = await sharePost({ title: 't', text: 'x', url: 'u' }, { share: async () => { throw abort; }, copy: async () => { copied = true; } });
    assert.equal(outcome, 'cancelled');
    assert.equal(copied, false);
});

test('sharing: no share sheet (or one that fails) copies the text instead', async () => {
    const copied = [];
    assert.equal(await sharePost({ title: 't', text: '복사할 글', url: 'u' }, { copy: async (text) => { copied.push(text); } }), 'copied');
    assert.equal(await sharePost({ title: 't', text: '둘째', url: 'u' }, { share: async () => { throw new Error('NotAllowed'); }, copy: async (text) => { copied.push(text); } }), 'copied');
    assert.deepEqual(copied, ['복사할 글', '둘째']);
});

test('sharing: nothing available, or a refused copy, reports failure', async () => {
    assert.equal(await sharePost({ title: 't', text: 'x', url: 'u' }, {}), 'failed');
    assert.equal(await sharePost({ title: 't', text: 'x', url: 'u' }, { copy: async () => { throw new Error('denied'); } }), 'failed');
});

// The button itself, drawn from the real post view: only on the reader's own post, and only when a handler is given.
const { createRequire } = await import('node:module');
const { renderToStaticMarkup } = await import('react-dom/server');
const { createElement } = await import('react');
const { createLoader, fakeBrowser, restoreBrowser } = await import('./helpers/load-ts.mjs');
const require = createRequire(import.meta.url);

function renderPostView(extraPost, extraProps = {}) {
    fakeBrowser();
    try {
        const loader = createLoader();
        const PostView = loader('../../src/components/community/PostView.tsx').default;
        const item = loader('../../src/lib/communityData.ts').normalizePost({
            id: 'p_0123456789abcdef', board: 'news', title: '제목', excerpt: '', nickname: '글쓴이', grade: { key: 'sprout', label: '새싹' },
            isOperator: false, createdAt: '2026-11-08T11:25:00+09:00', views: 1, likes: 0, comments: 0, pinned: false, status: '', mine: false, liked: false,
            body: '본문', ...extraPost,
        });
        const boards = loader('../../src/lib/communityModel.mjs').boardList(null);
        const { MemoryRouter } = require('react-router-dom');
        const props = { post: item, boards, onLike() {}, onReport() {}, onEdit() {}, onDelete() {}, onVisit() {}, now: Date.parse('2026-11-08T12:00:00+09:00'), ...extraProps };
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(PostView, props)));
    } finally { restoreBrowser(); }
}
const buttons = (html) => [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, '').trim());

test('post view: [공유] sits with the actions of my own post', () => {
    const labels = buttons(renderPostView({ mine: true }, { onShare() {} }));
    assert.ok(labels.includes('공유'), labels.join(','));
    assert.ok(labels.includes('수정') && labels.includes('삭제'));
});

test('post view: no [공유] on someone else\'s post, or when no handler is given', () => {
    assert.ok(!buttons(renderPostView({ mine: false }, { onShare() {} })).includes('공유'));
    assert.ok(!buttons(renderPostView({ mine: true })).includes('공유'));
});
