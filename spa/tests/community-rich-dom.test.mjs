// The editor's DOM read as rich blocks (forum contract 1114 §3). Fake nodes stand in for the browser DOM:
// only nodeType / nodeName / childNodes / nodeValue / getAttribute are read, so the same code runs in the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { domToBlocks } from '../src/lib/communityRichDom.mjs';

const t = (value) => ({ nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] });
const el = (name, attrs = {}, ...children) => ({
    nodeType: 1, nodeName: name.toUpperCase(), childNodes: children,
    getAttribute: (key) => (Object.hasOwn(attrs, key) ? attrs[key] : null),
});
const root = (...children) => el('div', {}, ...children);
const p = (...runs) => ({ t: 'p', c: runs });
const run = (x, extra = {}) => ({ x, ...extra });

test('loose text becomes a paragraph; each line div is a paragraph', () => {
    assert.deepEqual(domToBlocks(root(t('안녕'))), [p(run('안녕'))]);
    assert.deepEqual(domToBlocks(root(el('div', {}, t('한 줄')), el('div', {}, t('두 줄')))), [p(run('한 줄')), p(run('두 줄'))]);
    assert.deepEqual(domToBlocks(root(t('앞'), el('div', {}, t('뒤')))), [p(run('앞')), p(run('뒤'))]);
});

test('empty lines and whitespace-only lines leave no block', () => {
    assert.deepEqual(domToBlocks(root(el('div', {}, el('br')), el('div', {}, t('  ')), el('div', {}, t('글')))), [p(run('글'))]);
    assert.deepEqual(domToBlocks(root()), []);
});

test('bold, italic and both, from b/strong/i/em and the style the browser may add', () => {
    assert.deepEqual(domToBlocks(root(el('b', {}, t('굵게')), t(' 일반 '), el('i', {}, t('기울임')))), [p(run('굵게', { b: 1 }), run(' 일반 '), run('기울임', { i: 1 }))]);
    assert.deepEqual(domToBlocks(root(el('strong', {}, el('em', {}, t('둘 다')))))[0].c, [run('둘 다', { b: 1, i: 1 })]);
    assert.deepEqual(domToBlocks(root(el('span', { style: 'font-weight: bold;' }, t('스타일'))))[0].c, [run('스타일', { b: 1 })]);
    assert.deepEqual(domToBlocks(root(el('span', { style: 'font-style: italic' }, t('스타일'))))[0].c, [run('스타일', { i: 1 })]);
});

test('neighbouring text with the same look is one run', () => {
    assert.deepEqual(domToBlocks(root(el('b', {}, t('가')), el('b', {}, t('나')), t('다'), t('라'))), [p(run('가나', { b: 1 }), run('다라'))]);
});

test('links keep their text and an https address; an unsafe address keeps only the text', () => {
    assert.deepEqual(domToBlocks(root(el('a', { href: 'https://a.com/x' }, t('여기'))))[0].c, [run('여기', { href: 'https://a.com/x' })]);
    assert.deepEqual(domToBlocks(root(el('a', { href: 'http://a.com/x' }, t('여기'))))[0].c, [run('여기', { href: 'https://a.com/x' })]);
    assert.deepEqual(domToBlocks(root(el('a', { href: 'javascript:alert(1)' }, t('나쁜'))))[0].c, [run('나쁜')]);
    assert.deepEqual(domToBlocks(root(el('a', {}, t('주소 없음'))))[0].c, [run('주소 없음')]);
    assert.deepEqual(domToBlocks(root(el('a', { href: 'https://a.com' }, el('b', {}, t('굵은 링크')))))[0].c, [run('굵은 링크', { b: 1, href: 'https://a.com/' })]);
});

test('headings: h1 and h2 are level 2, h3 and below are level 3', () => {
    assert.deepEqual(domToBlocks(root(el('h2', {}, t('소제목')))), [{ t: 'h', l: 2, c: [run('소제목')] }]);
    assert.deepEqual(domToBlocks(root(el('h1', {}, t('큰')))), [{ t: 'h', l: 2, c: [run('큰')] }]);
    assert.deepEqual(domToBlocks(root(el('h3', {}, t('작은')), el('h5', {}, t('더 작은')))), [{ t: 'h', l: 3, c: [run('작은')] }, { t: 'h', l: 3, c: [run('더 작은')] }]);
});

test('quotes, and a quote of several lines is several quote blocks', () => {
    assert.deepEqual(domToBlocks(root(el('blockquote', {}, t('인용')))), [{ t: 'quote', c: [run('인용')] }]);
    assert.deepEqual(domToBlocks(root(el('blockquote', {}, el('div', {}, t('가')), el('div', {}, t('나'))))), [{ t: 'quote', c: [run('가')] }, { t: 'quote', c: [run('나')] }]);
});

test('lists keep their items, drop empty ones and stop at 50', () => {
    assert.deepEqual(domToBlocks(root(el('ul', {}, el('li', {}, t('가')), el('li', {}, el('br')), el('li', {}, el('b', {}, t('나')))))), [{ t: 'ul', items: [[run('가')], [run('나', { b: 1 })]] }]);
    assert.deepEqual(domToBlocks(root(el('ol', {}, el('li', {}, t('하나'))))), [{ t: 'ol', items: [[run('하나')]] }]);
    assert.deepEqual(domToBlocks(root(el('ul', {}, el('li', {}, el('br'))))), [], 'a list with nothing in it is gone');
    const many = el('ul', {}, ...Array.from({ length: 60 }, (_, index) => el('li', {}, t(`항목 ${index}`))));
    assert.equal(domToBlocks(root(many))[0].items.length, 50);
    const nested = el('ul', {}, el('li', {}, t('바깥'), el('ul', {}, el('li', {}, t('안')))));
    assert.deepEqual(domToBlocks(root(nested))[0].items, [[run('바깥')], [run('안')]], 'a nested list is flattened');
});

test('a rule is a rule', () => {
    assert.deepEqual(domToBlocks(root(t('위'), el('hr'), t('아래'))), [p(run('위')), { t: 'hr' }, p(run('아래'))]);
});

test('pictures: only an attached one (it has an image id) counts, and it splits the line it sits in', () => {
    assert.deepEqual(domToBlocks(root(el('img', { 'data-image-id': 'a1', alt: '설명' }))), [{ t: 'img', id: 'a1', alt: '설명' }]);
    assert.deepEqual(domToBlocks(root(el('div', {}, t('앞'), el('img', { 'data-image-id': 'a1' }), t('뒤')))), [p(run('앞')), { t: 'img', id: 'a1', alt: '사진' }, p(run('뒤'))]);
    assert.deepEqual(domToBlocks(root(el('figure', {}, el('img', { 'data-image-id': 'a1', alt: 'x' })))), [{ t: 'img', id: 'a1', alt: 'x' }]);
    assert.deepEqual(domToBlocks(root(el('img', { src: 'https://outside.example/a.jpg' }))), [], 'an outside picture is never kept');
    assert.deepEqual(domToBlocks(root(el('img', { 'data-image-id': '<bad id>' }))), []);
    assert.equal(domToBlocks(root(el('img', { 'data-image-id': 'a1', alt: 'x'.repeat(300) })))[0].alt.length, 120);
});

test('a line break inside a line starts a new paragraph (or list item)', () => {
    assert.deepEqual(domToBlocks(root(el('div', {}, t('가'), el('br'), t('나')))), [p(run('가')), p(run('나'))]);
    assert.deepEqual(domToBlocks(root(el('ul', {}, el('li', {}, t('가'), el('br'), t('나'))))), [{ t: 'ul', items: [[run('가')], [run('나')]] }]);
});

test('browser leftovers are cleaned: no-break spaces, zero-width characters, new lines inside text', () => {
    assert.deepEqual(domToBlocks(root(t('가 나​다\n라'))), [p(run('가 나다 라'))]);
});

test('scripts, styles and unknown tags never put code or markup into the post; unknown tags keep their text', () => {
    assert.deepEqual(domToBlocks(root(el('script', {}, t('alert(1)')), el('style', {}, t('p{}')), el('span', { style: 'color:red' }, t('글')))), [p(run('글'))]);
    assert.deepEqual(domToBlocks(root(el('font', { color: 'red' }, t('글')), el('u', {}, t('밑줄')))), [p(run('글밑줄'))]);
});

test('the edges of a paragraph are trimmed, the inside is left alone', () => {
    assert.deepEqual(domToBlocks(root(el('div', {}, t('  가  나  ')))), [p(run('가  나'))]);
    assert.deepEqual(domToBlocks(root(el('div', {}, el('b', {}, t(' 굵게 ')), t('끝 ')))), [p(run('굵게 ', { b: 1 }), run('끝'))]);
});

// ---- blocksToDom: the editor box filled from a post that already exists ----
import { blocksToDom } from '../src/lib/communityRichDom.mjs';

function fakeDocument() {
    const make = (name) => {
        const node = { nodeType: 1, nodeName: name.toUpperCase(), childNodes: [], attrs: {} };
        node.setAttribute = (key, value) => { node.attrs[key] = String(value); };
        node.getAttribute = (key) => (Object.hasOwn(node.attrs, key) ? node.attrs[key] : null);
        node.appendChild = (child) => { node.childNodes.push(child); return child; };
        return node;
    };
    return { createElement: make, createTextNode: (value) => ({ nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] }) };
}

test('blocksToDom then domToBlocks gives the same blocks back', () => {
    const blocks = [
        { t: 'h', l: 2, c: [run('소제목')] },
        p(run('일반 '), run('굵게', { b: 1 }), run('기울임', { i: 1 }), run('링크', { href: 'https://a.com/x' }), run('굵은 기울임 링크', { b: 1, i: 1, href: 'https://b.com/' })),
        { t: 'quote', c: [run('인용')] },
        { t: 'ul', items: [[run('가')], [run('나', { b: 1 })]] },
        { t: 'ol', items: [[run('하나')]] },
        { t: 'img', id: 'a1', alt: '사진 설명' },
        { t: 'hr' },
        { t: 'h', l: 3, c: [run('작은 소제목')] },
    ];
    const doc = fakeDocument();
    const box = doc.createElement('div');
    for (const node of blocksToDom(blocks, doc, { imageSrc: (id) => `blob:${id}` })) box.appendChild(node);
    assert.deepEqual(domToBlocks(box), blocks);
});

test('blocksToDom puts the preview address on a picture and only builds nodes (no HTML text)', () => {
    const doc = fakeDocument();
    const [node] = blocksToDom([{ t: 'img', id: 'a1', alt: 'x' }], doc, { imageSrc: (id) => `blob:${id}` });
    const image = node.nodeName === 'IMG' ? node : node.childNodes[0];
    assert.equal(image.getAttribute('src'), 'blob:a1');
    assert.equal(image.getAttribute('data-image-id'), 'a1');
    const [hostile] = blocksToDom([p(run('<img src=x onerror=alert(1)>'))], doc, {});
    assert.equal(hostile.childNodes[0].nodeType, 3, 'the text is a text node, not markup');
    assert.equal(hostile.childNodes[0].nodeValue, '<img src=x onerror=alert(1)>');
    assert.deepEqual(blocksToDom(undefined, doc, {}), []);
    assert.deepEqual(blocksToDom([{ t: 'nope' }], doc, {}), []);
});
