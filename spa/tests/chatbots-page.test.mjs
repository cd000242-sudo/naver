// Free chatbot page tiles (2026-11-07): Gemini + Naver free prompt + password-gated Leader Nam homefeed prompt (test).
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const FREE_URL = 'https://app.notion.com/p/AI-44ec04a37c4c4c928f06241828d55982?t=3ec755b0d4a28003ba8800a9a8405a2d';

function load(path) {
    const sourceUrl = new URL(path, import.meta.url);
    const text = fs.readFileSync(sourceUrl, 'utf8');
    if (sourceUrl.pathname.endsWith('.json')) { const parsed = JSON.parse(text); return { ...parsed, default: parsed }; }
    const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
    const output = { exports: {} };
    new Function('require', 'module', 'exports', code)((id) => {
        if (id.endsWith('ParticlesCanvas')) return { default: () => null };
        if (id.endsWith('lib/siteOps')) return { fetchSiteContent: async () => null };
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

const { default: ChatbotsPage } = load('../src/pages/ChatbotsPage.tsx');
const { MemoryRouter } = require('react-router-dom');
const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ChatbotsPage)));
const tileMarkup = (title) => {
    const start = html.indexOf(`<h3>${title}</h3>`);
    assert.ok(start > 0, `tile "${title}" is rendered`);
    const open = Math.max(html.lastIndexOf('<a class="hub-tile ', start), html.lastIndexOf('<div class="hub-tile ', start));
    return html.slice(open, html.indexOf('</h3>', start) + 400);
};

test('page shows three tiles without any site-content (fallback) in the agreed order', () => {
    const gemini = html.indexOf('<h3>무료 제미나이 챗봇</h3>');
    const free = html.indexOf('<h3>네이버 무료 프롬프트</h3>');
    const locked = html.indexOf('<h3>리더남 홈판 프롬프트 (테스트)</h3>');
    assert.ok(gemini > 0 && free > gemini && locked > free, 'gemini → naver free → protected');
    assert.equal((html.match(/class="hub-tile[ "]/g) || []).length, 3);
});

test('naver free prompt tile links to the notion page in a new tab, safely', () => {
    const tile = tileMarkup('네이버 무료 프롬프트');
    assert.match(tile, new RegExp(`<a class="hub-tile[^"]*" href="${FREE_URL.replace(/[.?]/g, '\\$&')}" target="_blank" rel="noopener noreferrer"`));
});

test('homefeed prompt tile is a password form — no link, no anchor, no url in markup', () => {
    const tile = tileMarkup('리더남 홈판 프롬프트 (테스트)');
    assert.match(tile, /<form/);
    assert.match(tile, /type="password"/);
    assert.doesNotMatch(tile, /<a /);
    assert.doesNotMatch(tile, /href=/);
    assert.doesNotMatch(html, /notion\.(?:com|so|site)\/p\/AI-(?!44ec04a37c4c4c928f06241828d55982)/);
});

test('protected tile shows the agreed wrong-password message and never persists the typed password', () => {
    const source = fs.readFileSync(new URL('../src/components/chatbots/ProtectedLinkTile.tsx', import.meta.url), 'utf8');
    assert.match(source, /비밀번호가 맞지 않습니다/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
    assert.match(source, /type="password"/);
});

test('section copy no longer claims every card goes to boutique-info', () => {
    assert.doesNotMatch(html, /아래 카드를 누르면 부티크 인포의 글쓰기 프롬프트 페이지로 이동합니다/);
});
