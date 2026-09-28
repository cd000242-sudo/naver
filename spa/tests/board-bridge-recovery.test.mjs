import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const now = () => new Date().toISOString();
const board = (title='앱 자료', builtAt=now()) => ({builtAt,briefs:[{title,coreKeyword:title,facts:[]}]});
const titleBoard = (seo='새 제목') => ({generatedAt:now(),titles:[{keyword:'키워드',seo,at:now()}]});
const ok = (value) => ({status:'ok',result:{state:'ready',board:value}});
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;});return {promise,resolve}; };
const tick = () => new Promise(resolve=>setImmediate(resolve));
function load(file, overrides={}) {
 const source=fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 new Function('require','exports','module',js)(id=> {
  if(id in overrides)return overrides[id];
  if(id.endsWith('.css'))return {};
  if(id==='./boardFallback'||id==='../lib/boardFallback')return load('lib/boardFallback.ts');
  return require(id);
 },mod.exports,mod);
 return mod.exports;
}
async function withFetch(fn, run) {const original=globalThis.fetch;globalThis.fetch=fn;try{await run();}finally{globalThis.fetch=original;}}

test('깨진 공개 JSON이어도 정상 앱 저장본을 읽으며 AI 경로는 호출하지 않는다', async()=>{
 const calls=[];
 const bridge=load('lib/boardBridge.ts',{'./bridge':{bridgeCall:async(path,options)=>{calls.push([path,options]);return ok(board());}}});
 await withFetch(async()=>({ok:true,json:async()=>{throw new SyntaxError('broken JSON');}}),async()=>{
  const result=await bridge.loadSavedBoard('topic-briefs');assert.equal(result.source,'app');
  assert.deepEqual(calls,[['/v1/bridge/boards/topic-briefs',undefined]]);
 });
});
test('최신 정상 저장본을 읽은 뒤 서버·앱 실패 또는 낡은 공개본을 만나도 유지한다', async()=>{
 let app=ok(board()),site=null;
 const bridge=load('lib/boardBridge.ts',{'./bridge':{bridgeCall:async()=>app}});
 await withFetch(async()=>({ok:!!site,json:async()=>site}),async()=>{
  const first=await bridge.loadSavedBoard('topic-briefs');
  app={status:'offline'};site=board('옛 공개본',new Date(Date.now()-3600000).toISOString());
  const old=await bridge.loadSavedBoard('topic-briefs');assert.equal(old.generatedAt,first.generatedAt);assert.equal(old.source,'app');
  site=null;const missing=await bridge.loadSavedBoard('topic-briefs');assert.equal(missing.generatedAt,first.generatedAt);
 });
});
test('빈 제목 조회는 영구·30초 실패캐시 없이 다음 조회에서 앱 복구를 반영한다', async()=>{
 let app={status:'offline'};
 const bridge=load('lib/boardBridge.ts',{'./bridge':{bridgeCall:async()=>app}});
 await withFetch(async()=>({ok:false}),async()=>{
  assert.equal((await bridge.loadSavedBriefTitles()).length,0);
  app=ok(titleBoard());assert.equal((await bridge.loadSavedBriefTitles())[0].seo,'새 제목');
 });
});
test('정상 제목 조회는 공유하고 명시적 생성만 POST 경로로 보낸다', async()=>{
 const calls=[];
 const bridge=load('lib/boardBridge.ts',{'./bridge':{bridgeCall:async(path,options)=>{calls.push([path,options]);return ok(titleBoard());}}});
 await withFetch(async()=>({ok:false}),async()=>{
  await Promise.all([bridge.loadSavedBriefTitles(),bridge.loadSavedBriefTitles()]);assert.equal(calls.length,1);assert.equal(calls[0][1],undefined);
  await bridge.createAppBriefTitle('키워드');assert.equal(calls[1][0],'/v1/bridge/brief-titles');assert.equal(calls[1][1].method,'POST');assert.deepEqual(JSON.parse(calls[1][1].body),{keyword:'키워드'});
 });
});
function componentHarness(savedPromise, generate) {
 const state=[],refs=[],effects=[];let cursor=0,refIndex=0,mounted=false;
 const hooks={...React,useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef:initial=>{const index=refIndex++;return refs[index]??(refs[index]={current:initial});},useEffect:fn=>{if(!mounted)effects.push(fn);}};
 const Component=load('components/AppBriefTitles.tsx',{react:hooks,'../lib/boardBridge':{loadSavedBriefTitles:()=>savedPromise,createAppBriefTitle:generate},'../lib/bridge':{bridgeFailureNote:()=> '생성 실패'}}).default;
 let cleanup=[];
 return {render:()=>{cursor=0;refIndex=0;const tree=Component({keyword:'키워드'});if(!mounted){mounted=true;cleanup=effects.map(fn=>fn());}return tree;},unmount:()=>cleanup.forEach(fn=>fn?.())};
}
function nodes(tree,type) {return [tree,...(Array.isArray(tree?.props?.children)?tree.props.children:[tree?.props?.children]).flatMap(child=>child&&typeof child==='object'?nodes(child,type):[])].filter(node=>node?.type===type);}
const text=(tree)=>JSON.stringify(tree);
test('느린 저장본 응답이 명시적으로 생성한 최신 제목을 덮지 않는다',async()=>{
 const pending=deferred();const h=componentHarness(pending.promise,async()=>ok(titleBoard('막 만든 제목')));
 nodes(h.render(),'button')[0].props.onClick();await tick();assert.match(text(h.render()),/막 만든 제목/);
 pending.resolve([{keyword:'키워드',seo:'오래된 저장본',source:'site',at:new Date(Date.now()-3600000).toISOString()}]);await tick();assert.match(text(h.render()),/막 만든 제목/);assert.doesNotMatch(text(h.render()),/오래된 저장본/);
});
test('페이지 열기는 생성하지 않고 닫힌 화면의 늦은 생성은 무시한다',async()=>{
 let calls=0;const pending=deferred();const h=componentHarness(Promise.resolve([]),()=>{calls++;return pending.promise;});
 h.render();await tick();assert.equal(calls,0);nodes(h.render(),'button')[0].props.onClick();h.unmount();pending.resolve(ok(titleBoard('닫힌 후 제목')));await tick();assert.doesNotMatch(text(h.render()),/닫힌 후 제목/);
});


test('이슈 보드 첫 실패 뒤 다시 열면 재조회하며 무료·유료 구분은 화면에서 유지한다',async()=>{
 let calls=0;
 const issue={publishedAt:now(),rows:[],issues:[{issue:'키워드',headlines:[{title:'보도 근거'}],concentrated:[],nextWave:[]}]};
 const flow=load('lib/issueFlow.ts',{'./boardBridge':{loadSavedBoard:async()=>({board:++calls===1?null:issue,source:'app'}),boardSourceNote:()=> '앱 결과'},'./issueRecommendationGate.mjs':{classifyIssuePublication:()=>({status:'observe'}),inspectIssueRelation:()=>({related:true})}});
 assert.equal(await flow.loadIssueBoardOnce(),null);
 const recovered=await flow.loadIssueBoardOnce();assert.equal(recovered.issues[0].issue,'키워드');assert.equal(calls,2);
 assert.equal(await flow.loadIssueBoardOnce(),recovered);assert.equal(calls,2);
 const modal=fs.readFileSync(new URL('../src/components/SourceBriefModal.tsx',import.meta.url),'utf8');
 assert.match(modal,/unlocked \? waveAll : waveAll.slice\(0, FREE_WAVE_CHIPS\)/);
});


test('동일 공개 회차 재조회 중 앱이 꺼져도 방금 보강한 정상 브리프는 유지한다',async()=>{
 const site={publishedAt:now(),rows:[{keyword:'축제 입장권',issue:'지역축제'}],issues:[]};
 let app=ok({publishedAt:new Date(Date.now()-3600000).toISOString(),issues:[{issue:'지역축제',why:'개막 보도',headlines:[{title:'축제 개막'}],nextWave:[]}]});
 const bridge=load('lib/boardBridge.ts',{'./bridge':{bridgeCall:async()=>app}});
 await withFetch(async()=>({ok:true,json:async()=>site}),async()=>{
  const first=await bridge.loadSavedBoard('issue-niche');assert.equal(first.supplementedIssues,1);
  app={status:'offline'};const retry=await bridge.loadSavedBoard('issue-niche');assert.equal(retry.board.issues[0].why,'개막 보도');assert.equal(retry.supplementedIssues,1);
 });
});
