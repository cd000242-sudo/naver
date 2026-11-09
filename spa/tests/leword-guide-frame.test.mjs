// Writing-guide frame (2026-11-08, owner: "cards with and without 'must include / must avoid' look inconsistent").
// Every benchmark card draws the same guide frame; a card whose guide has not been made yet shows an empty
// frame with one status label. Nothing is invented: no filler sentence stands in for a missing guide.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLoader, fakeBrowser, restoreBrowser, React } from './helpers/load-ts.mjs';

const load = createLoader();
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const { guideFrame, GUIDE_PENDING_TEXT, GUIDE_NONE_TEXT } = load('../../src/components/leword/shared/guideFrame.ts');
const { default: WritingGuideFrame } = load('../../src/components/leword/shared/WritingGuideFrame.tsx');

const READY = {
    writingDirection: '지원 대상과 신청 기한을 먼저 보여 주는 순서로 쓰세요.',
    searchTargets: ['근로장려금 신청 기한', '근로장려금 지급일'],
    mustInclude: ['신청 기한 날짜', '소득 기준 표'],
    mustAvoid: ['확인되지 않은 지급액'],
};
const text = (html) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/^\||\|$/g, '');
const headings = (html) => [...html.matchAll(/<h4>([^<]*)<\/h4>/g)].map((m) => m[1]);
// Wrapper classes only: the status-label class is the one thing allowed to differ between ready and pending cards.
const classes = (html) => [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).filter((name) => name !== 'hfb-guide-empty').sort();

test('status labels are the exact wording the owner asked for', () => {
    assert.equal(GUIDE_PENDING_TEXT, '작성 안내 준비 중');
    assert.equal(GUIDE_NONE_TEXT, '없음');
});

test('guideFrame: no guide at all -> every slot is pending and nothing is invented', () => {
    for (const card of [{}, { writingDirection: '' }, { writingDirection: '   ' }, undefined, null]) {
        const frame = guideFrame(card);
        assert.equal(frame.ready, false);
        assert.equal(frame.direction, '');
        assert.deepEqual([frame.searchTargets.items, frame.include.items, frame.avoid.items], [[], [], []]);
        assert.deepEqual([frame.searchTargets.empty, frame.include.empty, frame.avoid.empty], [GUIDE_PENDING_TEXT, GUIDE_PENDING_TEXT, GUIDE_PENDING_TEXT]);
    }
});

test('guideFrame: a ready guide keeps its own items; a slot the guide left empty says so instead of "pending"', () => {
    const frame = guideFrame({ ...READY, mustAvoid: [], searchTargets: [] });
    assert.equal(frame.ready, true);
    assert.equal(frame.direction, READY.writingDirection);
    assert.deepEqual(frame.include.items, READY.mustInclude);
    assert.deepEqual([frame.avoid.items, frame.avoid.empty], [[], GUIDE_NONE_TEXT]);
    assert.deepEqual([frame.searchTargets.items, frame.searchTargets.empty], [[], GUIDE_NONE_TEXT]);
    assert.equal(guideFrame(READY).include.empty, '');
});

test('guideFrame: stray lists without a direction do not make a half-ready frame', () => {
    const frame = guideFrame({ mustInclude: ['a', 'b'], mustAvoid: ['c'], searchTargets: ['d'] });
    assert.equal(frame.ready, false);
    assert.deepEqual([frame.include.items, frame.avoid.items, frame.searchTargets.items], [[], [], []]);
});

test('WritingGuideFrame: ready and pending cards draw the same headings, same wrappers, same order', () => {
    const ready = renderToStaticMarkup(React.createElement(WritingGuideFrame, { card: READY }));
    const pending = renderToStaticMarkup(React.createElement(WritingGuideFrame, { card: {} }));
    assert.deepEqual(headings(ready), ['이렇게 쓰세요', '반드시 들어갈 내용', '넣지 않을 내용']);
    assert.deepEqual(headings(pending), headings(ready));
    assert.deepEqual(classes(pending), classes(ready));
    assert.match(ready, /노릴 검색어 · 네이버 자동완성/);
    assert.match(pending, /노릴 검색어 · 네이버 자동완성/);
});

test('WritingGuideFrame: a pending card shows only headings plus the status label, no filler sentence', () => {
    const pending = text(renderToStaticMarkup(React.createElement(WritingGuideFrame, { card: {} })));
    const parts = pending.split('|').map((part) => part.trim()).filter(Boolean);
    const labels = parts.filter((part) => part === GUIDE_PENDING_TEXT);
    assert.equal(labels.length, 4, 'direction, search targets, must include, must avoid');
    const rest = parts.filter((part) => part !== GUIDE_PENDING_TEXT);
    assert.deepEqual(rest, ['이렇게 쓰세요', '노릴 검색어 · 네이버 자동완성', '반드시 들어갈 내용', '넣지 않을 내용']);
});

test('WritingGuideFrame: a ready card shows its own content and no pending label', () => {
    const html = renderToStaticMarkup(React.createElement(WritingGuideFrame, { card: READY }));
    for (const value of [READY.writingDirection, ...READY.searchTargets, ...READY.mustInclude, ...READY.mustAvoid]) assert.ok(html.includes(value), value);
    assert.ok(!html.includes(GUIDE_PENDING_TEXT));
});

test('both boards draw the guide through the shared frame and no longer skip the block', () => {
    const home = read('../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx');
    const ads = read('../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx');
    for (const [name, src] of [['homefeed', home], ['adsense', ads]]) {
        assert.match(src, /<WritingGuideFrame card=\{c\}\s*\/>/, name);
        assert.doesNotMatch(src, /c\.writingDirection\s*&&/, `${name}: the guide block must not be conditional`);
        assert.doesNotMatch(src, /mustInclude\??\.length\??\s*(>|\)\s*>)\s*0\s*\|\|/, `${name}: the include/avoid grid must not be conditional`);
    }
});

test('real homefeed card: a card with a guide and a card without one share the same guide structure', () => {
    fakeBrowser();
    try {
        const { normalizeBenchmarkBoard } = load('../../src/lib/homefeedBenchmarkModel.mjs');
        const { withGuides } = load('../../src/lib/homefeedGuides.mjs');
        const { default: Card } = load('../../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx');
        const raw = { schemaVersion: 1, generatedAt: '2026-11-08T00:00:00.000Z', sources: [], candidates: ['with', 'without'].map((id) => ({ id, keyword: `키워드 ${id}`, title: `제목 ${id}`, status: 'review-now', category: '사회·이슈', sources: [] })) };
        const store = { guides: [{ id: 'with', urls: [], guide: { direction: READY.writingDirection, searchTargets: READY.searchTargets, mustInclude: READY.mustInclude, mustAvoid: READY.mustAvoid, checkBefore: [] } }] };
        const [withGuide, without] = normalizeBenchmarkBoard(withGuides(raw, store)).candidates;
        const a = renderToStaticMarkup(React.createElement(Card, { candidate: withGuide }));
        const b = renderToStaticMarkup(React.createElement(Card, { candidate: without }));
        assert.ok(a.includes(READY.mustInclude[0]) && !a.includes(GUIDE_PENDING_TEXT));
        const section = (html) => html.slice(html.indexOf('<div class="hfb-direction'), html.indexOf('<section aria-label="이 카드로 성과 내는 순서"'));
        // The guide frame itself carries the four labels; the playbook line below it is counted in its own test.
        assert.equal(section(b).split(GUIDE_PENDING_TEXT).length - 1, 4);
        assert.deepEqual(headings(section(b)), headings(section(a)));
        assert.deepEqual(headings(section(a)).slice(0, 3), ['이렇게 쓰세요', '반드시 들어갈 내용', '넣지 않을 내용']);
    } finally {
        restoreBrowser();
    }
});

// 2026-11-10 owner: "no guide -> no invented sentence" also covers the playbook ("이 카드로 성과 내는 순서") lines.
const GENERIC_HOMEFEED = '원문에서 확인한 사실만으로 사건 → 사람들 반응 → 내가 짚을 한 가지 순서로 쓰세요';
const GENERIC_ADSENSE = '공통으로 답하는 질문 하나를 정하고';
const playbook = (html) => {
    const start = html.indexOf('<section aria-label="이 카드로 성과 내는 순서"');
    return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start));
};
const stepLabels = (html) => [...playbook(html).matchAll(/<li><b[^>]*>([^<]*)<\/b>/g)].map((m) => m[1]);
const stepText = (html, label) => {
    const m = new RegExp(`<li><b[^>]*>${label}</b> — (.*?)</li>`).exec(playbook(html));
    return m ? text(m[1]) : null;
};

function homefeedHtml(guide, check = []) {
    const { normalizeBenchmarkBoard } = load('../../src/lib/homefeedBenchmarkModel.mjs');
    const { withGuides } = load('../../src/lib/homefeedGuides.mjs');
    const { default: Card } = load('../../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx');
    const raw = { schemaVersion: 1, generatedAt: '2026-11-10T00:00:00.000Z', sources: [], candidates: [{ id: 'x', keyword: '키워드 x', title: '제목 x', status: 'review-now', category: '사회·이슈', sources: [] }] };
    const store = { guides: guide ? [{ id: 'x', urls: [], guide: { ...guide, checkBefore: check } }] : [] };
    const [candidate] = normalizeBenchmarkBoard(withGuides(raw, store)).candidates;
    return renderToStaticMarkup(React.createElement(Card, { candidate }));
}

test('homefeed playbook: a card without a guide shows the pending label on "무엇을 쓸지" and no generic sentence', () => {
    fakeBrowser();
    try {
        const html = homefeedHtml(null);
        assert.equal(stepText(html, '무엇을 쓸지'), GUIDE_PENDING_TEXT);
        assert.ok(!html.includes(GENERIC_HOMEFEED), 'the generic sentence must be gone from the whole card');
        assert.deepEqual(stepLabels(html), ['지금 쓸지', '무엇을 쓸지', '제목', '언제 올릴지', '발행 후']);
    } finally {
        restoreBrowser();
    }
});

test('homefeed playbook: a card with a guide keeps the guide text; the line keeps its place and the other lines are unchanged', () => {
    fakeBrowser();
    try {
        const guide = { direction: READY.writingDirection, searchTargets: READY.searchTargets, mustInclude: READY.mustInclude, mustAvoid: READY.mustAvoid };
        const html = homefeedHtml(guide, ['지급일 원문 확인']);
        const line = stepText(html, '무엇을 쓸지');
        assert.ok(line.includes(READY.writingDirection), line);
        assert.ok(line.includes('&quot;반드시 들어갈 내용&quot; 2가지를 소제목으로 쓰세요'), line);
        assert.ok(!line.includes(GUIDE_PENDING_TEXT));
        assert.deepEqual(stepLabels(html), stepLabels(homefeedHtml(null)), 'same lines in the same order with or without a guide');
        // The other lines and the "작성 전 확인" line are not touched.
        assert.ok(stepText(html, '언제 올릴지').includes('저녁 6시~새벽 3시'));
        assert.ok(stepText(html, '제목').includes('회차가 제목을 짓는 중입니다'));
        assert.ok(stepText(html, '발행 후').includes('노출 추적에 등록'));
        assert.match(html, /<b>작성 전 확인<\/b> 지급일 원문 확인/);
    } finally {
        restoreBrowser();
    }
});

function adsenseHtml(extra = {}) {
    const { AdsenseCardView } = load('../../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx');
    const card = {
        id: 'a', keyword: '근로장려금', title: '근로장려금 신청', category: '정책', grade: 'A', recommended: false, priority: 0,
        publishedAt: '2026-11-09T00:00:00.000Z', capturedAt: '2026-11-10T00:00:00.000Z', why: [], titles: [],
        metrics: { query: '근로장려금', searchVolume: 1000, documentCount: 500, bid: null, measuredAt: '2026-11-09T00:00:00.000Z' },
        sources: [{ id: 's1', name: '블로그', grade: 'A', category: '정책', title: '근로장려금 정리', url: 'https://example.com/p/1', publishedAt: '2026-11-09T00:00:00.000Z', platform: 'tistory' }],
        ...extra,
    };
    return renderToStaticMarkup(React.createElement(AdsenseCardView, { c: card, now: Date.parse('2026-11-10T00:00:00.000Z') }));
}

test('adsense playbook: a card without a guide shows the pending label on "해결할 문제" and no generic sentence', () => {
    fakeBrowser();
    try {
        const html = adsenseHtml();
        assert.equal(stepText(html, '해결할 문제'), GUIDE_PENDING_TEXT);
        assert.ok(!html.includes(GENERIC_ADSENSE), 'the generic sentence must be gone from the whole card');
        assert.deepEqual(stepLabels(html), ['지금 쓸지', '해결할 문제', '제목', '벤치마킹', '발행 후']);
    } finally {
        restoreBrowser();
    }
});

test('adsense playbook: the guide text is used when present (solves first, then writing direction), same lines either way', () => {
    fakeBrowser();
    try {
        const solved = adsenseHtml({ solves: ['신청 기한을 놓친 사람 → 기한 후 신청 방법'], writingDirection: READY.writingDirection });
        assert.equal(stepText(solved, '해결할 문제'), '신청 기한을 놓친 사람 → 기한 후 신청 방법');
        const directed = adsenseHtml({ writingDirection: READY.writingDirection });
        assert.equal(stepText(directed, '해결할 문제'), READY.writingDirection);
        assert.deepEqual(stepLabels(solved), stepLabels(adsenseHtml()));
        assert.deepEqual(stepLabels(directed), stepLabels(adsenseHtml()));
    } finally {
        restoreBrowser();
    }
});

test('the generic playbook sentences are no longer in the source', () => {
    const home = read('../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx');
    const ads = read('../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx');
    assert.doesNotMatch(home, /원문에서 확인한 사실만으로 사건/);
    assert.doesNotMatch(ads, /공통으로 답하는 질문 하나를 정하고/);
});
