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
 const sourceUrl=new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(sourceUrl,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
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
  if(id.startsWith('.')){for(const extension of ['', '.tsx', '.ts', '.mjs', '.js']){const resolved=new URL(`${id}${extension}`,sourceUrl);if(fs.existsSync(resolved)&&fs.statSync(resolved).isFile())return load(resolved,reactMock);}}
  return require(id);
 },output,output.exports);
 return output.exports;
}
const {TopicBriefsContent}=load('../src/components/leword/TopicBriefsBoard.tsx');
test('main board is a dense list without hero or trial editor and page keeps login gate',()=>{
 unlocked=true;const html=render([item(1)]);assert.doesNotMatch(html,/tb-hero|체험 원고|WritingWorkbench/);assert.match(html,/오늘의 글감/);assert.match(html,/네이버 SEO 제목/);assert.match(html,/네이버 홈판 제목/);assert.match(html,/문서량/);assert.match(html,/상위노출 가능성/);assert.match(html,/반드시 넣을 내용/);assert.match(html,/넣지 말아야 할 내용/);assert.match(html,/이미지 · 캡처 가이드/);
 const page=fs.readFileSync(new URL('../src/pages/LewordPage.tsx',import.meta.url),'utf8');assert.doesNotMatch(page,/WritingTrialPreview/);assert.match(page,/!lockedTab && activeTab === 'briefs'/);
});
const sentence='신청 기간은 10월 1일부터 10월 10일까지입니다.';
const item=(id,supported=true)=>({id,title:`지원 공고 ${id}`,coreKeyword:`지원 공고 ${id}`,field:'정책',timing:'NOW',primaryIntent:'언제 신청하나요?',searchVolume:400,serpFacing:1,star:true,facts:[{id:'f1',title:'공식 공고',snippet:sentence,link:'https://example.com/notice'}],editorial:{version:2,status:supported?'supported':'needs_research',review:{passed:supported,issues:supported?[]:['대상 확인 필요']},summary:sentence,audience:'신청 예정자',answers:[{question:'언제 신청하나요?',answer:sentence,factIds:['f1'],excerpts:[{factId:'f1',text:sentence}]}],missing:supported?[]:['대상 확인 필요'],outline:['기간 확인'],angle:'신청 일정 확인'},recommendation:{keyword:`지원 공고 ${id}`,reason:'일정 확인'}});
function render(briefs,props={}){return renderToStaticMarkup(React.createElement(TopicBriefsContent,{data:{builtAt:new Date().toISOString(),briefs},...props}));}
test('compact cards show reviewed and research states without promoting research',()=>{unlocked=true;const html=render([item(1),item(2,false)]);assert.match(html,/오늘의 글감/);assert.match(html,/무슨 일이 있었나요/);assert.match(html,/근거 검토 완료/);assert.match(html,/추가 확인 필요/);});
test('three free briefs remain the only rendered cards and license gate remains',()=>{unlocked=false;const html=render([1,2,3,4,5].map(id=>item(id)));assert.equal((html.match(/class="tb-card /g)||[]).length,3);assert.match(html,/LICENSE_REQUIRED/);assert.doesNotMatch(html,/<h3>지원 공고 4<\/h3>/);});
test('source notice stays visible and source URLs remain safe through normalization',()=>{unlocked=true;const unsafe=item(1);unsafe.facts[0].link='javascript:alert(1)';const html=render([unsafe],{sourceNotice:React.createElement('p',null,'앱에서 가져온 글감')});assert.match(html,/앱에서 가져온 글감/);assert.doesNotMatch(html,/href="javascript:/);assert.match(html,/선택 제목 복사/);assert.match(html,/작성안 전체 복사/);});
test('supported but nonrecommended briefs have no recommendation badge',()=>{unlocked=true;const value=item(1);value.serpFacing=8;const html=render([value]);assert.match(html,/근거 검토 완료/);assert.doesNotMatch(html,/tb-recommended-badge/);assert.match(html,/상위노출 가능성/);});

function harness(component, path='../src/components/leword/TopicBriefsBoard.tsx') {
 const values=[];let cursor=0;
 const hooks={...React,useState:(initial)=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return[values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;}];},useMemo:fn=>fn(),useId:()=> 'test-title',useEffect:()=>{}};
 const loaded=load(path,hooks);
 return props=>{cursor=0;return loaded[component](props);};
}
function nodes(tree,predicate) { const result=[];function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(predicate(node))result.push(node);visit(node.props?.children);}visit(tree);return result;}
const byText=(tree,text)=>nodes(tree,node=>node.type==='button'&&node.props.children===text)[0];

test('main field preference reorders without hiding briefs and defaults to financial topics',()=>{
 unlocked=true;const view=harness('TopicBriefsContent');const props={data:{builtAt:new Date().toISOString(),briefs:[{...item(1),field:'스포츠'},{...item(2),field:'지원금·복지'},{...item(3),field:'경제·금융'}]}};
 let tree=view(props);let cards=nodes(tree,n=>n.type?.name==='BriefCard');assert.equal(cards.length,3);assert.equal(cards[0].props.brief.field,'지원금·복지');
 const select=nodes(tree,n=>n.type==='select'&&n.props['aria-label']==='먼저 볼 분야')[0];assert.ok(select);select.props.onChange({target:{value:'스포츠'}});tree=view(props);cards=nodes(tree,n=>n.type?.name==='BriefCard');assert.equal(cards[0].props.brief.field,'스포츠');assert.equal(cards.length,3);
 assert.match(render(props.data.briefs),/공개된 글감의 표시 순서만 바뀝니다/);
});

test('volume details visibly identify source, device ranges and retrieval time',()=>{
 unlocked=true;const raw=item(1);raw.searchVolumeEvidence={source:'naver-searchad',keyword:raw.coreKeyword,measuredAt:new Date().toISOString(),pc:100,mobile:null,pcUnder10:false,mobileUnder10:true,totalMin:100,totalMax:109,status:'range'};
 const html=render([raw]);assert.match(html,/100~109/);assert.match(html,/네이버 검색광고/);assert.match(html,/PC 100 · 모바일 10 미만/);assert.match(html,/조회/);
});
test('title choice, full brief copy and keyword analysis preserve the selected content',async()=>{
 let copied='',analyzed='';const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
 try{const view=harness('BriefCard');const raw=item(1);raw.titles=[{text:'지원 공고 1 신청 안내'},{text:'지원 공고 1 언제 신청하나요?'}];const model=load('../src/lib/topicBriefsModel.ts');const props={brief:model.normalizeTopicBrief(raw),onAnalyze:value=>{analyzed=value;}};
 let tree=view(props);const radios=nodes(tree,n=>n.type==='input');assert.equal(radios.length,2);radios[1].props.onChange();tree=view(props);byText(tree,'선택 제목 복사').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(copied,'지원 공고 1 언제 신청하나요?');byText(tree,'작성안 전체 복사').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.match(copied,/지원 공고 1 언제 신청하나요/);assert.match(copied,/https:\/\/example.com\/notice/);byText(tree,'검색어 분석').props.onClick();assert.equal(analyzed,'지원 공고 1');
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
// 7일 창고(2026-09-29): 파일이 최근 7일 회차를 쌓고, 기본 보기는 전체 누적. 같은 검색어는 최신 회차 것만.
const shelfRound=(day,slot,briefs)=>({day,slot,builtAt:`${day}T03:00:00.000Z`,briefs});
test('default view is the seven-day shelf: all rounds merged, newest copy of a repeated keyword, round tabs only for the latest day',()=>{
 unlocked=true;const view=harness('TopicBriefsContent');
 const props={data:{builtAt:'2026-09-13T03:00:00.000Z',day:'2026-09-13',slot:'아침',shelfDays:7,rounds:[shelfRound('2026-09-11','오후',[{...item(1),field:'스포츠'},{...item(2),summary:'옛 요약'}]),shelfRound('2026-09-13','아침',[{...item(2),field:'경제·금융'},{...item(3),field:'건강'}])]}};
 let tree=view(props);let cards=nodes(tree,n=>n.type?.name==='BriefCard');
 assert.equal(cards.length,3);
 assert.equal(cards.find(c=>c.props.brief.core.keyword==='지원 공고 2').props.brief.field,'경제·금융');
 const roundButtons=nodes(tree,n=>n.type==='button'&&n.props.className?.includes('tb-round'));
 assert.equal(roundButtons[0].props.children[0].props.children,'전체 누적');assert.equal(roundButtons[0].props['aria-pressed'],true);
 assert.equal(roundButtons.find(n=>n.props.children[0].props.children==='아침').props.disabled,false);
 assert.equal(roundButtons.find(n=>n.props.children[0].props.children==='오후').props.disabled,true,'옛 날짜의 오후 회차는 오늘 탭으로 열리지 않는다');
 const html=render(props.data.rounds.flatMap(r=>r.briefs),{data:props.data});
 assert.match(html,/최근 7일/);assert.match(html,/<b>3<\/b>/);
 roundButtons.find(n=>n.props.children[0].props.children==='아침').props.onClick();tree=view(props);cards=nodes(tree,n=>n.type?.name==='BriefCard');
 assert.equal(cards.length,2);assert.ok(cards.every(c=>c.props.brief.field!=='스포츠'));
});
test('shelf lists thirty cards at a time and reveals more on demand',()=>{
 unlocked=true;const view=harness('TopicBriefsContent');
 const props={data:{builtAt:new Date().toISOString(),briefs:Array.from({length:35},(_,i)=>item(i+1))}};
 let tree=view(props);assert.equal(nodes(tree,n=>n.type?.name==='BriefCard').length,30);
 const more=nodes(tree,n=>n.type==='button'&&n.props.className?.includes('tb-more'))[0];assert.ok(more);assert.match(String(more.props.children.join?.('')??more.props.children),/5/);
 more.props.onClick();tree=view(props);assert.equal(nodes(tree,n=>n.type?.name==='BriefCard').length,35);
 assert.equal(nodes(tree,n=>n.type==='button'&&n.props.className?.includes('tb-more')).length,0);
 unlocked=false;assert.equal((render(props.data.briefs).match(/class="tb-card /g)||[]).length,3,'무료 3건 게이트는 그대로');
});
test('loading, empty and error states remain actionable without fictional counts',()=>{
 unlocked=true;assert.match(renderToStaticMarkup(React.createElement(TopicBriefsContent,{data:null})),/불러오는 중/);assert.match(render([]),/이 회차에 공개된 글감이 없습니다/);assert.match(renderToStaticMarkup(React.createElement(TopicBriefsContent,{data:null,error:'다시 시도해 주세요'})),/다시 시도해 주세요/);
});
const writingItem=(id=10)=>{
 const raw=item(id);
 raw.facts.push({id:'f2',title:'신청 전 확인 안내',snippet:'신청 전 공고의 접수 기간과 제출 방법을 확인하세요.',link:'https://example.com/guide'});
 raw.writingPackage={version:1,status:'ready',title:`지원 공고 ${id} 신청 기간과 확인 순서`,intro:'신청 기간을 먼저 확인한 뒤 공고에서 제출 방법을 살펴보세요.',sections:[{heading:'신청 기간',paragraphs:[sentence],factIds:['f1']},{heading:'신청 전에 확인할 내용',paragraphs:['신청 전 공고의 접수 기간과 제출 방법을 확인하세요.'],factIds:['f2']}],table:{caption:'신청 일정 한눈에 보기',headers:['구분','일정'],rows:[['접수 시작','10월 1일'],['접수 종료','10월 10일']],factIds:['f1']},faq:[{question:'언제 신청하나요?',answer:sentence,factIds:['f1']}],conclusion:'공고에서 접수 일정을 확인한 뒤 신청을 준비하세요.',nextSteps:['공고의 최신 접수 기간을 확인하세요.','제출 방법을 확인하세요.'],missing:[],sourceIds:['f1','f2'],reviewedAt:new Date().toISOString()};
 return raw;
};
const writingModel=raw=>load('../src/lib/topicBriefsModel.ts').normalizeTopicBrief(raw);
const writingHarness=()=>harness('default','../src/components/leword/WritingWorkbench.tsx');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const writingCopyButton=tree=>nodes(tree,node=>node.type==='button'&&node.props.className==='tb-writing-copy')[0];
function editWriting(view,props,title,body){
 byText(view(props),'직접 다듬기').props.onClick();
 let tree=view(props);
 nodes(tree,node=>node.type==='input')[0].props.onChange({target:{value:title}});
 nodes(tree,node=>node.type==='textarea')[0].props.onChange({target:{value:body}});
 return view(props);
}

test('every recommended card has a star including recommendations beyond the shortlist',()=>{
 unlocked=true;
 const html=render([1,2,3,4,5,6].map(id=>item(id)).concat(item(7,false)));
 assert.equal((html.match(/class="tb-recommended-badge"/g)||[]).length,6);
 assert.equal((html.match(/aria-hidden="true">★<\/span> 추천 글감/g)||[]).length,6);
 assert.equal((html.match(/class="tb-card /g)||[]).length,7);
 const cards=nodes(harness('TopicBriefsContent')({data:{builtAt:new Date().toISOString(),briefs:[item(1),item(2),item(3,false)]}}),node=>node.type?.name==='BriefCard');
 assert.equal(cards.filter(card=>card.props.brief.recommended).length,2);
});

test('featured position and raw star flag never fabricate a recommendation',()=>{
 const raw=item(1);raw.searchVolume=null;raw.star=true;
 const brief=writingModel(raw);assert.equal(brief.recommended,false);
 const tree=harness('BriefCard')({brief,featured:true});
 assert.equal(nodes(tree,node=>node.props?.className==='tb-recommended-badge').length,0);
 assert.ok(tree.props.className.includes('tb-card-featured'));
 const research=harness('BriefCard')({brief:writingModel(item(2,false)),featured:true});
 assert.equal(nodes(research,node=>node.props?.className==='tb-recommended-badge').length,0);
});

test('writing package preview contains real sections table FAQ and referenced source links',()=>{
 const brief=writingModel(writingItem());assert.ok(brief.writing);
 const Workbench=load('../src/components/leword/WritingWorkbench.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Workbench,{brief}));
 assert.match(html,/글쓰기 작업실/);assert.match(html,/작성안 미리보기/);
 assert.match(html,/<caption>신청 일정 한눈에 보기<\/caption>/);
 assert.match(html,/<th scope="col">구분<\/th>/);assert.match(html,/<td>10월 10일<\/td>/);
 assert.match(html,/자주 묻는 질문/);assert.match(html,/https:\/\/example.com\/notice/);assert.match(html,/https:\/\/example.com\/guide/);
 assert.doesNotMatch(html,/tb-recommended-badge/);
});

test('complete writing packages remain inside the free-three gate without auto-opening editors',()=>{
 unlocked=false;
 const raw=[item(1),item(2),item(3),writingItem(4),writingItem(5)];
 const html=render(raw);
 assert.equal((html.match(/class="tb-card /g)||[]).length,3);assert.match(html,/LICENSE_REQUIRED/);
 assert.match(html,/지원 공고 4/);
 const cards=nodes(harness('TopicBriefsContent')({data:{builtAt:new Date().toISOString(),briefs:raw}}),node=>node.type?.name==='BriefCard');
 assert.equal(cards.length,3);assert.equal(cards[0].props.brief.core.keyword,'지원 공고 4');
 assert.ok(cards.every(card=>card.props.initialOpen === undefined));
 assert.equal(cards.filter(card=>card.props.brief.writing).length,2);
});

test('writing priority does not move an unmeasured package ahead of recommendations',()=>{
 unlocked=false;
 const unmeasured=writingItem(4);unmeasured.searchVolume=null;
 const cards=nodes(harness('TopicBriefsContent')({data:{builtAt:new Date().toISOString(),briefs:[unmeasured,item(1),item(2),item(3)]}}),node=>node.type?.name==='BriefCard');
 assert.equal(cards.length,3);assert.ok(cards.every(card=>card.props.brief.recommended));
 assert.ok(cards.every(card=>!card.props.brief.writing));
});

test('editor preserves title and body across preview switches and copies edits plus sources',async()=>{
 let copied='';const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
 try{
  const view=writingHarness();const props={brief:writingModel(writingItem())};
  const original=load('../src/lib/topicBriefsModel.ts').writingPackageBody(props.brief);
  byText(view(props),'직접 다듬기').props.onClick();let tree=view(props);
  assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,original);
  tree=editWriting(view,props,'수정한 제목','내 독자를 위한 수정 본문\n둘째 문단');
  byText(tree,'원고 미리보기').props.onClick();tree=view(props);
  assert.equal(nodes(tree,node=>node.type==='h3')[0].props.children,'수정한 제목');
  assert.equal(nodes(tree,node=>node.props?.className==='tb-writing-plain')[0].props.children,'내 독자를 위한 수정 본문\n둘째 문단');
  writingCopyButton(tree).props.onClick();await flush();
  assert.ok(copied.startsWith('# 수정한 제목\n\n내 독자를 위한 수정 본문\n둘째 문단'));
  assert.match(copied,/참고 출처/);assert.match(copied,/https:\/\/example.com\/notice/);assert.match(copied,/https:\/\/example.com\/guide/);
  assert.doesNotMatch(copied,/## 신청 기간/);
  byText(view(props),'직접 다듬기').props.onClick();tree=view(props);
  assert.equal(nodes(tree,node=>node.type==='input')[0].props.value,'수정한 제목');
  assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,'내 독자를 위한 수정 본문\n둘째 문단');
  byText(tree,'수정 취소 · 원본 복원').props.onClick();tree=view(props);
  assert.equal(nodes(tree,node=>node.type==='input')[0].props.value,props.brief.writing.title);
  assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,original);
  assert.equal(byText(tree,'수정 취소 · 원본 복원'),undefined);
  assert.match(nodes(tree,node=>node.props?.role==='status')[0].props.children,/복원했습니다/);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('writing clipboard failure preserves edited content with a selectable fallback',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw new Error('denied');}}}});
 try{
  const view=writingHarness();const props={brief:writingModel(writingItem())};
  writingCopyButton(editWriting(view,props,'직접 복사 제목','직접 복사 본문')).props.onClick();await flush();
  const tree=view(props);const fallback=nodes(tree,node=>node.type==='textarea'&&node.props.readOnly)[0];
  assert.ok(fallback);assert.match(fallback.props.value,/# 직접 복사 제목\n\n직접 복사 본문/);assert.match(fallback.props.value,/https:\/\/example.com\/guide/);
  let selected=false;fallback.props.onFocus({currentTarget:{select:()=>{selected=true;}}});assert.equal(selected,true);
  assert.match(nodes(tree,node=>node.props?.role==='status')[0].props.children,/직접 복사/);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('package card stays a briefing with whole-guide copy and keyword analysis',()=>{
 let analyzed='';const tree=harness('BriefCard')({brief:writingModel(writingItem()),onAnalyze:keyword=>{analyzed=keyword;}});
 assert.ok(byText(tree,'작성안 전체 복사'));assert.ok(byText(tree,'선택 제목 복사'));
 assert.equal(nodes(tree,node=>node.type?.name==='WritingWorkbench').length,0);
 byText(tree,'검색어 분석').props.onClick();assert.equal(analyzed,'지원 공고 10');
});

test('unreviewed package cannot expose an editor or upgrade a research card to a star',()=>{
 const raw=writingItem();raw.editorial.review.passed=false;
 const brief=writingModel(raw);assert.equal(brief.writing,null);assert.equal(brief.recommended,false);
 const tree=harness('BriefCard')({brief});assert.equal(nodes(tree,node=>node.type?.name==='WritingWorkbench').length,0);
 assert.equal(nodes(tree,node=>node.props?.className==='tb-recommended-badge').length,0);
 assert.ok(byText(tree,'작성안 전체 복사'));
});


test('new writing guide is visible for research cards with honest document and SERP counts',()=>{
 unlocked=true;const raw=item(31,false);raw.documentCount=6543;raw.documentCountMeasuredAt="2026-09-28T00:00:00Z";raw.alternative={keyword:'지원 공고 31 신청 조건'};raw.writingGuide={version:1,direction:'접수 대상과 제출 서류를 먼저 비교한다.',mustInclude:['신청 대상과 제외 조건'],avoid:['자동 지급 단정'],seoTitles:['지원 공고 31 대상 및 신청 방법'],homeTitles:['"접수 전 확인" 지원 공고 31 빠뜨릴 조건'],relatedTerms:['제출 서류'],images:[{sourceId:'f1',url:'https://example.com/notice',kind:'capture',description:'지원 대상 표',captureArea:'본문 지원 대상 표의 제외 조건 행'}]};
 const html=render([raw]);for(const value of ['6,543','핵심어를 포함한 제목 1개','지원 공고 31 신청 조건','제출 서류','접수 전 확인','본문 지원 대상 표의 제외 조건 행','자동 지급 단정'])assert.ok(html.includes(value),value);assert.doesNotMatch(html,/tb-recommended-badge/);assert.match(html,/추가 확인 필요/);
});
