import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const asModule = (name) => {
 let code = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions:{ module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2020 } }).outputText;
 code = code.replace(/from '(\.\/[^']+)'/g, (_,path) => `from '${asModule(path.slice(2))}'`);
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
};
const model = await import(asModule('goldenDailyModel'));
const now = Date.parse('2026-10-03T03:00:00Z');
const row = {keyword:'고양이 보험 청구',topic:'반려동물',searchVolume:2400,documentCount:500,measuredAt:'2026-10-02T16:00:00Z',evidence:[],serp:{sampledTitles:10,exactTitleHits:3,adCount:4}};
const status = (patch, time=now) => model.goldenDailyStatus({...row,...patch},time).view;
test('today uses original KST measurement date and recent is exclusive of today',()=>{
 assert.equal(status({}),'today');
 assert.equal(status({measuredAt:'2026-10-02T14:59:59Z'}),'recent');
 assert.equal(status({measuredAt:'2026-09-26T03:00:00Z'}),'recent');
 assert.equal(status({measuredAt:'2026-09-26T02:59:59Z'}),'archive');
 assert.equal(status({measuredAt:'2026-09-01T00:00:00Z',publishedAt:new Date(now).toISOString()}),'archive');
});
test('future, missing and invalid measurements never become current',()=>{
 for(const measuredAt of [null,undefined,'garbage','2026-10-04T00:00:00Z','2026-02-30T00:00:00Z','2026-10-03T10:00:00']) assert.equal(status({measuredAt}),'archive');
 assert.equal(status({},NaN),'archive');
 assert.equal(status({serp:{...row.serp,measuredAt:'2026-09-01T00:00:00Z'}}),'archive');
 assert.equal(status({serp:{...row.serp,measuredAt:'invalid'}}),'archive');
 assert.equal(status({serp:{...row.serp,measuredAt:'2026-10-02T14:59:59Z'}}),'recent');
});
test('requires finite exact demand and document numbers and a golden ratio',()=>{
 for(const patch of [{searchVolume:null},{searchVolume:Infinity},{searchVolume:0},{documentCount:null},{documentCount:NaN},{documentCount:0},{documentCount:-1},{searchVolume:999},{searchVolumeLt10:true}]) assert.equal(status(patch),'archive');
 assert.equal(status({searchVolume:1000}),'today');
});
test('requires usable SERP competition measurements, not just a stored tier or optimistic verdict',()=>{
 for(const serp of [undefined,{sampledTitles:0,exactTitleHits:0},{sampledTitles:2,exactTitleHits:0},{sampledTitles:10,exactTitleHits:8},{sampledTitles:10,exactTitleHits:-1},{sampledTitles:10,exactTitleHits:11},{sampledTitles:10,exactTitleHits:NaN},{...row.serp,verdict:'LOCKED'},{...row.serp,verdict:'NO_DATA'}]) assert.equal(status({serp}),'archive');
 assert.equal(status({frontalSaturated:true}),'archive');
 assert.equal(status({serp:{...row.serp,exactTitleHits:6,slots:[{rank:1,title:'측정된 빈자리',coverage:0.3}]}}),'today');
});
test('future season and outdated recurring season remain in archive',()=>{
 for(const timingGroup of ['준비 시기','성수기 지남']) assert.equal(status({timingGroup}),'archive');
 assert.equal(status({timingGroup:'지금 적기',peakRecurring:true,peakMonth:3,monthsToPeak:0}),'archive');
 assert.equal(status({timingGroup:'지금 적기',peakRecurring:true,peakMonth:10,monthsToPeak:5}),'today');
 assert.equal(status({timingGroup:'연중 상시',trendLabel:'에버그린'}),'today');
 assert.equal(status({timingGroup:'',trendLabel:'판정불가'}),'today');
 assert.doesNotMatch(model.goldenDailyStatus(row,now).reason,/상승|급상승|노출 보장/);
});
test('counts are mutually exclusive and selecting keeps originals without changing input order',()=>{
 const recent={...row,keyword:'지난 확인',measuredAt:'2026-10-01T02:00:00Z'};
 const stale={...row,keyword:'오래된 확인',measuredAt:'2026-09-01T02:00:00Z'};
 const rows=Object.freeze([Object.freeze(stale),Object.freeze(row),Object.freeze(recent)]);
 assert.deepEqual(model.summarizeGoldenDaily(rows,now),{today:1,recent:1,archive:1});
 assert.deepEqual(model.selectGoldenDailyRows(rows,'today',now),[row]);
 assert.deepEqual(model.selectGoldenDailyRows(rows,'recent',now),[recent]);
 assert.deepEqual(model.selectGoldenDailyRows(rows,'archive',now),[stale]);
 assert.equal(model.selectGoldenDailyRows(rows,'today',now)[0],row);
});
test('ranking favors verified rise, current season and measured advertising without economic topic bias',()=>{
 const series=Array.from({length:14},(_,i)=>({period:new Date(Date.parse('2026-09-19')+i*86400000).toISOString().slice(0,10),ratio:i<7?20:40}));
 const rising={...row,keyword:'상승',shortTermTrend:{status:'rising',ratio:2,measuredAt:row.measuredAt,windowEnd:'2026-10-02',series}};
 const seasonal={...row,keyword:'시즌',timingGroup:'지금 적기',peakRecurring:true,peakMonth:10};
 const paid={...row,keyword:'광고',money:{value:5000}};
 const economy={...row,keyword:'경제',topic:'비즈니스·경제'};
 const rows=[economy,paid,seasonal,rising];
 assert.deepEqual(model.selectGoldenDailyRows(rows,'today',now).map(r=>r.keyword),['상승','시즌','광고','경제']);
 assert.deepEqual(model.selectGoldenDailyRows([...rows].reverse(),'today',now).map(r=>r.keyword),['상승','시즌','광고','경제']);
});
test('independent monthly-demand and document timestamps cannot be refreshed by the row date',()=>{
 for(const field of ['searchVolumeMeasuredAt','documentCountMeasuredAt']) {
  assert.equal(status({[field]:'2026-09-01T00:00:00Z'}),'archive');
  assert.equal(status({[field]:'2026-10-02T14:59:59Z'}),'recent');
  assert.equal(status({[field]:row.measuredAt}),'today');
  for(const value of [null,'invalid','2026-10-04T00:00:00Z']) assert.equal(status({[field]:value}),'archive');
 }
});
test('a newer explicit rejection excludes old successful metrics while a newer success supersedes rejection',()=>{
 const rejection={status:'rejected',checkedAt:'2026-10-03T01:00:00Z',reason:'검색 상위 글 경쟁 심화'};
 assert.equal(status({revalidation:rejection}),'archive');
 assert.match(model.goldenDailyStatus({...row,revalidation:rejection},now).reason,/검색 상위 글 경쟁 심화/);
 assert.equal(status({revalidation:{...rejection,checkedAt:row.measuredAt}}),'archive');
 assert.equal(status({revalidation:{...rejection,checkedAt:'2026-10-02T15:59:59Z'}}),'today');
 assert.equal(status({measuredAt:'2026-10-03T02:00:00Z',revalidation:rejection}),'today');
 for(const patch of [{status:'passed'},{checkedAt:'bad'},{checkedAt:'2026-10-04T00:00:00Z'}]) assert.equal(status({revalidation:{...rejection,...patch}}),'today');
});
test('public checked-at helper returns oldest actual evidence timestamp for honest UI labels',()=>{
 assert.equal(model.goldenDailyCheckedAt(row,now),Date.parse(row.measuredAt));
 assert.equal(model.goldenDailyCheckedAt({...row,searchVolumeMeasuredAt:'2026-10-01T00:00:00Z',serp:{...row.serp,measuredAt:'2026-10-02T00:00:00Z'}},now),Date.parse('2026-10-01T00:00:00Z'));
 assert.equal(model.goldenDailyCheckedAt({...row,documentCountMeasuredAt:null},now),null);
});

// 2026-10-06 사장님 "선점보드가 불완전한 것 같은데" — 회차가 없는 날 기본 보기 '오늘 확인'이 0행이라 판이 빈 것처럼 보였다.
// 오늘 확인분이 없으면 최근 7일, 그것도 없으면 전체 보관을 연다. 버튼과 개수는 그대로라 무엇을 보는지는 화면에 드러난다.
test('기본 보기는 비어 있지 않은 첫 보기 — 오늘 → 최근 7일 → 전체 보관', () => {
 assert.equal(model.defaultGoldenDailyView({today:15,recent:15,archive:165}),'today');
 assert.equal(model.defaultGoldenDailyView({today:0,recent:30,archive:165}),'recent');
 assert.equal(model.defaultGoldenDailyView({today:0,recent:0,archive:195}),'all');
});
