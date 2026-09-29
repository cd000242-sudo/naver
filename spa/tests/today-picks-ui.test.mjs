import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function load(path, hooks, unlocked) {
 const url = new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>{
  if(id === 'react' && hooks)return hooks;
  if(id==='./LicenseGate')return {default:()=>React.createElement('aside',null,'LICENSE_REQUIRED'),isUnlocked:()=>unlocked};
  if(id==='./BoardFreshness')return {BoardFreshness:()=>null};
  if(id==='./LewordShared')return {TabIntro:props=>React.createElement('p',null,props.desc)};
  if(id==='./preemptionMeta')return {naverSearchUrl:keyword=> `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`};
  if(id.startsWith('.')){for(const ext of ['', '.tsx', '.ts']){const resolved=new URL(`${id}${ext}`,url);if(fs.existsSync(resolved)&&fs.statSync(resolved).isFile())return load(resolved, undefined, unlocked);}}
  return require(id);
 },output,output.exports);
 return output.exports;
}
const rows=Array.from({length:30},(_,index)=>({keyword:`후보 ${index+1}`,searchVolume:500,documentCount:1000,ratio:index<10?2:0.5,depth:2,comp:null,source:'hint',...(index===0?{freshness:{status:'repeated',lastShownAt:'2026-09-27T00:00:00Z'}}:{freshness:{status:'new'}}),...(index>=10&&index<15?{seasonPeakMonth:10}:{})}));
const data={builtAt:'2026-09-28T00:00:00Z',keep:30,perTopic:200,topics:[{topic:'경제',rows,targetCount:30,shortfall:0}],novelty:{windowDays:7,newCount:29,repeatedCount:1}};
// '지금'은 판 시각 1시간 뒤로 고정 — 픽스처 날짜가 벽시계에 밀려 "늦고 있다" 문구가 끼어들지 않게(픽스처 달력 부패 방지)
function render(unlocked, input=data, nowMs=Date.parse('2026-09-28T01:00:00Z')){let stateIndex=0;const hooks={...React,useState:initial=>{const index=stateIndex++;return [index===0?input:typeof initial==='function'?initial():initial,()=>{}];},useEffect:()=>{},useMemo:fn=>fn()};const Board=load('../src/components/leword/TodayPicksBoard.tsx',hooks,unlocked).default;return renderToStaticMarkup(React.createElement(Board,{onTopicChange:()=>{},nowMs}));}

test('unlocked board renders thirty rows, totals, truthful class counts and recent-repeat badge',()=>{
 const html=render(true);
 assert.equal((html.match(/href="https:\/\/search.naver.com/g)||[]).length,30);
 assert.match(html,/전체 30개 \/ 목표 30개 · 황금 10 · 시즌 앞 5 · 일반 15/);
 assert.match(html,/경제<b>30<\/b>/);
 // 머리말은 한 줄 요약(사장님 2026-09-29 "위에 너무 설명이 많아서 지저분") — 설명 상자 세 개와 주제 아래 문장은 없다
 assert.match(html,/<p>9월 28일 [^<]*09:00 판 · 전체 30개 중 황금 10개 · 새 추천 29 · 재추천 1 · 주제별 30개 목표<\/p>/);
 assert.doesNotMatch(html,/언제 새로 올라오나요|최근 7일 이력 기준|직전 대비 신규|황금 비율은 월 검색량/);
 assert.equal((html.match(/class="lw-note/g)||[]).length,0);
 assert.match(html,/재추천 · 9월 27일 노출/);
 assert.equal((html.match(/title="최근 추천 이력/g)||[]).length,1);
 assert.doesNotMatch(html,/LICENSE_REQUIRED/);
});
test('free board still reveals exactly three rows and gates the remaining twenty-seven',()=>{
 const html=render(false);
 assert.equal((html.match(/href="https:\/\/search.naver.com/g)||[]).length,3);
 assert.match(html,/27건 더/); assert.match(html,/LICENSE_REQUIRED/);
 assert.doesNotMatch(html,/>후보 4<\/a>/);
});
test('legacy edition has no invented freshness report and shows a real shortfall',()=>{
 const html=render(true,{...data,novelty:undefined,topics:[{topic:'경제',rows:rows.slice(0,10).map(({freshness,...row})=>row)}]});
 assert.match(html,/전체 10개 \/ 목표 30개 · 황금 10 · 시즌 앞 0 · 일반 0 · 목표보다 20개 적습니다/);
 assert.doesNotMatch(html,/새 추천|재추천 ·/);
});
test('round label leads the one-line summary and a late round gets exactly one short notice',()=>{
 const html=render(true,{...data,round:{id:'2026-09-28-evening',label:'저녁',scheduledAt:'2026-09-28T10:30:00Z'}});
 assert.match(html,/저녁 회차 · 9월 28일 [^<]*09:00 판 · 전체 30개 중 황금 10개/);
 // 판이 9/20 인데 지금이 9/28 — 늦은 회차 안내는 딱 한 줄
 const late=render(true,{...data,builtAt:'2026-09-20T00:00:00Z'});
 assert.equal((late.match(/class="lw-note/g)||[]).length,1);
 assert.match(late,/늦고 있습니다/);
 // 판 시각 1시간 뒤엔 늦은 게 아니다 — 아무 말도 안 한다
 assert.equal((render(true).match(/늦고 있습니다/g)||[]).length,0);
});
test('sidebar badges use actual row counts while preserving golden detail',()=>{
 const page=fs.readFileSync(new URL('../src/pages/LewordPage.tsx',import.meta.url),'utf8');
 assert.match(page,/className="lw-navi-count"[^\n]+\{topic\.rowCount\}/);
 assert.match(page,/전체 \$\{topic\.rowCount\}개 · 황금 \$\{topic\.golden\}개/);
});
