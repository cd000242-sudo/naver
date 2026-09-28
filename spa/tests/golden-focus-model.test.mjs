import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/goldenFocusModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now = Date.parse('2026-09-28T09:00:00Z');
const series = Array.from({length:14}, (_,i) => ({period:`2026-09-${String(14+i).padStart(2,'0')}`,ratio:i<7?20:30}));
const row = {keyword:'소상공인 지원금',topic:'비즈니스·경제',measuredAt:'2026-09-28T01:00:00Z',money:{value:5000},shortTermTrend:{status:'rising',ratio:1.5,measuredAt:'2026-09-28T01:00:00Z',windowEnd:'2026-09-27',series}};
test('economic focus includes explicit support and business subjects without classifying unrelated words',()=>{
 for(const keyword of ['청년 지원금','소상공인 정책자금','근로장려금','전세대출','종합소득세 환급','창업 비용']) assert.equal(model.isEconomicKeyword({keyword,topic:'생활'}),true);
 assert.equal(model.isEconomicKeyword({keyword:'환율',topic:'비즈니스·경제'}),true);
 assert.equal(model.isEconomicKeyword({keyword:'경제적인 등산화',topic:'패션'}),false);
 assert.equal(model.isEconomicKeyword({keyword:'고양이 사료',topic:'반려동물'}),false);
});
test('recent rise needs complete recent short term measurements, never legacy monthly graphs',()=>{
 assert.equal(model.recentRiseRatio(row,now),1.5);
 for(const patch of [{shortTermTrend:undefined},{measuredAt:'2026-09-07'},{measuredAt:'bad'},{measuredAt:'2026-09-29'}, {shortTermTrend:{...row.shortTermTrend,measuredAt:'2026-09-01'}},{shortTermTrend:{...row.shortTermTrend,windowEnd:'2026-09-10'}},{shortTermTrend:{...row.shortTermTrend,status:'flat'}},{shortTermTrend:{...row.shortTermTrend,ratio:null}},{shortTermTrend:{...row.shortTermTrend,ratio:Infinity}},{shortTermTrend:{...row.shortTermTrend,series:series.slice(0,6)}}]) assert.equal(model.recentRiseRatio({...row,...patch},now),null);
 assert.equal(model.recentRiseRatio({measuredAt:row.measuredAt,demandSeries:series,trendLabel:'상승세'},now),null);
});
test('malformed daily evidence cannot pass rising filter',()=>{
 for(const points of [[...series.slice(0,13),series[0]],series.map((p,i)=>i===2?{...p,ratio:-1}:p),series.map((p,i)=>i===2?{...p,period:'bad'}:p),series.map((p,i)=>i===2?{...p,ratio:NaN}:p)]) assert.equal(model.recentRiseRatio({...row,shortTermTrend:{...row.shortTermTrend,series:points}},now),null);
});
test('the short term horizon must be a completed KST day within three days and agree with the ratio',()=>{
 for(const patch of [{windowEnd:'2026-09-28'},{windowEnd:null},{windowEnd:'2026-09-24'},{measuredAt:null},{measuredAt:'2026-09-24T01:00:00Z'},{ratio:3},{series:series.map(p=>({...p,ratio:0}))},{series:series.map(p=>({...p,ratio:101}))},{series:undefined}]) assert.equal(model.recentRiseRatio({...row,shortTermTrend:{...row.shortTermTrend,...patch}},now),null);
 const differentEnd=series.map((p,i)=>({...p,period:`2026-09-${String(13+i).padStart(2,'0')}`}));
 assert.equal(model.recentRiseRatio({...row,shortTermTrend:{...row.shortTermTrend,series:differentEnd}},now),null);
 assert.equal(model.recentRiseRatio({...row,shortTermTrend:{...row.shortTermTrend,ratio:1.1}},now),null);
});
test('focus filters combine genuine trend and measured high bid',()=>{
 for(const focus of ['all','economy','rising','high-rising']) assert.equal(model.matchesGoldenFocus(row,focus,now),true);
 assert.equal(model.matchesGoldenFocus({...row,money:null},'high-rising',now),false);
 assert.equal(model.matchesGoldenFocus({...row,money:{value:2999}},'high-rising',now),false);
 assert.equal(model.matchesGoldenFocus({...row,keyword:'고양이',topic:'반려동물'},'economy',now),false);
});
test('priority is deterministic economic then fresh rising, no data mutation or randomness',()=>{
 assert.equal(model.goldenFocusPriority(row,now),0);
 assert.equal(model.goldenFocusPriority({...row,shortTermTrend:undefined},now),1);
 assert.equal(model.goldenFocusPriority({...row,keyword:'게임',topic:'게임'},now),2);
 assert.equal(model.goldenFocusPriority({keyword:'게임',topic:'게임'},now),3);
});
test('freshness dates use original measurement rather than publication and summaries expose stale rows',()=>{
 assert.equal(model.goldenMeasurementLabel(row,now),'검색결과 확인 9월 28일');
 assert.equal(model.goldenMeasurementLabel({...row,measuredAt:'2026-09-07'},now),'검색결과 확인 9월 7일 · 재확인 필요');
 assert.equal(model.goldenMeasurementLabel({measuredAt:'bad'},now),'검색결과 확인일 없음');
 assert.equal(model.goldenMeasurementLabel({measuredAt:'2026-09-29'},now),'검색결과 확인일 없음');
 assert.deepEqual(model.summarizeGoldenFocus([row,{...row,measuredAt:'2026-09-07'},{keyword:'게임',topic:'게임'}],now),{total:3,economy:2,rising:1,highRising:1,stale:2});
});
test('long term labels cannot be presented as a current rise',()=>{
 assert.equal(model.goldenTrendLabel(row,now),'최근 7일 수요 1.50배');
 assert.equal(model.goldenTrendLabel({demandSeries:series,trendLabel:'상승세'},now),'장기 추세 · 상승세');
 assert.equal(model.goldenTrendLabel({trendLabel:'상승세'},now),'최근 추세 미확인');
 assert.equal(model.goldenTrendLabel({},now),'최근 추세 미확인');
});
