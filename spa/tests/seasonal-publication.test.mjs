import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeasonalBoard } from '../scripts/build-seasonal-keywords.mjs';

const topic = (extra = {}) => ({month: 1, category: '세금·경제', type: '정기', keyword: '연말정산', angle: '공제 조건과 증빙', prep: '시즌 전 준비', money: true, sourceTitle: '국세청', sourceUrl: 'https://www.nts.go.kr/', sourceStatus: '발행 전 확인', ...extra});
const research = (extra = {}) => ({reviewedAt:'2026-10-16T00:00:00.000Z',originalTopics:1,topics:[topic()],collections:[{seed:'연말정산',observedAt:'2026-10-15T22:00:00.000Z',url:'https://mac.search.naver.com/mobile/ac?q=1',suggestions:['연말정산', '연말 정산', '2025 연말정산', '2026 연말정산', '<img src=x>', '연말정산\n환급']}],notes:['편집 기획월'],...extra});
test('원문과 보완 주제를 분리하고 오래된 연도·중복·마크업은 공개하지 않는다',()=>{
 const board=buildSeasonalBoard(research());
 assert.equal(board.version,1);assert.equal(board.audit.originalTopics,1);assert.equal(board.audit.addedTopics,0);
 assert.deepEqual(board.topics[0].suggestions,['연말정산','2026 연말정산']);
 assert.equal(board.audit.excludedSuggestions,4);assert.equal(board.stats.autocompleteUnique,2);
 assert.equal(board.topics[0].observedAt,'2026-10-15T22:00:00.000Z');
 assert.equal(board.stats.moneyTopics,1);assert.equal(board.topics[0].searchVolume,undefined);
});
test('같은 달·같은 검색어는 거절하고 다른 달의 의도는 보존한다',()=>{
 assert.throws(()=>buildSeasonalBoard(research({topics:[topic(),topic()]})),/중복/);
 const board=buildSeasonalBoard(research({topics:[topic(),topic({month:2,angle:'환급금 확인'})]}));
 assert.equal(board.topics.length,2);assert.equal(new Set(board.topics.map(t=>t.id)).size,2);
 assert.equal(board.audit.addedTopics,1);
});
test('유효한 월·출처·날짜·텍스트만 발행한다',()=>{
 for(const extra of [{month:0},{month:13},{sourceUrl:'javascript:alert(1)'},{keyword:''},{angle:'<script>'},{money:'yes'}]) assert.throws(()=>buildSeasonalBoard(research({topics:[topic(extra)]})));
 assert.throws(()=>buildSeasonalBoard(research({reviewedAt:'bad'})));
 assert.throws(()=>buildSeasonalBoard(research({originalTopics:3})),/기존/);
 assert.throws(()=>buildSeasonalBoard(research({topics:[]})));
});
test('조회 실패와 미반환을 검색량 0으로 만들지 않는다',()=>{
 const board=buildSeasonalBoard(research({collections:[]}));
 assert.deepEqual(board.topics[0].suggestions,[]);assert.equal(board.topics[0].observedAt,null);
 assert.equal(board.stats.autocompleteUnique,0);assert.ok(!('searchVolume' in board.topics[0]));
});
test('입력을 변형하지 않고 결과 식별자가 안정적이다',()=>{
 const source=research();const before=JSON.stringify(source);const a=buildSeasonalBoard(source);const b=buildSeasonalBoard(source);
 assert.deepEqual(a,b);assert.equal(JSON.stringify(source),before);
});
test('공개 보드는 검토 원본에서 재현되고 12개월을 빠짐없이 제공한다',()=>{
 const source=JSON.parse(readFileSync(new URL('../data/seasonal-keyword-research.json',import.meta.url),'utf8'));
 const published=JSON.parse(readFileSync(new URL('../public/data/seasonal-keywords.json',import.meta.url),'utf8'));
 assert.deepEqual(buildSeasonalBoard(source),published);
 assert.deepEqual([...new Set(published.topics.map(row=>row.month))].sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i+1));
 assert.ok(published.topics.every(row=>!('searchVolume' in row)&&!('revenue' in row)));
});
test('시즌 탭은 벤치마크 다음에 있고 기존 이용권 잠금과 분석 연결을 유지한다',()=>{
 const page=readFileSync(new URL('../src/pages/LewordPage.tsx',import.meta.url),'utf8');
 const ids=[...page.matchAll(/\{ id: '([^']+)', label:/g)].map(match=>match[1]);
 assert.equal(ids[ids.indexOf('adsense')+1],'seasonal');
 assert.match(page,/!lockedTab && activeTab === 'seasonal' && <SeasonalKeywordsBoard onAnalyze=\{sendToAnalyze\}/);
 assert.match(page,/const GUEST_TABS: ReadonlySet<string> = new Set\(\['golden', 'issue'\]\)/);
});
