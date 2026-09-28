import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
let unlocked = false;
function load(path, reactMock) {
 const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>{
  if(id === 'react' && reactMock)return reactMock;
  if(id.endsWith('.css'))return {};
  if(id.includes('boardBridge'))return {loadSavedBoard:async()=>({board:null}),boardSourceNote:()=>''};
  if(id==='./LicenseGate')return {default:()=>React.createElement('aside',null,'LICENSE_REQUIRED'),isUnlocked:()=>unlocked};
  if(id==='./BoardFreshness')return {BoardFreshness:()=>null};
  if(id==='./LewordShared')return {TabIntro:()=>null};
  if(id==='./preemptionMeta')return {naverSearchUrl:()=> 'https://search.naver.com'};
  if(id.includes('topicBriefsModel'))return load('../src/lib/topicBriefsModel.ts');
  return require(id);
 },output,output.exports);
 return output.exports;
}
const {TopicBriefsContent}=load('../src/components/leword/TopicBriefsBoard.tsx');
const sentence='신청 기간은 10월 1일부터 10월 10일까지입니다.';
const item=(id,supported=true)=>({id,title:`지원 공고 ${id}`,coreKeyword:`지원 공고 ${id}`,field:'정책',timing:'NOW',primaryIntent:'언제 신청하나요?',searchVolume:400,serpFacing:1,star:true,facts:[{id:'f1',title:'공식 공고',snippet:sentence,link:'https://example.com/notice'}],editorial:{version:2,status:supported?'supported':'needs_research',review:{passed:supported,issues:supported?[]:['대상 확인 필요']},summary:sentence,audience:'신청 예정자',answers:[{question:'언제 신청하나요?',answer:sentence,factIds:['f1'],excerpts:[{factId:'f1',text:sentence}]}],missing:supported?[]:['대상 확인 필요'],outline:['기간 확인'],angle:'신청 일정 확인'},recommendation:{keyword:`지원 공고 ${id}`,reason:'일정 확인'}});
function render(briefs,props={}){return renderToStaticMarkup(React.createElement(TopicBriefsContent,{data:{builtAt:new Date().toISOString(),briefs},...props}));}
test('editorial workspace separates verified and research states without promoting research',()=>{unlocked=true;const html=render([item(1),item(2,false)]);assert.match(html,/오늘, 어떤 글을 쓸까요/);assert.match(html,/먼저 살펴볼 작성안/);assert.match(html,/추가 조사가 필요한 글감/);assert.match(html,/질문별 답과 근거/);assert.match(html,/근거 검토 완료/);assert.match(html,/추가 확인 필요/);});
test('three free briefs remain the only rendered cards and license gate remains',()=>{unlocked=false;const html=render([1,2,3,4,5].map(id=>item(id)));assert.equal((html.match(/class="tb-card /g)||[]).length,3);assert.match(html,/LICENSE_REQUIRED/);assert.doesNotMatch(html,/<h3>지원 공고 4<\/h3>/);});
test('source notice stays visible and source URLs remain safe through normalization',()=>{unlocked=true;const unsafe=item(1);unsafe.facts[0].link='javascript:alert(1)';const html=render([unsafe],{sourceNotice:React.createElement('p',null,'앱에서 가져온 글감')});assert.match(html,/앱에서 가져온 글감/);assert.doesNotMatch(html,/href="javascript:/);assert.match(html,/선택 제목 복사/);assert.match(html,/작성안 전체 복사/);});
test('supported but nonrecommended briefs have a separate evidence section',()=>{unlocked=true;const value=item(1);value.serpFacing=8;const html=render([value]);assert.match(html,/근거를 확인한 글감/);assert.match(html,/추천 조건을 충족한 작성안이 없습니다/);assert.doesNotMatch(html,/aria-label="먼저 살펴볼 작성안"/);assert.match(html,/class="tb-no-recommendation"/);});

function harness(component) {
 const values=[];let cursor=0;
 const hooks={...React,useState:(initial)=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return[values[index],next=>{values[index]=next;}];},useMemo:fn=>fn(),useId:()=> 'test-title',useEffect:()=>{}};
 const loaded=load('../src/components/leword/TopicBriefsBoard.tsx',hooks);
 return props=>{cursor=0;return loaded[component](props);};
}
function nodes(tree,predicate) { const result=[];function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(predicate(node))result.push(node);visit(node.props?.children);}visit(tree);return result;}
const byText=(tree,text)=>nodes(tree,node=>node.type==='button'&&node.props.children===text)[0];
test('title choice, full brief copy and keyword analysis preserve the selected content',async()=>{
 let copied='',analyzed='';const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
 try{const view=harness('BriefCard');const raw=item(1);raw.titles=[{text:'지원 공고 1 신청 안내'},{text:'지원 공고 1 언제 신청하나요?'}];const model=load('../src/lib/topicBriefsModel.ts');const props={brief:model.normalizeTopicBrief(raw),onAnalyze:value=>{analyzed=value;}};
 let tree=view(props);const radios=nodes(tree,n=>n.type==='input');assert.equal(radios.length,2);radios[1].props.onChange();tree=view(props);byText(tree,'선택 제목 복사').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(copied,'지원 공고 1 언제 신청하나요?');byText(tree,'작성안 전체 복사').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.match(copied,/지원 공고 1 언제 신청하나요/);assert.match(copied,/https:\/\/example.com\/notice/);byText(tree,'검색어 분석').props.onClick();assert.equal(analyzed,'지원 공고 1');tree.props.onToggle({currentTarget:{open:true}});assert.equal(view(props).props.open,true);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('denied clipboard offers selectable complete text and announces recovery',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 try{const view=harness('BriefCard');const props={brief:load('../src/lib/topicBriefsModel.ts').normalizeTopicBrief(item(2,false))};byText(view(props),'작성안 전체 복사').props.onClick();await new Promise(resolve=>setImmediate(resolve));const tree=view(props);const textarea=nodes(tree,n=>n.type==='textarea')[0];assert.ok(textarea);assert.match(textarea.props.value,/대상 확인 필요/);let selected=false;textarea.props.onFocus({currentTarget:{select:()=>{selected=true;}}});assert.equal(selected,true);assert.match(nodes(tree,n=>n.props?.role==='status')[0].props.children,/자동 복사가 되지 않았습니다/);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('changing edition resets the field filter and selects only the chosen round',()=>{
 unlocked=true;const view=harness('TopicBriefsContent');const day=new Date().toISOString();const first=item(1);const second={...item(2),field:'건강'};const props={data:{builtAt:day,rounds:[{slot:'아침',builtAt:day,briefs:[first]},{slot:'저녁',builtAt:day,briefs:[second]}]}};
 let tree=view(props);const fieldButtons=nodes(tree,n=>n.type==='button'&&n.props.className?.includes('tb-field'));fieldButtons.find(n=>n.props.children[0]==='건강').props.onClick();tree=view(props);const roundButtons=nodes(tree,n=>n.type==='button'&&n.props.className?.includes('tb-round'));roundButtons.find(n=>n.props.children[0].props.children==='아침').props.onClick();tree=view(props);const cards=nodes(tree,n=>n.type?.name==='BriefCard');assert.equal(cards.length,1);assert.equal(cards[0].props.brief.field,'정책');assert.ok(nodes(tree,n=>n.type==='button'&&n.props['aria-pressed']&&n.props.children?.[0]==='전체').length);
});
test('loading, empty and error states remain actionable without fictional counts',()=>{
 unlocked=true;assert.match(renderToStaticMarkup(React.createElement(TopicBriefsContent,{data:null})),/불러오는 중/);assert.match(render([]),/이 회차에 공개된 글감이 없습니다/);assert.match(renderToStaticMarkup(React.createElement(TopicBriefsContent,{data:null,error:'다시 시도해 주세요'})),/다시 시도해 주세요/);
});
