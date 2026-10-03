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
 // 경제 우선 정렬은 화면이 아니라 발굴의 몫(사장님 2026-09-29) — 전체 탭은 주제 로테이션으로 돌아왔다
 assert.ok(!source.includes('goldenFocusPriority'));
 assert.ok(source.includes('shuffleSeed'));
});
test('filtering cannot rotate the fixed free sample or unlock new rows',()=>{
 assert.ok(source.includes('repairFreeSample(board, board?.freeSample?.keywords)'));
 assert.ok(source.includes('!freeNames.includes(row.keyword)'));
 assert.ok(source.includes('return hoistFree(sorted)'));
 assert.ok(source.includes('return hoistFree(interleaved)'));
 assert.ok(source.includes('onUnlock={() => setUnlocked(true)}'));
});
test('old measurements are disclosed and published season badges are passed through untouched',()=>{
 for(const word of ['goldenMeasurementLabel(row, now)','row={row}','최근 7일 수요','7일 넘게 지난','현재 조건에서 확인된 키워드가 없습니다','필터 초기화']) assert.ok(source.includes(word),word);
 // 09-28 판이 시기 배지를 지우던 덮어쓰기 — 다시 들어오면 안 된다
 assert.ok(!source.includes('timingGroup: undefined'));
 assert.ok(!source.includes('trendLabel: goldenTrendLabel'));
});

function load(path, hooks, unlocked, boardLoader) {
 const url = new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>{
  if(id==='react'&&hooks)return hooks;
  if(id==='../../lib/boardBridge')return {loadSavedBoard:boardLoader||(()=>Promise.resolve({board:null})),boardSourceNote:result=>result.source==='app'?'앱에서 가져온 결과':'사이트 공개 결과'};
  if(id==='./LicenseGate')return {default:()=>React.createElement('aside',null,'LICENSE_REQUIRED'),isUnlocked:()=>unlocked,FREE_BOARD_ROWS:5};
  if(id==='./BoardFilters')return {MoneyFilter:()=>null,TopicFilter:()=>null,WriteLaneFilter:()=>null};
  if(id==='./BoardFreshness')return {BoardFreshness:()=>null};
  if(id==='./LewordShared')return {TabIntro:props=>React.createElement('p',null,props.desc)};
  if(id==='./preemptionMeta')return {naverSearchUrl:()=>'',rowMatchesWriteLane:(row,lane)=>lane==='all'||row.layoutBestFor===lane};
  if(id==='./PreemptionCard')return {default:props=>React.createElement('article',{'data-keyword':props.row.keyword,'data-locked':props.locked,'data-timing':props.row.timingGroup||''},props.headTags,props.row.trendLabel)};
  if(id==='./PreemptionPlan'||id==='./DemandChartModal'||id==='./ExternalTrafficBoard')return {default:()=>null};
  if(id==='./useMindmap')return {useMindmap:()=>({mindmap:{},openMindmap:()=>{}})};
  if(id.startsWith('.')){for(const ext of ['','.tsx','.ts']){const resolved=new URL(id+ext,url);if(fs.existsSync(resolved)&&fs.statSync(resolved).isFile())return load(resolved,undefined,unlocked);}}
  return require(id);
 },output,output.exports);
 return output.exports;
}
const candidate={keyword:'소상공인 정책자금 상승후보',topic:'비즈니스·경제',searchVolume:2300,documentCount:98000,measuredAt:'2026-09-28T00:00:00Z',evidence:[],facingPosts:9,sampledTitles:10,sourceUrl:'https://example.org/policy',money:{value:3400,tier:'high',pc:3400,mobile:2400},shortTermTrend:{status:'rising',ratio:1.5,measuredAt:'2026-09-28T01:00:00Z',windowEnd:'2026-09-27',series:Array.from({length:14},(_,i)=>({period:`2026-09-${String(14+i).padStart(2,'0')}`,ratio:i<7?20:30}))}};
// 게임 5 는 발행이 잰 시즌 배지·장기 추세를 단 행 — 화면이 이걸 지우면 안 된다
const board={publishedAt:'2026-09-28T00:00:00Z',freeSample:{day:'2026-09-28',keywords:['게임 0','게임 1','게임 2','게임 3','게임 4']},rows:[...Array.from({length:6},(_,i)=>({keyword:`게임 ${i}`,topic:'게임',searchVolume:1000,documentCount:100,measuredAt:'2026-09-07T00:00:00Z',evidence:[],...(i===5?{timingGroup:'준비 시기',timing:'성수기까지 약 2개월',trendLabel:'시즌성'}:{})})),{keyword:'지원금 대상',topic:'비즈니스·경제',searchVolume:200,documentCount:100,measuredAt:'2026-09-28T00:00:00Z',evidence:[]}]};
function render(unlocked,focus='all',topic='전체',input=board,current=null){
 let index=0;
 // useState 순서: 0 board · 1 status · 2 topic · 7 focus · 8 now · 9 shuffleSeed(고정 — 주제 순서 결정론)
 const hooks={...React,useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>{const i=index++;return [i===0?input:i===1?'ready':i===2?topic:i===7?focus:i===8?Date.parse('2026-09-28T09:00:00Z'):i===9?0.5:i===13?current:typeof initial==='function'?initial():initial,()=>{}];}};
 const Board=load('../src/components/leword/GoldenTab.tsx',hooks,unlocked).default;
 return renderToStaticMarkup(React.createElement(Board,{onAnalyze:()=>{}}));
}
test('rendered board interleaves topics and shows original stale dates',()=>{
 const html=render(true);
 // 전체 탭은 주제 로테이션 — 경제 행이 무조건 맨 앞이 아니라, 각 주제 1등이 앞 두 장 안에 온다
 const order=[...html.matchAll(/data-keyword="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(order.indexOf('지원금 대상')<=1,order.join(','));
 assert.ok(order.indexOf('게임 0')<=1,order.join(','));
 assert.equal((html.match(/data-locked="false"/g)||[]).length,7);
 assert.match(html,/검색결과 확인 9월 7일 · 재확인 필요/);
 assert.match(html,/경제·지원금 <em>1<\/em>/);
 assert.doesNotMatch(html,/경제·지원금의 최근 상승 키워드부터/);
});
test('published season badge and long-term trend survive on golden cards; seven-day rise is only added when measured',()=>{
 const html=render(true);
 // 시즌성 실측(사장님 2026-09-29 "serp 트렌드 황금키워드가 빠졌어, 시즌성이 중요하거든")
 assert.match(html,/data-keyword="게임 5" data-locked="false" data-timing="준비 시기"/);
 assert.match(html,/시즌성<\/article>/);
 assert.doesNotMatch(html,/최근 추세 미확인|장기 추세 ·/);
 assert.doesNotMatch(html,/최근 7일 수요/);
 // 7일 상승이 실측된 행에만 라벨을 덧붙인다 — 배지는 그대로 남는다
 const rising=render(true,'all','전체',{...board,rows:[...board.rows,{...candidate,keyword:'정책자금 황금',timingGroup:'지금 뜨는 중',trendLabel:'상승세'}]});
 assert.match(rising,/data-keyword="정책자금 황금" data-locked="false" data-timing="지금 뜨는 중"/);
 assert.match(rising,/최근 7일 수요 1\.50배/);
 assert.equal((rising.match(/최근 7일 수요/g)||[]).length,1);
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
 assert.match(render(true,'rising','전체',onlyCandidates),/탐색·계절성 목록 · 0개/);
 assert.doesNotMatch(render(true,'high-rising','전체',{...onlyCandidates,trendCandidates:[{...candidate,money:null}]}),/경제·지원금 트렌드 후보/);
 assert.doesNotMatch(render(true,'all','게임',onlyCandidates),/경제·지원금 트렌드 후보/);
});

test('latest sourced research survives a missing legacy board without unlocking private rows',()=>{
 const current={builtAt:'2026-09-28T02:00:00Z',briefs:[{coreKeyword:'청년 창업 지원',field:'지원금·복지',primaryIntent:'청년 창업 지원을 신청할 수 있는 조건은 무엇인가요?',facts:[{id:'a',title:'청년 창업 지원 공고',link:'https://example.com/grant',publishedAt:'2026-09-28T01:00:00Z',snippet:'청년 창업 지원 대상과 신청 방법을 공고합니다.'}]}]};
 const html=render(true,'all','전체',null,current);
 assert.match(html,/최신 조사 후보/);assert.match(html,/청년 창업 지원/);assert.match(html,/추가 확인/);
 assert.match(html,/무슨 일이 있었나/);assert.match(html,/제목 검토 중/);assert.match(html,/문서량 미측정/);assert.match(html,/검색결과 경쟁 확인 확인일 없음/);
 assert.doesNotMatch(html,/★ 작성 추천 ·/);
 const locked=render(false,'all','전체',null,current);
 assert.match(locked,/최신 조사 후보 1개는 라이선스/);
 assert.doesNotMatch(locked,/청년 창업 지원|example.com/);
});

test('golden latest feed uses existing saved-board fallback even when legacy network fails',async()=>{
 const effects=[], updates=[], calls=[];
 let index=0;
 const appBoard={builtAt:'2026-09-28T02:00:00Z',briefs:[{coreKeyword:'앱 최신 경제 후보'}]};
 const hooks={...React,useEffect:effect=>effects.push(effect),useMemo:fn=>fn(),useState:initial=>{const i=index++;return [typeof initial==='function'?initial():initial,value=>updates.push({index:i,value})];}};
 const Component=load('../src/components/leword/GoldenTab.tsx',hooks,false,async kind=>{calls.push(kind);return {board:appBoard,source:'app'};}).default;
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 try {
  globalThis.window={setInterval:()=>1,clearInterval:()=>{}};
  globalThis.document={addEventListener:()=>{},removeEventListener:()=>{}};
  globalThis.fetch=async()=>{throw new Error('offline');};
  renderToStaticMarkup(React.createElement(Component,{onAnalyze:()=>{}}));
  const cleanup=effects[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['topic-briefs']);
  assert.ok(updates.some(update=>update.index===13&&update.value===appBoard));
  assert.ok(updates.some(update=>update.index===14&&update.value==='앱에서 가져온 결과'));
  assert.ok(updates.some(update=>update.index===1&&update.value==='error'));
  cleanup();
 } finally {for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
