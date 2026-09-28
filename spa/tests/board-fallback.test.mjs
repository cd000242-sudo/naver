import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/boardFallback.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const now = Date.parse('2026-09-28T06:00:00Z');
const board = (stamp, extra={}) => ({builtAt:stamp,briefs:[{title:'확인할 글감',editorial:{version:2}}],...extra});
const site = board('2026-09-28T01:00:00Z');
const app = board('2026-09-28T05:00:00Z');
test('서버가 실패해도 앱의 마지막 정상 결과를 선택한다',()=>{
 assert.equal(model.chooseBoard('topic-briefs',null,app,now).source,'app');
 assert.equal(model.chooseBoard('topic-briefs',site,app,now).board,app);
});
test('꺼짐·빈 결과·깨진 날짜·미래 시각·옛 앱 결과는 공개본을 지우지 않는다',()=>{
 for(const value of [null,{},board('bad'),board('2026-09-29T05:00:00Z'),board('2026-09-28T05:00:00Z',{briefs:[]}),board('2026-09-27T05:00:00Z')]){
  assert.equal(model.chooseBoard('topic-briefs',site,value,now).source,'site');
 }
});
test('회차가 있는 정상 글감도 읽고 키가 섞인 객체는 거절한다',()=>{
 const rounds=board('2026-09-28T05:00:00Z',{briefs:undefined,rounds:[{briefs:app.briefs}]});
 assert.equal(model.chooseBoard('topic-briefs',null,rounds,now).source,'app');
 assert.equal(model.chooseBoard('issue-niche',null,app,now).board,null);
});
test('이슈 이유만 남고 행이 없어도 근거가 있는 묶음은 복구한다; 48시간 만료를 지킨다',()=>{
 const issue={publishedAt:'2026-09-28T05:00:00Z',rows:[],issues:[{issue:'축제',headlines:[{title:'축제 개막'}]}]};
 assert.equal(model.chooseBoard('issue-niche',null,issue,now).source,'app');
 assert.equal(model.chooseBoard('issue-niche',null,{...issue,publishedAt:'2026-09-25T05:00:00Z'},now).board,null);
});
test('제목은 키워드별 최신 정상본으로 병합하고 빈 문자열·만료·미래 자료는 제외한다',()=>{
 const a={titles:[{keyword:'A',seo:'공개 A',at:'2026-09-28T04:00:00Z'},{keyword:'B',home:'공개 B',at:'2026-09-28T04:00:00Z'}]};
 const b={titles:[{keyword:'A',seo:'앱 A',at:'2026-09-28T05:00:00Z'},{keyword:'B',seo:'',at:'2026-09-28T05:00:00Z'},{keyword:'C',seo:'낡음',at:'2026-09-25T05:00:00Z'},{keyword:'D',seo:'미래',at:'2026-09-29T05:00:00Z'}]};
 const merged=model.mergeBriefTitles(a,b,now);
 assert.deepEqual(merged.map(x=>[x.keyword,x.seo||x.home,x.source]),[['A','앱 A','app'],['B','공개 B','site']]);
 assert.equal(a.titles[0].seo,'공개 A');
});


test('깨진 중첩 배열이 섞인 최신 앱 응답은 정상 공개본을 대체하지 않는다',()=>{
 for(const value of [board('2026-09-28T05:00:00Z',{rounds:[null]}),board('2026-09-28T05:00:00Z',{briefs:[...app.briefs,null]}),board('2026-09-28T05:00:00Z',{rounds:[{slot:{bad:true},briefs:app.briefs}]})]){
  assert.equal(model.chooseBoard('topic-briefs',site,value,now).source,'site');
 }
 const good={publishedAt:'2026-09-28T01:00:00Z',rows:[],issues:[{issue:'정상',headlines:[{title:'근거 기사'}]}]};
 for(const value of [{...good,publishedAt:'2026-09-28T05:00:00Z',issues:[...good.issues,null]},{...good,publishedAt:'2026-09-28T05:00:00Z',issues:[{issue:'깨짐',headlines:[{title:'근거'}],nextWave:'잘못된 응답'}]}]){
  assert.equal(model.chooseBoard('issue-niche',good,value,now).source,'site');
 }
});


test('최신 공개 실측은 유지하고 같은 이슈의 누락 AI 브리프만 앱에서 보강한다',()=>{
 const latest={publishedAt:'2026-09-28T05:00:00Z',rows:[{keyword:'축제 입장권',documentCount:123}],issues:[{issue:'지역 축제',why:'',headlines:[],nextWave:[],concentrated:[{keyword:'축제 입장권',searchVolume:500}]}]};
 const older={publishedAt:'2026-09-28T04:00:00Z',rows:[{keyword:'축제 입장권',documentCount:999}],issues:[{issue:'지역축제',why:'오늘 개막 보도가 나왔습니다.',headlines:[{title:'지역 축제 개막',link:'https://example.com/a'}],nextWave:[{keyword:'지역축제 입장권',reason:'관람 준비',searchVolume:10}],concentrated:[]}]};
 const selected=model.chooseBoard('issue-niche',latest,older,now);
 assert.equal(selected.source,'site');assert.equal(selected.generatedAt,latest.publishedAt);assert.equal(selected.board.rows[0].documentCount,123);
 assert.equal(selected.board.issues[0].why,older.issues[0].why);assert.equal(selected.board.issues[0].concentrated[0].searchVolume,500);
 assert.equal(selected.board.issues[0].briefSource,'app');assert.equal(selected.board.issues[0].briefGeneratedAt,older.publishedAt);assert.equal(selected.supplementedIssues,1);
 assert.equal(latest.issues[0].why,'');assert.equal(older.rows[0].documentCount,999);
});
test('기존 AI값·다른 이슈·다른 사건·만료 앱 브리프는 섞거나 덮지 않는다',()=>{
 const latest={publishedAt:'2026-09-28T05:00:00Z',rows:[],issues:[{issue:'지역 축제',why:'최신 공개 설명',headlines:[{title:'행사 취소 공지'}],nextWave:[]}]};
 const older={publishedAt:'2026-09-28T04:00:00Z',rows:[],issues:[{issue:'지역축제',why:'이전 설명',headlines:[{title:'행사 개막 예정'}],nextWave:[{keyword:'지역축제 입장권'}]}]};
 for(const app of [older,{...older,publishedAt:'2026-09-25T04:00:00Z'},{...older,issues:[{...older.issues[0],issue:'다른 축제'}]}]){
  const selected=model.chooseBoard('issue-niche',latest,app,now);assert.equal(selected.board.issues[0].why,'최신 공개 설명');assert.equal(selected.board.issues[0].nextWave.length,0);assert.equal(selected.supplementedIssues||0,0);
 }
 const matching={...older,issues:[{...older.issues[0],headlines:latest.issues[0].headlines}]};
 const selected=model.chooseBoard('issue-niche',latest,matching,now);assert.equal(selected.board.issues[0].why,'최신 공개 설명');assert.equal(selected.board.issues[0].nextWave.length,1);
});


test('공개 issues 자체가 비었어도 최신 실측의 정확한 issue 좌표로만 앱 브리프를 잇는다',()=>{
 const latest={publishedAt:'2026-09-28T05:00:00Z',rows:[{keyword:'지역축제 입장권',issue:'지역 축제',documentCount:123}],issues:[]};
 const older={publishedAt:'2026-09-28T04:00:00Z',rows:[],issues:[{issue:'지역축제',why:'개막 보도',headlines:[{title:'축제 개막'}],nextWave:[]},{issue:'다른 행사',why:'다른 소식',headlines:[{title:'다른 보도'}]}]};
 const selected=model.chooseBoard('issue-niche',latest,older,now);
 assert.equal(selected.board.issues.length,1);assert.equal(selected.board.issues[0].why,'개막 보도');assert.equal(selected.board.rows[0].documentCount,123);
 const withoutAi={...older,issues:[{...older.issues[0],why:'',nextWave:[]}]};
 assert.equal(model.chooseBoard('issue-niche',latest,withoutAi,now).board.issues.length,0);
});


test('더 최근 앱 실측뿐이고 AI 브리프가 없으면 정상 공개 브리프를 밀어내지 않는다',()=>{
 const publicBoard={publishedAt:'2026-09-28T04:00:00Z',rows:[],issues:[{issue:'지역축제',why:'공개 설명',headlines:[{title:'축제 개막'}]}]};
 const newerApp={publishedAt:'2026-09-28T05:00:00Z',rows:[{keyword:'지역축제',issue:'지역축제'}],issues:[]};
 const selected=model.chooseBoard('issue-niche',publicBoard,newerApp,now);
 assert.equal(selected.source,'site');assert.equal(selected.board.issues[0].why,'공개 설명');
});
