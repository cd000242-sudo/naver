import test from 'node:test';
import assert from 'node:assert/strict';
import { assessGoldenEditorial, safeGoldenTitle, selectGoldenWriting, canReadGoldenWriting, selectGoldenResearch } from '../src/lib/goldenEditorialModel.mjs';
const now = Date.parse('2026-10-03T03:00:00Z');
const row = () => ({ keyword: '소상공인 정책자금', topic: '비즈니스·경제', measuredAt: '2026-10-02T01:00:00Z', searchVolume: 1200, documentCount: 350, serp:{sampledTitles:10,exactTitleHits:1},
 titles: {seo:{text:'소상공인 정책자금 신청 대상과 제출 서류 확인'}},
 brief: {timing:'NOW', builtAt:'2026-10-02T02:00:00Z', primaryIntent:'소상공인 정책자금 신청 대상인지 제출 서류를 확인하려는 독자', value:'소상공인 정책자금 신청 공고가 새로 공개되어 신청 전 대상 확인이 필요합니다.', differentiation:'신청 대상과 제외 대상을 나누고 제출 서류 체크리스트를 정리합니다.', angle:'신청 대상 확인부터 제출 서류 준비까지 순서대로 설명합니다.', experience:'직접 신청했다는 경험을 만들지 않습니다.', facts:[{id:'one',title:'소상공인 정책자금 신청 대상 및 제출 서류 안내',link:'https://www.semas.or.kr/notice/1',publishedAt:'2026-10-01T01:00:00Z'}]}});
test('fresh sourced concrete writing candidate passes without promising profits',()=>{const a=assessGoldenEditorial(row(),now);assert.equal(a.ready,true,JSON.stringify(a));assert.equal(a.sources.length,1);});
test('publication refresh cannot promote old, future, invalid dates or absent actual demand',()=>{for(const date of ['2026-09-01','2026-10-04','wrong',null])assert.equal(assessGoldenEditorial({...row(),measuredAt:date},now).ready,false);for(const volume of [null,0,NaN,-1])assert.equal(assessGoldenEditorial({...row(),searchVolume:volume},now).ready,false);});
test('source freshness, relevance, safe protocol and nonfuture dates are required',()=>{for(const patch of [{publishedAt:'2025-10-01'},{publishedAt:'2026-10-04'},{publishedAt:'wrong'},{link:'javascript:alert(1)'},{title:'호텔 뷔페 가을 할인 행사 안내'}]){const r=row();r.brief.facts=[{...r.brief.facts[0],...patch}];assert.equal(assessGoldenEditorial(r,now).ready,false);}});
test('generic, fabricated experience, ungrounded mixed entity titles are withheld',()=>{for(const title of ['소상공인 정책자금 어떤 정보가 있는지','소상공인 정책자금 직접 써본 기록','소상공인 정책자금 리드코프 승인 후기','소상공인 정책자금 무조건 받는 방법','소상공인 정책자금 이렇게 해봤어요','소상공인 정책자금 써봤어요','소상공인 정책자금 사용했어요','소상공인 정책자금 방문했어요'])assert.equal(safeGoldenTitle(row(),title),null,title);assert.equal(safeGoldenTitle(row(),row().titles.seo.text),row().titles.seo.text);});
test('navigation and title-only competitor claims do not become writing recommendations',()=>{assert.equal(assessGoldenEditorial({...row(),keyword:'소상공인 정책자금 홈페이지 바로가기'},now).ready,false);const r=row();r.brief.differentiation='상위 정면 글이 소개로 끝나는 데 반해 체크리스트로 작성합니다.';assert.equal(assessGoldenEditorial(r,now).ready,false);});
test('incomplete briefs stay incomplete and do not force-fill the recommendation count',()=>{const r=row();r.brief.angle='정리';assert.equal(assessGoldenEditorial(r,now).ready,false);assert.equal(selectGoldenWriting([r],now).length,0);assert.equal(selectGoldenWriting([row(),row()],now).length,1);});
test('license names never expand with filters or recommendation order',()=>{assert.equal(canReadGoldenWriting(row(),false,['다른 키워드']),false);assert.equal(canReadGoldenWriting(row(),false,[]),false);assert.equal(canReadGoldenWriting(row(),false,['소상공인 정책자금']),true);assert.equal(canReadGoldenWriting(row(),true,[]),true);});

test('incomplete editorial status and unmeasured or saturated competition block stars',()=>{for(const patch of [{editorialReady:false},{editorialMissing:["출처 확인"]},{documentCount:null},{documentCount:-1},{serp:null},{serp:{sampledTitles:2,exactTitleHits:0}},{serp:{sampledTitles:10,exactTitleHits:3}},{serp:{sampledTitles:10,exactTitleHits:-1}},{searchVolume:99}])assert.equal(assessGoldenEditorial({...row(),...patch},now).ready,false,JSON.stringify(patch));});

test('research preference targets 70% without deleting useful other topics or changing license grants',()=>{
 const economic=Array.from({length:25},(_,i)=>({...row(),keyword:'지원금 '+i}));
 const sports=Array.from({length:25},(_,i)=>({...row(),keyword:'스포츠 '+i,topic:'스포츠'}));
 const selected=selectGoldenResearch([...sports,...economic]);
 assert.equal(selected.length,30);assert.equal(selected.filter(r=>r.topic==='비즈니스·경제').length,21);
 assert.equal(selectGoldenResearch([...sports,...economic],'스포츠').filter(r=>r.topic==='스포츠').length,21);
 assert.equal(selectGoldenResearch([...sports,...economic.slice(0,2)]).length,27);
 assert.equal(selectGoldenResearch([row(),row()]).length,1);
 assert.equal(selected.filter(r=>canReadGoldenWriting(r,false,['지원금 1'])).length,1);
});

test('calendar overflow and malformed fact inputs never earn a recommendation',()=>{
 const r=row();r.measuredAt='2026-09-31T01:00:00Z';assert.equal(assessGoldenEditorial(r,now).ready,false);
 for(const fact of [null,{}, {...row().brief.facts[0],publishedAt:'2026-09-31T01:00:00Z'}, {...row().brief.facts[0],link:'https://user:pass@example.org/policy'}]) {const candidate=row();candidate.brief.facts=[fact];assert.equal(assessGoldenEditorial(candidate,now).ready,false);}
});
test('newer confirmed revalidation failure removes stars and surfaces a research follow-up reason',()=>{
 const r={...row(),revalidation:{status:'rejected',checkedAt:'2026-10-02T03:00:00Z',reason:'상위 글 경쟁 심화'}};
 const assessment=assessGoldenEditorial(r,now);
 assert.equal(assessment.ready,false);
 assert.ok(assessment.reasons.some(reason=>reason.includes('최근 재검증 미통과')&&reason.includes('상위 글 경쟁 심화')));
 assert.equal(selectGoldenWriting([r],now).length,0);
 assert.equal(selectGoldenResearch([r]).length,1);
 assert.equal(assessGoldenEditorial({...r,revalidation:{...r.revalidation,checkedAt:r.measuredAt}},now).ready,false);
});
test('a newer successful measurement supersedes prior rejection but invalid rejection stamps do not override evidence',()=>{
 const r={...row(),revalidation:{status:'rejected',checkedAt:'2026-10-02T03:00:00Z'}};
 assert.equal(assessGoldenEditorial({...r,measuredAt:'2026-10-02T04:00:00Z'},now).ready,true);
 for(const checkedAt of ['2026-09-31T03:00:00Z','bad','2026-10-04T03:00:00Z','2026-10-02T03:00:00',null]) assert.equal(assessGoldenEditorial({...r,revalidation:{...r.revalidation,checkedAt}},now).ready,true);
 assert.equal(assessGoldenEditorial({...r,revalidation:{...r.revalidation,status:'passed'}},now).ready,true);
});
