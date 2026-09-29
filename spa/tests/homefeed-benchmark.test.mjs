import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBenchmarkBoard, benchmarkView, filterBenchmarks, metricText, safeBenchmarkUrl } from '../src/lib/homefeedBenchmarkModel.mjs';
const at = '2026-09-28T14:00:00Z';
const candidate = (more = {}) => ({ id:'a', keyword:'장기전세', title:'장기전세 만기', category:'생활경제', status:'review-now', recommended:true, priority:10, publishedAt:at, capturedAt:at, why:['독자의 현재 질문'], seoTitle:'검색 제목', homeTitle:'홈판 제목', writingDirection:'조건 비교', mustInclude:['적용 조건'], mustAvoid:['보장 표현'], sources:[{id:'s',name:'공식 안내',url:'https://example.com/a'}], ...more });
const board = (more = {}) => ({schemaVersion:1,generatedAt:at,attemptedAt:at,status:'partial',sources:[{id:'s',name:'채널',url:'https://example.com',status:'ok',postCount:2,capturedAt:at}],candidates:[candidate()],...more});
test('invalid schema and missing collection date never become a fresh success',()=>{
 assert.throws(()=>normalizeBenchmarkBoard({}),/형식/);
 assert.throws(()=>normalizeBenchmarkBoard(board({generatedAt:'bad'})),/시각/);
 assert.throws(()=>normalizeBenchmarkBoard(board({candidates:{}})),/형식/);
});
test('unknown metrics stay unknown; zero is an observed value only',()=>{
 const item=normalizeBenchmarkBoard(board()).candidates[0];
 assert.equal(metricText(item.metrics.searchVolume),'미측정');
 assert.equal(metricText(0),'0');
 assert.equal(metricText(-1),'미측정');
 assert.equal(item.eventAt,null);
});
test('links reject unsafe and embedded credential schemes',()=>{
 for(const link of ['javascript:alert(1)','data:text/html,test','https://name:pass@example.com','/redirect']) assert.equal(safeBenchmarkUrl(link),null);
 assert.equal(safeBenchmarkUrl('https://example.com/a'),'https://example.com/a');
});
test('stars require complete reviewed writing materials and current board',()=>{
 const data=normalizeBenchmarkBoard(board());
 assert.equal(benchmarkView(data,Date.parse(at)).candidates[0].recommended,true);
 for(const more of [{why:[]},{status:'verify'},{sources:[]},{writingDirection:''}]){
  assert.equal(benchmarkView(normalizeBenchmarkBoard(board({candidates:[candidate(more)]})),Date.parse(at)).candidates[0].recommended,false);
 }
 const stale=benchmarkView(data,Date.parse(at)+48*3600000);
 assert.equal(stale.stale,true); assert.equal(stale.candidates[0].recommended,false); assert.equal(stale.candidates[0].status,'stale');
 assert.equal(data.candidates[0].status,'review-now');
});
test('invalid and old candidate timestamps cannot stay write-now',()=>{
 for(const more of [{capturedAt:'bad'},{capturedAt:'2026-09-20T00:00:00Z'}]){
  const view=benchmarkView(normalizeBenchmarkBoard(board({candidates:[candidate(more)]})),Date.parse(at));
  assert.equal(view.candidates[0].status,'stale'); assert.equal(view.candidates[0].recommended,false);
 }
});
test('category status and query filters compose without mutating source order',()=>{
 const data=normalizeBenchmarkBoard(board({candidates:[candidate(),candidate({id:'b',category:'패션',status:'verify',keyword:'가을 코디'})]}));
 const items=benchmarkView(data,Date.parse(at)).candidates;
 assert.equal(filterBenchmarks(items,{category:'패션',status:'verify',query:'코디'}).length,1);
 assert.equal(filterBenchmarks(items,{category:'전체',status:'all',query:'없는 단어'}).length,0);
 assert.equal(data.candidates[0].id,'a');
});
test('source failure is retained and arbitrary claimed counts are not trusted',()=>{
 const data=normalizeBenchmarkBoard(board({sourceCount:999,collectedPostCount:999,sources:[{id:'failed',status:'failed',postCount:30,reason:'본문 확인 실패'}]}));
 assert.equal(data.sourceCount,1); assert.equal(data.collectedPostCount,0);
 assert.equal(data.sources[0].status,'failed'); assert.equal(data.sources[0].reason,'본문 확인 실패');
});
test('editorial review expiry removes star and falls back to verification even on fresh capture',()=>{
 const data=normalizeBenchmarkBoard(board({candidates:[candidate({reviewedUntil:'2026-09-28T13:00:00Z',officialSources:[{title:'공식 설명',url:'https://example.com/official'},{title:'unsafe',url:'javascript:alert(1)'}]})]}));
 const view=benchmarkView(data,Date.parse(at));
 assert.equal(view.candidates[0].recommended,false);
 assert.equal(view.candidates[0].status,'verify');
 assert.equal(view.candidates[0].officialSources.length,1);
});
