// Rich post body drawn from its JSON (forum contract 1114 §3): elements built by React, never HTML text; links are
// marked ugc/nofollow; pictures wait for the server; an old plain-text post looks as it did before.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const run = (x, extra = {}) => ({ x, ...extra });

function render(file, props) {
    fakeBrowser();
    try {
        const Component = createLoader()(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const body = (...blocks) => JSON.stringify({ v: 1, blocks });
const draw = (text, postId = 'p_1') => render('../../src/components/community/RichBody.tsx', { postId, body: text });

test('every block kind is drawn as its own element', () => {
    const html = draw(body(
        { t: 'h', l: 2, c: [run('큰 소제목')] }, { t: 'h', l: 3, c: [run('작은 소제목')] },
        { t: 'p', c: [run('일반 '), run('굵게', { b: 1 }), run('기울임', { i: 1 })] }, { t: 'quote', c: [run('인용문')] },
        { t: 'ul', items: [[run('가')], [run('나')]] }, { t: 'ol', items: [[run('하나')]] }, { t: 'hr' },
    ));
    assert.match(html, /<h2[^>]*>큰 소제목<\/h2>/);
    assert.match(html, /<h3[^>]*>작은 소제목<\/h3>/);
    assert.match(html, /<strong>굵게<\/strong>/);
    assert.match(html, /<em>기울임<\/em>/);
    assert.match(html, /<blockquote[^>]*>[\s\S]*인용문[\s\S]*<\/blockquote>/);
    assert.match(html, /<ul[^>]*><li>가<\/li><li>나<\/li><\/ul>/);
    assert.match(html, /<ol[^>]*><li>하나<\/li><\/ol>/);
    assert.match(html, /<hr/);
});

test('a link opens in a new tab with the safe rel; an unsafe address is plain text', () => {
    const html = draw(body({ t: 'p', c: [run('여기', { href: 'https://example.com/a?b=1&c=2' }), run('나쁜', { href: 'javascript:alert(1)' })] }));
    const anchor = html.match(/<a\b[^>]*>/)[0];
    assert.match(anchor, /href="https:\/\/example\.com\/a\?b=1&amp;c=2"/);
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer nofollow ugc"/);
    assert.equal((html.match(/<a\b/g) || []).length, 1);
    assert.ok(!html.includes('javascript:'));
});

test('hostile text stays text', () => {
    const html = draw(body({ t: 'p', c: [run('<img src=x onerror=alert(1)><script>alert(2)</script>')] }, { t: 'img', id: 'a"onerror="x', alt: '<b>' }));
    assert.ok(!/<img\b/.test(html) && !/<script\b/.test(html));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('a picture waits for the server: a placeholder with its caption, the address only when it arrives', () => {
    const html = draw(body({ t: 'img', id: 'a1', alt: '우리 집 강아지' }));
    assert.match(html, /cm-pic/);
    assert.match(html, /우리 집 강아지/);
    assert.ok(!/<img\b/.test(html), 'no <img> until the picture is fetched');
});

test('a body that is not a rich body is drawn as plain text, line breaks kept by the style', () => {
    const html = draw('첫 줄\n둘째 줄');
    assert.match(html, /<div class="cm-body">첫 줄\n둘째 줄<\/div>/);
    const broken = draw('{"v":1,"blocks":"x"}');
    assert.match(broken, /cm-body/);
});

test('the source never sets HTML text', () => {
    for (const file of ['RichBody.tsx', 'RichEditor.tsx', 'RichToolbar.tsx', 'PostImage.tsx', 'richEditorCommands.ts']) {
        const source = fs.readFileSync(new URL(`../src/components/community/${file}`, import.meta.url), 'utf8');
        assert.ok(!/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|outerHTML|execCommand\(\s*['"]insertHTML/.test(source), file);
    }
});
