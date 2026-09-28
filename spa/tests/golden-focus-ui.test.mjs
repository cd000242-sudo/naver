import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/components/leword/GoldenTab.tsx',import.meta.url),'utf8');
test('golden focus controls show counts and keep existing filters',()=>{
 for(const word of ['경제·지원금','최근 상승','고단가 상승','aria-pressed','matchesGoldenFocus(row, focus','WriteLaneFilter','MoneyFilter','TopicFilter']) assert.ok(source.includes(word),word);
 assert.ok(source.includes('goldenFocusPriority(a, now)'));
 assert.ok(!source.includes('shuffleSeed'));
});
test('filtering cannot rotate the fixed free sample or unlock new rows',()=>{
 assert.ok(source.includes('repairFreeSample(board, board?.freeSample?.keywords)'));
 assert.ok(source.includes('!freeNames.includes(row.keyword)'));
 assert.ok(source.includes('return hoistFree(sorted)'));
 assert.ok(source.includes('onUnlock={() => setUnlocked(true)}'));
});
test('old measurements and long term movement are disclosed separately',()=>{
 for(const word of ['goldenMeasurementLabel(row, now)','goldenTrendLabel(row, now)','timingGroup: undefined','7일 넘게 지난','현재 조건에서 확인된 키워드가 없습니다','필터 초기화']) assert.ok(source.includes(word),word);
});

function load(path, hooks, unlocked) {
 const url = new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>{
  if(id==='react'&&hooks)return hooks;
  if(id==='./LicenseGate')return {default:()=>React.createElement('aside',null,'LICENSE_REQUIRED'),isUnlocked:()=>unlocked,FREE_BOARD_ROWS:5};
  if(id==='./BoardFilters')return {MoneyFilter:()=>null,TopicFilter:()=>null,WriteLaneFilter:()=>null};
  if(id==='./BoardFreshness')return {BoardFreshness:()=>null};
  if(id==='./LewordShared')return {TabIntro:props=>React.createElement('p',null,props.desc)};
  if(id==='./preemptionMeta')return {naverSearchUrl:()=>'',rowMatchesWriteLane:(row,lane)=>lane==='all'||row.layoutBestFor===lane};
  if(id==='./PreemptionCard')return {default:props=>React.createElement('article',{'data-keyword':props.row.keyword,'data-locked':props.locked},props.headTags,props.row.trendLabel)};
  if(id==='./PreemptionPlan'||id==='./DemandChartModal'||id==='./ExternalTrafficBoard')return {default:()=>null};
  if(id==='./useMindmap')return {useMindmap:()=>({mindmap:{},openMindmap:()=>{}})};
  if(id.startsWith('.')){for(const ext of ['','.tsx','.ts']){const resolved=new URL(id+ext,url);if(fs.existsSync(resolved)&&fs.statSync(resolved).isFile())return load(resolved,undefined,unlocked);}}
  return require(id);
 },output,output.exports);
 return output.exports;
}
const candidate={keyword:'소상공인 정책자금 상승후보',topic:'비즈니스·경제',searchVolume:2300,documentCount:98000,measuredAt:'2026-09-28T00:00:00Z',evidence:[],facingPosts:9,sampledTitles:10,sourceUrl:'https://example.org/policy',money:{value:3400,tier:'high',pc:3400,mobile:2400},shortTermTrend:{status:'rising',ratio:1.5,measuredAt:'2026-09-28T01:00:00Z',windowEnd:'2026-09-27',series:Array.from({length:14},(_,i)=>({period:`2026-09-${String(14+i).padStart(2,'0')}`,ratio:i<7?20:30}))}};
const board={publishedAt:'2026-09-28T00:00:00Z',freeSample:{day:'2026-09-28',keywords:['게임 0','게임 1','게임 2','게임 3','게임 4']},rows:[...Array.from({length:6},(_,i)=>({keyword:`게임 ${i}`,topic:'게임',searchVolume:1000,documentCount:100,measuredAt:'2026-09-07T00:00:00Z',evidence:[]})),{keyword:'지원금 대상',topic:'비즈니스·경제',searchVolume:200,documentCount:100,measuredAt:'2026-09-28T00:00:00Z',evidence:[]}]};
function render(unlocked,focus='all',topic='전체',input=board){
 let index=0;
 const hooks={...React,useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>{const i=index++;return [i===0?input:i===1?'ready':i===2?topic:i===7?focus:i===8?Date.parse('2026-09-28T09:00:00Z'):typeof initial==='function'?initial():initial,()=>{}];}};
 const Board=load('../src/components/leword/GoldenTab.tsx',hooks,unlocked).default;
 return renderToStaticMarkup(React.createElement(Board,{onAnalyze:()=>{}}));
}
test('rendered board prioritizes economy and shows original stale dates',()=>{
 const html=render(true);
 assert.ok(html.indexOf('data-keyword="지원금 대상"')<html.indexOf('data-keyword="게임 0"'));
 assert.equal((html.match(/data-locked="false"/g)||[]).length,7);
 assert.match(html,/검색결과 확인 9월 7일 · 재확인 필요/);
 assert.match(html,/경제·지원금 <em>1<\/em>/);
});
test('free preview is fixed through focus and topic changes',()=>{
 const html=render(false);
 assert.equal((html.match(/data-locked="false"/g)||[]).length,5);
 assert.match(html,/data-keyword="지원금 대상" data-locked="true"/);
 const focused=render(false,'economy');
 assert.equal((focused.match(/data-locked="false"/g)||[]).length,0);
 assert.match(focused,/data-keyword="지원금 대상" data-locked="true"/);
 assert.match(render(false,'all','비즈니스·경제'),/data-keyword="지원금 대상" data-locked="true"/);
});
test('unverified rise focus renders explanatory empty state and reset',()=>{
 const html=render(true,'rising');
 assert.doesNotMatch(html,/data-keyword=/);
 assert.match(html,/현재 조건에서 확인된 키워드가 없습니다/);
 assert.match(html,/필터 초기화/);
});
test('measured economic trend candidates disclose competition outside the golden pass list',()=>{
 const html=render(true,'all','전체',{...board,trendCandidates:[candidate]});
 assert.match(html,/경제·지원금 트렌드 후보/);
 assert.match(html,/검색 수요 상승 · 황금키워드 통과 여부 별도/);
 assert.match(html,/소상공인 정책자금 상승후보/);
 assert.match(html,/상위 10개 중 정면 대응 9개 · 경쟁 확인 필요/);
 assert.match(html,/href="https:\/\/example.org\/policy"/);
 assert.match(html,/2,300/);assert.match(html,/98,000/);assert.match(html,/3,400/);
});
test('candidate keyword and metrics are not exposed to locked readers',()=>{
 const html=render(false,'all','전체',{...board,trendCandidates:[candidate]});
 assert.match(html,/경제·지원금 트렌드 후보/);
 assert.match(html,/1개/);
 assert.doesNotMatch(html,/소상공인 정책자금 상승후보|example.org\/policy|98,000/);
 assert.equal((html.match(/data-locked="false"/g)||[]).length,5);
});
test('candidate panel excludes stale, non-economic, and non-rising measurements',()=>{
 const html=render(true,'all','전체',{...board,trendCandidates:[{...candidate,measuredAt:'2026-09-07'}, {...candidate,topic:'게임',keyword:'게임 순위'},{...candidate,shortTermTrend:{...candidate.shortTermTrend,status:'flat'}}]});
 assert.doesNotMatch(html,/경제·지원금 트렌드 후보/);
 assert.doesNotMatch(html,/소상공인 정책자금 상승후보/);
});
test('candidate source URLs reject executable protocols and unknown competition stays unknown',()=>{
 for(const sourceUrl of ['javascript:alert(1)','not a URL',null]) {
  const html=render(true,'all','전체',{...board,trendCandidates:[{...candidate,sourceUrl,money:null,facingPosts:null,sampledTitles:null}]});
  assert.doesNotMatch(html,/관련 출처/);
  assert.match(html,/입찰가 미측정/);
  assert.match(html,/상위 제목 경쟁 미확인/);
 }
});
test('trend candidates remain distinct with no golden passes and respect focus conditions',()=>{
 const onlyCandidates={...board,rows:[],trendCandidates:[candidate]};
 assert.match(render(true,'rising','전체',onlyCandidates),/소상공인 정책자금 상승후보/);
 assert.match(render(true,'rising','전체',onlyCandidates),/황금키워드 통과 목록 · 0개/);
 assert.doesNotMatch(render(true,'high-rising','전체',{...onlyCandidates,trendCandidates:[{...candidate,money:null}]}),/경제·지원금 트렌드 후보/);
 assert.doesNotMatch(render(true,'all','게임',onlyCandidates),/경제·지원금 트렌드 후보/);
});
