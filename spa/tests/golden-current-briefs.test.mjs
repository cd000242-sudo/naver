import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const normalizer = dataUrl(compile('../src/lib/topicBriefsModel.ts'));
const adapter = compile('../src/lib/goldenCurrentBriefs.ts').replace("'./topicBriefsModel'", JSON.stringify(normalizer));
const {currentGoldenBriefRows} = await import(dataUrl(adapter));
const now = Date.now(), at = new Date(now-3600000).toISOString();
const brief = (overrides={}) => ({ coreKeyword:'청년 창업 지원', field:'지원금·복지', primaryIntent:'창업 지원을 신청할 수 있는 조건은 무엇인가요?',
  facts:[{id:'a',title:'청년 창업 지원 공고',link:'https://example.com/grant',publishedAt:at,snippet:'청년 창업 지원 대상과 신청 방법을 공고합니다.'}],
  searchVolume:800, documentCount:400,documentCountMeasuredAt:at,serpFacing:1,
  searchVolumeEvidence:{source:'naver-searchad',keyword:'청년 창업 지원',measuredAt:at,pc:200,mobile:600,pcUnder10:false,mobileUnder10:false,totalMin:800,totalMax:800,status:'exact'}, ...overrides });
test('retains exact query metrics, never substitutes round timestamp for unmeasured SERP',()=>{
 const [row]=currentGoldenBriefRows({builtAt:at,briefs:[brief()]},now);
 assert.equal(row.searchVolume,800);assert.equal(row.documentCount,400);assert.equal(row.measuredAt,null);assert.equal(row.serp,undefined);assert.equal(row.editorialReady,false);
});
test('rejects mismatched metric queries and invalid dates, preserves newer round over older duplicate',()=>{
 const [row]=currentGoldenBriefRows({builtAt:at,briefs:[brief({searchVolumeEvidence:{...brief().searchVolumeEvidence,keyword:'다른 지원금'}})],rounds:[{builtAt:new Date(now-86400000).toISOString(),briefs:[brief()]}]},now);
 assert.equal(row.searchVolume,null);assert.equal(currentGoldenBriefRows({builtAt:new Date(now+86400000).toISOString(),briefs:[brief()]},now).length,0);
 assert.equal(currentGoldenBriefRows({builtAt:at,briefs:[brief({facts:[{...brief().facts[0],publishedAt:new Date(now-8*86400000).toISOString()}]})]},now).length,0);
});
test('uses actual dated sample only; missing editorial approval remains in research',()=>{
 const [row]=currentGoldenBriefRows({builtAt:at,briefs:[brief({serpMeasuredAt:at,serpSampled:10})]},now);
 assert.equal(row.measuredAt,at);assert.equal(row.serp.sampledTitles,10);assert.equal(row.editorialReady,false);
 const [bad]=currentGoldenBriefRows({builtAt:at,briefs:[brief({serpMeasuredAt:at,serpSampled:0})]},now);assert.equal(bad.measuredAt,null);
});
