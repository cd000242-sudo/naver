// Free chatbot tiles driven by admin-saved site content (2026-11-07).
// The page must read exactly the fields the admin editor writes: gemini / naverFree / homefeedLocked.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { decryptLink, encryptLink, ProtectedLinkError } from '../src/lib/protectedLink.mjs';
import { isSealedPayload, resolveProtectedTile, resolvePublicTile } from '../src/lib/chatbotTiles.mjs';

const require = createRequire(import.meta.url);
const DEFAULTS = { title: '기본 제목', desc: '기본 설명', url: 'https://example.invalid/default', cta: '기본 버튼', badge: '무료' };
const FAKE_LINK = 'https://example.invalid/admin-made-link';
const PASSWORD = 'admin-made-password-123';
const BUNDLED = { v: 1, kdf: 'PBKDF2-SHA256', iter: 600000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==', iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' };

test('public tile: blank, whitespace and non-string overrides keep the site default', () => {
    for (const override of [undefined, null, {}, { title: '', desc: '   ', url: 5, cta: null, badge: {} }, 'text']) {
        assert.deepEqual(resolvePublicTile(DEFAULTS, override), DEFAULTS);
    }
});

test('public tile: admin values win, trimmed, field by field', () => {
    const tile = resolvePublicTile(DEFAULTS, { title: ' 새 제목 ', desc: '새 설명', url: ' https://example.invalid/new ', cta: '열기', badge: '추천' });
    assert.deepEqual(tile, { title: '새 제목', desc: '새 설명', url: 'https://example.invalid/new', cta: '열기', badge: '추천' });
    assert.equal(resolvePublicTile(DEFAULTS, { title: '일부만' }).desc, DEFAULTS.desc);
});

test('public tile: only https links are accepted, anything else falls back to the default link', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.invalid/a', 'data:text/html,x', 'not a url', '//example.invalid/x']) {
        assert.equal(resolvePublicTile(DEFAULTS, { url: bad }).url, DEFAULTS.url, bad);
    }
});

test('protected tile: bundled ciphertext is used unless the site content carries a well-formed one', async () => {
    const own = await encryptLink(FAKE_LINK, PASSWORD, { iterations: 100_000 });
    assert.equal(resolveProtectedTile({ title: 'T', desc: 'D' }, undefined, BUNDLED).payload, BUNDLED);
    assert.equal(resolveProtectedTile({ title: 'T', desc: 'D' }, { payload: own }, BUNDLED).payload, own);
    for (const broken of [null, 'x', {}, { ...own, ct: '' }, { ...own, kdf: 'MD5' }, { ...own, iter: '600000' }, { ...own, v: 2 }, { ...own, salt: '***' }]) {
        assert.equal(resolveProtectedTile({ title: 'T', desc: 'D' }, { payload: broken }, BUNDLED).payload, BUNDLED);
    }
    assert.equal(isSealedPayload(own), true);
    assert.equal(isSealedPayload({ ...own, iv: undefined }), false);
});

test('protected tile: title and description follow the admin, blank keeps the default', () => {
    assert.deepEqual(
        resolveProtectedTile({ title: 'T', desc: 'D' }, { title: ' 새 ', desc: '' }, BUNDLED),
        { title: '새', desc: 'D', payload: BUNDLED },
    );
});

// ---- rendering --------------------------------------------------------------------------------------------------

function load(path) {
    const sourceUrl = new URL(path, import.meta.url);
    const text = fs.readFileSync(sourceUrl, 'utf8');
    if (sourceUrl.pathname.endsWith('.json')) { const parsed = JSON.parse(text); return { ...parsed, default: parsed }; }
    const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
    const output = { exports: {} };
    new Function('require', 'module', 'exports', code)((id) => {
        if (id.startsWith('.')) {
            for (const extension of ['', '.tsx', '.ts', '.mjs', '.js']) {
                const resolved = new URL(`${id}${extension}`, sourceUrl);
                if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return load(resolved);
            }
        }
        return require(id);
    }, output, output.exports);
    return output.exports;
}

const { default: ChatbotTiles } = load('../src/components/chatbots/ChatbotTiles.tsx');
const render = (chatbots) => renderToStaticMarkup(React.createElement(ChatbotTiles, { chatbots }));

test('tiles render the admin-saved gemini and naver values', () => {
    const html = render({
        gemini: { title: '제미나이 새 이름', url: 'https://example.invalid/gemini', cta: '가기' },
        naverFree: { title: '네이버 새 이름', desc: '네이버 새 설명', url: 'https://example.invalid/naver', cta: '보기', badge: '추천' },
    });
    assert.match(html, /<h3>제미나이 새 이름<\/h3>/);
    assert.match(html, /href="https:\/\/example\.invalid\/gemini"/);
    assert.match(html, /<h3>네이버 새 이름<\/h3>/);
    assert.match(html, /네이버 새 설명/);
    assert.match(html, /href="https:\/\/example\.invalid\/naver"/);
    assert.match(html, />추천<\/span>/);
    assert.match(html, /보기 →/);
});

test('tiles fall back to the built-in text with no site content at all, and a blank saved title never blanks a tile', () => {
    for (const html of [render(undefined), render({ gemini: { title: '' }, naverFree: { title: '  ', url: '' } })]) {
        assert.match(html, /<h3>무료 제미나이 챗봇<\/h3>/);
        assert.match(html, /<h3>네이버 무료 프롬프트<\/h3>/);
        assert.match(html, /<h3>리더남 홈판 프롬프트 \(테스트\)<\/h3>/);
        assert.equal((html.match(/class="hub-tile[ "]/g) || []).length, 3);
    }
});

test('a javascript: link saved in site content is never rendered as an href', () => {
    const html = render({ gemini: { url: 'javascript:alert(1)' }, naverFree: { url: 'javascript:alert(2)' } });
    assert.doesNotMatch(html, /javascript:/);
});

test('protected tile text follows the admin, stays a password form, and exposes no link or ciphertext in markup', async () => {
    const own = await encryptLink(FAKE_LINK, PASSWORD, { iterations: 100_000 });
    const html = render({ homefeedLocked: { title: '잠긴 새 제목', desc: '잠긴 새 설명', payload: own } });
    assert.match(html, /<h3>잠긴 새 제목<\/h3>/);
    assert.match(html, /잠긴 새 설명/);
    assert.match(html, /type="password"/);
    assert.ok(!html.includes('example.invalid/admin-made-link'));
    assert.ok(!html.includes(own.ct));
});

test('the ciphertext the page would use really opens with the admin password, and only with it', async () => {
    const own = await encryptLink(FAKE_LINK, PASSWORD, { iterations: 100_000 });
    const resolved = resolveProtectedTile({ title: 'T', desc: 'D' }, { payload: own }, BUNDLED);
    assert.equal(await decryptLink(resolved.payload, PASSWORD), FAKE_LINK);
    await assert.rejects(decryptLink(resolved.payload, `${PASSWORD}x`), (error) => error instanceof ProtectedLinkError && error.code === 'WRONG_PASSWORD');
});
