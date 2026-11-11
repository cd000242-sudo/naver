// Rich post body spacing, on the real stylesheets and the real RichBody markup. The gap rule used to lose to the element
// resets (p, ul, ol, .cm-pic), so paragraphs, lists and pictures sat flush and only headings / quotes / rules had air.
// Each case below asks the cascade (tests/helpers/css-cascade.mjs) what space an element truly gets.
// Scope guard: comments, the editor box, plain-text bodies and pictures outside the body must look exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { element, fontPx, parseHtml, readRules, spacePx, declared } from './helpers/css-cascade.mjs';

const require = createRequire(import.meta.url);
const run = (x) => ({ x });
const rules = readRules(['community.css', 'community-detail.css', 'community-speed.css', 'community-forum.css', 'community-qna.css']
    .map((name) => fileURLToPath(new URL(`../src/components/community/${name}`, import.meta.url))));

/** Renders the real RichBody and returns its element plus the direct children by the names given. */
function body(named) {
    fakeBrowser();
    let html;
    try {
        const Component = createLoader()('../../src/components/community/RichBody.tsx').default;
        const { MemoryRouter } = require('react-router-dom');
        const text = JSON.stringify({ v: 1, blocks: named.map(([, block]) => block) });
        html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Component, { postId: 'p_1', body: text })));
    } finally { restoreBrowser(); }
    const root = parseHtml(html).children[0];
    const by = Object.fromEntries(named.map(([name], index) => [name, root.children[index]]));
    return { root, by };
}

const space = (el, prop) => spacePx(rules, el, prop);
const gap = (above, below) => Math.max(space(above, 'margin-bottom'), space(below, 'margin-top'));
const within = (value, low, high, label) => assert.ok(value >= low && value <= high, `${label}: ${value}px not in ${low}..${high}px`);

const full = body([
    ['lead', { t: 'p', c: [run('머리말 첫 문단')] }],
    ['second', { t: 'p', c: [run('머리말 둘째 문단')] }],
    ['summary', { t: 'h', l: 2, c: [run('3줄 요약')] }],
    ['list', { t: 'ol', items: [[run('하나')], [run('둘')], [run('셋')]] }],
    ['afterList', { t: 'p', c: [run('목록 다음 문단')] }],
    ['intro', { t: 'p', c: [run('목록 앞 문단')] }],
    ['bullets', { t: 'ul', items: [[run('가')], [run('나')], [run('다')]] }],
    ['afterBullets', { t: 'p', c: [run('목록 다음 문단 둘')] }],
    ['rule', { t: 'hr' }],
    ['title', { t: 'h', l: 2, c: [run('1. 회사 — 한 줄 제목')] }],
    ['quote', { t: 'quote', c: [run('이 건의 요지')] }],
    ['photo', { t: 'img', id: 'a1', alt: '' }],
    ['caption', { t: 'p', c: [run('공식 발표 첫 화면입니다.')] }],
    ['label', { t: 'h', l: 3, c: [run('무엇이 나왔나')] }],
    ['points', { t: 'ul', items: [[run('하나')], [run('둘')]] }],
]);

test('the sample is drawn as the real structure: direct blocks, one picture figure, the quote text inside its own paragraph', () => {
    const tags = full.root.children.map((child) => child.tag + (child.classes.includes('cm-pic') ? '.cm-pic' : ''));
    assert.deepEqual(tags, ['p', 'p', 'h2', 'ol', 'p', 'p', 'ul', 'p', 'hr', 'h2', 'blockquote', 'figure.cm-pic', 'p', 'h3', 'ul']);
    assert.equal(fontPx(rules, full.by.lead), 18, 'body text stays at 18px');
});

test('paragraph to paragraph, to a list and from a list get a gap of about 0.7-0.9 of the text size', () => {
    within(gap(full.by.lead, full.by.second), 12, 17, 'paragraph to paragraph');
    within(gap(full.by.list, full.by.afterList), 12, 17, 'numbered list to paragraph');
    within(gap(full.by.intro, full.by.bullets), 12, 17, 'paragraph to list');
    within(gap(full.by.bullets, full.by.afterBullets), 12, 17, 'bullet list to paragraph');
});

test('list items get a small gap, the indent stays 1.5em, the first item has none', () => {
    const [first, second] = full.by.list.children;
    assert.equal(space(first, 'margin-top'), 0);
    within(space(second, 'margin-top'), 4, 10, 'item to item');
    assert.equal(space(full.by.bullets, 'padding-left'), 27, '1.5em of 18px, as before');
    assert.equal(space(full.by.list, 'padding-left'), 27);
});

test('a heading stays close to what it introduces, and still separates sections above', () => {
    within(gap(full.by.summary, full.by.list), 6, 14, 'big heading to list');
    within(gap(full.by.title, full.by.quote), 6, 14, 'big heading to quote');
    within(gap(full.by.label, full.by.points), 6, 14, 'small heading to list');
    assert.ok(gap(full.by.caption, full.by.label) >= 18, 'the small heading splits the block above it');
    assert.ok(gap(full.by.rule, full.by.title) >= 28, 'the big heading keeps its space under a rule');
});

test('the rule keeps its own space above and below', () => {
    assert.ok(Math.abs(space(full.by.rule, 'margin-top') - 21.6) < 0.01);
    assert.ok(Math.abs(space(full.by.rule, 'margin-bottom') - 21.6) < 0.01);
});

test('a picture has room above (16-20px) and a little below (8-10px); the quote above it is not glued to it', () => {
    within(space(full.by.photo, 'margin-top'), 16, 20, 'above the picture');
    within(space(full.by.photo, 'margin-bottom'), 8, 10, 'below the picture');
    within(gap(full.by.quote, full.by.photo), 16, 20, 'quote to picture');
});

test('the paragraph right under a picture sits close to it and reads as a caption; other paragraphs do not', () => {
    within(gap(full.by.photo, full.by.caption), 8, 10, 'picture to its caption');
    const size = fontPx(rules, full.by.caption);
    assert.ok(size >= 16 && size < 18, `caption size ${size}px: a little smaller, never below 16px`);
    assert.match(declared(rules, full.by.caption, 'color') || '', /var\(--lp-muted\)/, 'paler, from the existing token');
    assert.equal(declared(rules, full.by.lead, 'color'), undefined);
    assert.equal(declared(rules, full.by.afterList, 'color'), undefined);
    assert.equal(fontPx(rules, full.by.afterList), 18);
});

test('the paragraph inside a quote stays flush with the quote box', () => {
    assert.equal(space(full.by.quote.children[0], 'margin-top'), 0);
    assert.equal(space(full.by.quote.children[0], 'margin-bottom'), 0);
});

test('no extra space above the first block or below the last, whatever kind they are', () => {
    const headRule = body([['h', { t: 'h', l: 2, c: [run('첫 소제목')] }], ['p', { t: 'p', c: [run('글')] }], ['hr', { t: 'hr' }]]);
    assert.equal(space(headRule.by.h, 'margin-top'), 0, 'a heading that opens the body');
    assert.equal(space(headRule.by.hr, 'margin-bottom'), 0, 'a rule that closes the body');
    const pictures = body([['a', { t: 'img', id: 'a1', alt: '' }], ['b', { t: 'p', c: [run('설명')] }], ['c', { t: 'img', id: 'a2', alt: '' }]]);
    assert.equal(space(pictures.by.a, 'margin-top'), 0, 'a picture that opens the body');
    assert.equal(space(pictures.by.c, 'margin-bottom'), 0, 'a picture that closes the body');
    const single = body([['only', { t: 'img', id: 'a1', alt: '' }]]);
    assert.equal(space(single.by.only, 'margin-top'), 0);
    assert.equal(space(single.by.only, 'margin-bottom'), 0);
});

test('nothing outside the post body changed: comments, the editor box, plain text, a loose picture', () => {
    const comment = element('div', ['cm-c-body']);
    const c1 = element('p', [], comment);
    const c2 = element('p', [], comment);
    assert.equal(space(c2, 'margin-top'), 0, 'comment paragraphs');
    assert.equal(space(c1, 'margin-bottom'), 0);
    const plain = element('div', ['cm-body']);
    element('p', [], plain);
    assert.equal(space(element('p', [], plain), 'margin-top'), 0, 'a second paragraph in a plain body');
    const editor = element('div', ['cm-rich-box']);
    const list = element('ul', [], editor);
    element('li', [], list);
    const secondItem = element('li', [], list);
    assert.equal(space(secondItem, 'margin-top'), 0, 'editor list items');
    assert.ok(Math.abs(space(list, 'margin-top') - 5.4) < 0.01, 'editor list keeps 0.3em');
    assert.ok(Math.abs(space(element('h2', [], editor), 'margin-top') - 14.4) < 0.01, 'editor heading keeps 0.6em');
    const loose = element('figure', ['cm-pic']);
    assert.equal(space(loose, 'margin-top'), 0);
    assert.equal(space(loose, 'margin-bottom'), 0);
    assert.equal(declared(rules, element('p', [], loose), 'font-size'), undefined);
});
