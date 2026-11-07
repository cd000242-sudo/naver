// [2026-11-07 사장님] "제미나이 챗봇도 버튼으로 만들고 아래 버튼들이 먼저 보여야겠죠"
//   → 페이지 전체가 제미나이 소개가 아니라, 제미나이도 버튼(카드) 하나. 카드 묶음이 추천 흐름보다 먼저.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, '..', 'src', 'pages', 'ChatbotsPage.tsx'), 'utf8');
const prerender = JSON.parse(fs.readFileSync(path.join(here, '..', 'scripts', 'prerender-content.json'), 'utf8')).chatbots;

test('tile buttons come right after the hero, before the recommended flow', () => {
    const hero = page.indexOf('className="chatbots-hero"');
    const list = page.indexOf('id="chatbots-list"');
    const flow = page.indexOf('RECOMMENDED FLOW');
    assert.ok(hero >= 0 && list > hero, 'list after hero');
    assert.ok(flow > list, 'flow after list');
});

test('page is not a Gemini-only page — Gemini is one of the buttons', () => {
    assert.doesNotMatch(page, /<h1>무료 제미나이 챗봇<\/h1>/);
    assert.match(page, /<h1>무료 챗봇·프롬프트<\/h1>/);
    assert.doesNotMatch(page, /제미나이로 글쓰기를 시작하세요/);
});

test('static prerender text follows the same order and title', () => {
    assert.match(prerender, /^<h1>무료 챗봇·프롬프트<\/h1>/);
    assert.ok(prerender.indexOf('무료 제미나이 챗봇 사용하러 가기') < prerender.indexOf('추천 사용 흐름'));
});

test('hero is compact so the buttons are on the first screen', () => {
    assert.doesNotMatch(page, /min-height: 700px/);
    assert.match(page, /#chatbots-list \{\s*padding-top: 44px;/);
});

test('tool buttons sit side by side on wide screens', () => {
    assert.match(page, /\.hub-grid \{[\s\S]{0,200}grid-template-columns: repeat\(auto-fit, minmax\(280px, 1fr\)\)/);
});
