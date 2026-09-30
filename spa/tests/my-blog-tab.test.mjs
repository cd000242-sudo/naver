import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

/**
 * 내 블로그 탭(2026-09-30) — 앱이 잰 값만 그리고, 안 잰 칸은 안 잰 것으로 적는지.
 * 로그인 상태·어드바이저 창구 수·내 블로그 카드가 브리지 응답 그대로 나오는지 정적 렌더로 본다.
 */
function load(hooks) {
    const url = new URL('../src/components/leword/MyBlogTab.tsx', import.meta.url);
    const code = ts.transpileModule(fs.readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
    const output = { exports: {} };
    new Function('require', 'module', 'exports', code)((id) => {
        if (id === 'react') return hooks;
        if (id === './LewordShared') return { TabIntro: (props) => React.createElement('p', null, props.desc) };
        if (id === '../../lib/bridge') return { bridgeFailureNote: (failure, label) => failure.status === 'offline' ? '앱을 켜세요' : `${label}: ${failure.message}` };
        if (id === '../../lib/myBlogBridge') return { myBlogSession: async () => ({}), myBlogOpenLogin: async () => ({}), myBlogClass: async () => ({}) };
        return require(id);
    }, output, output.exports);
    return output.exports.default;
}

/** useState 를 순서대로 고정값으로 채운다 — [세션, 기록, 여는중, 안내문]. */
function render(states) {
    let index = 0;
    const hooks = { ...React, useState: (initial) => [index < states.length ? states[index++] : (index++, typeof initial === 'function' ? initial() : initial), () => {}], useEffect: () => {}, useCallback: (fn) => fn };
    const Tab = load(hooks);
    return renderToStaticMarkup(React.createElement(Tab));
}

const record = {
    blogId: 'leadernam-', measuredAt: '2026-09-30T05:12:00', postsAvailable: 39,
    card: { headline: '글 452편 · 이웃 1,200명', lines: [{ text: '최근 30일에 글 6편', evidence: '9월 30일 05:12 공개 목록' }], notices: [] },
    topicProfile: { analyzed: 452, totalPosts: 452, words: [{ word: '보험', posts: 41 }, { word: '연금', posts: 22 }], recentWords: [{ word: '연금', posts: 5 }], declaredTopic: null },
    wonRows: [
        { keyword: '실손보험 청구', blogRank: 3, searchVolume: 1200, documentCount: null, postUrl: 'https://blog.naver.com/leadernam-/1' },
        { keyword: '지는 말', blogRank: 17, searchVolume: 500, documentCount: 900 },
        { keyword: '안 잰 말', blogRank: null, searchVolume: null, documentCount: null },
    ],
    band: { measuredCount: 8, wonCount: 1, nearCount: 1, volumeMin: 500, volumeMax: 1200, topics: [] },
};

test('로그인 됨 + 기록 있음: 앱이 준 값이 그대로 보이고 첫 페이지 글만 표에 오른다', () => {
    const html = render([{ kind: 'ok', session: { loggedIn: true, windowOpen: false, capturedToday: 12, endpointCount: 3 } }, { kind: 'ok', record }, false, '']);
    assert.match(html, /되어 있어요/);
    assert.match(html, /3종/);
    assert.match(html, /요청 12건/);
    assert.match(html, /어드바이저 창 열기/);
    assert.match(html, /9월 30일 05:12에 잰 값/);
    assert.match(html, /글 452편 · 이웃 1,200명/);
    assert.match(html, /첫 페이지 <b[^>]*>1개<\/b>/);
    assert.match(html, /실손보험 청구/);
    assert.match(html, /3위/);
    assert.match(html, /안 잼/); // 문서수 null 은 '안 잼'
    assert.doesNotMatch(html, /지는 말/); // 17위는 첫 페이지가 아니다
    assert.doesNotMatch(html, /안 잰 말/);
    assert.match(html, /보험 <em[^>]*>41<\/em>/);
    assert.doesNotMatch(html, /점수|확률|예상/);
});

test('로그인 안 됨 + 기록 없음: 로그인 창 열기 버튼과 앱에서 재라는 안내만 낸다', () => {
    const html = render([{ kind: 'ok', session: { loggedIn: false, windowOpen: false, capturedToday: 0, endpointCount: 0 } }, { kind: 'ok', record: null }, false, '']);
    assert.match(html, /안 되어 있어요/);
    assert.match(html, /네이버 로그인 창 열기/);
    assert.match(html, /아직 잰 기록이 없습니다/);
    assert.match(html, /\[내 블로그 보기\]/);
    assert.doesNotMatch(html, /<table/);
});

test('앱 꺼짐: 두 구획 모두 꺼짐 안내를 내고 값을 지어내지 않는다', () => {
    const html = render([{ kind: 'fail', failure: { status: 'offline' } }, { kind: 'fail', failure: { status: 'offline' } }, false, '']);
    assert.equal((html.match(/앱을 켜세요/g) || []).length, 2);
    assert.doesNotMatch(html, /되어 있어요|종<\/b>/);
});

test('사이드 탭에 등록돼 있고 이용권 탭이다(맛보기 목록에 없다)', () => {
    const page = fs.readFileSync(new URL('../src/pages/LewordPage.tsx', import.meta.url), 'utf8');
    assert.match(page, /\{ id: 'myblog', label: '내 블로그'/);
    assert.match(page, /activeTab === 'myblog' && <MyBlogTab \/>/);
    assert.match(page, /import MyBlogTab from '..\/components\/leword\/MyBlogTab';/);
    assert.doesNotMatch(page, /GUEST_TABS[^\n]*myblog/);
});

test('브리지 헬퍼는 앱 경로 셋만 부르고 측정 시작 경로는 없다', () => {
    const lib = fs.readFileSync(new URL('../src/lib/myBlogBridge.ts', import.meta.url), 'utf8');
    assert.match(lib, /'\/v1\/bridge\/my-blog\/session'/);
    assert.match(lib, /'\/v1\/bridge\/my-blog\/session\/open'/);
    assert.match(lib, /'\/v1\/bridge\/my-blog\/class'/);
    assert.doesNotMatch(lib, /my-blog\/measure|blog-class-measure/);
});
