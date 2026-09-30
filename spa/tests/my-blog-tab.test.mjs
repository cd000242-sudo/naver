import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

/**
 * 내 블로그 탭 — 사이트 층(①)만으로 완결되는지, 동기화 계정에서 앱 열(③)이 같은 표에 붙는지.
 * 규칙: 앱 미동기화면 열 안에 '앱 실측 전' 한 마디만(안내판 구획 없음) · 확률·예상치 없음.
 */
function load(path, hooks, stubs) {
 const url = new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>{
  if(id === 'react' && hooks)return hooks;
  if(id in stubs)return stubs[id];
  if(id.startsWith('.')){for(const ext of ['', '.tsx', '.ts']){const resolved=new URL(`${id}${ext}`,url);if(fs.existsSync(resolved)&&fs.statSync(resolved).isFile())return load(resolved, undefined, stubs);}}
  return require(id);
 },output,output.exports);
 return output.exports;
}

const titles = { url: 'https://blog.naver.com/leadernam-', checkedAt: '2026-09-30T02:00:00Z', posts: [
 { title: '쏘렌토 하이브리드 실연비 직접 재봤습니다' }, { title: '아이오닉5 충전 요금 정리' }, { title: '제주 렌트카 예약 후기' },
]};
const boards = { picks: [{ topic: '자동차', rows: [{ keyword: '쏘렌토 하이브리드', searchVolume: 12000, documentCount: 3000 }] }],
 golden: [{ keyword: '제주 렌트카', topic: '여행', tierLabel: '상위 3', openSlot: 2, searchVolume: 1500, documentCount: 400 }] };
const plan = { day: '2026-09-29', builtAt: '2026-09-30T03:50:00Z', candidatesTotal: 20, notes: ['자리 실측 실패: 브라우저 없음'],
 measured: { searchVolume: 10, seat: 0 },
 keywords: [
  { keyword: '쏘렌토 하이브리드', topic: '자동차', evidence: ['popularWeek'], rankChange: null, myPosts: { count: 1, homefeedHits: 1, unmeasured: 0 }, homefeedTitleMatches: 3, searchVolume: 12000, seat: { verdict: '반열림', facing: 6, vacancy: 5, sampled: 10 } },
  { keyword: '카니발 하이브리드', topic: '자동차', evidence: ['trendDay'], rankChange: 4, myPosts: { count: 0, homefeedHits: 0, unmeasured: 0 }, homefeedTitleMatches: 0, searchVolume: 30000, seat: null },
 ],
 time: { myHoursYesterday: [{ hour: 7, value: 12 }], myHoursMonth: [{ hour: 8, value: 9 }], topicHours: { topic: '자동차', hours: [{ hour: 21, value: 0.12 }] }, homefeedPublish: null },
 titles: { status: 'ok', provider: 'claude', items: [{ keyword: '쏘렌토 하이브리드', titles: ['쏘렌토 하이브리드 실연비 이러니까 바로 풀리네요'], rejected: [] }] },
};

/**
 * useState 는 선언 순서대로 값을 꽂는다: url · titles · loading · error · boards · bundle · syncNote · syncing.
 * useEffect 는 안 돈다(서버 렌더) — 보드·동기화 묶음은 초기값으로 넣는다.
 */
function render({ bundle, syncOn }) {
 const seeds = [titles.url, titles, false, '', boards, bundle, '', false];
 let index = 0;
 const hooks = { ...React, useState: () => { const at = index++; return [seeds[at], () => {}]; }, useEffect: () => {}, useMemo: (fn) => fn() };
 const stubs = {
  '../../lib/keywordApi': { auditBlogPosts: async () => ({ ok: false }) },
  '../../lib/keySync': { keySyncSlot: () => (syncOn ? 'a'.repeat(64) : null) },
  '../../lib/myBlogSync': { pullMyBlogSync: async () => ({ status: 'none' }), pushMyBlogSync: async () => ({ status: 'no-sync' }) },
  '../../lib/bridge': { bridgeFailureNote: () => '' },
  './LewordShared': { TabIntro: (props) => React.createElement('p', null, props.desc) },
 };
 const Tab = load('../src/components/leword/MyBlogTab.tsx', hooks, stubs).default;
 return renderToStaticMarkup(React.createElement(Tab));
}

test('미동기화: 공개 열만으로 완결 — 표는 실측 값, 앱 열은 "앱 실측 전" 한 마디, 안내판 구획 없음', () => {
 const html = render({ bundle: null, syncOn: false });
 assert.match(html, /내 글 3편 · 보드 2개 중 내가 다룬 말 2개/);
 // 빈자리 실측(황금) 이 앞
 assert.ok(html.indexOf('제주 렌트카') < html.indexOf('쏘렌토 하이브리드'));
 assert.match(html, /<td>2번째<\/td>/);
 assert.match(html, /12,000/); assert.match(html, /3,000/);
 assert.equal((html.match(/앱 실측 전/g) || []).length, 2);
 assert.doesNotMatch(html, /앱에서 하세요|앱을 켜|확률|예상/);
 assert.doesNotMatch(html, /내 유입 시각|앱 판에 없음/);
 // 내 어절 상위
 assert.match(html, /쏘렌토 <b>1<\/b>/);
});

test('동기화 계정: 같은 표에 홈판 탄 편수·오늘 홈판 같은 말·자리 실측 열이 붙고, 앱이 고른 말은 행으로 덧붙는다', () => {
 const html = render({ bundle: { syncedAt: '2026-09-30T04:00:00Z', plan, daily: null }, syncOn: true });
 assert.doesNotMatch(html, /앱 실측 전/);
 assert.match(html, /<td>1편<\/td><td>3건<\/td><td>반열림 · 5번째 빔 · 표본 10<\/td>/);
 // 보드에 없는 앱 후보 '카니발 하이브리드' 도 같은 표에(검색량은 앱 실측값)
 assert.match(html, /카니발 하이브리드/); assert.match(html, /30,000/);
 // 황금 행은 앱 판에 없음 — 그렇다고 말한다
 assert.equal((html.match(/앱 판에 없음/g) || []).length, 1);
 assert.match(html, /내 유입 시각/); assert.match(html, /어제 7시 12/); assert.match(html, /자동차 독자 21시 0.12/);
 assert.match(html, /자리 실측 실패: 브라우저 없음/);
 assert.match(html, /쏘렌토 하이브리드 실연비 이러니까 바로 풀리네요/);
 assert.doesNotMatch(html, /확률|예상/);
});

test('LewordPage 에 myblog 탭이 노출 추적 뒤에 등록되어 있다', () => {
 const page = fs.readFileSync(new URL('../src/pages/LewordPage.tsx', import.meta.url), 'utf8');
 assert.ok(page.indexOf("id: 'rank'") < page.indexOf("id: 'myblog'"));
 assert.match(page, /activeTab === 'myblog' && <MyBlogTab \/>/);
});
