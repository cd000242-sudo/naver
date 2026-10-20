// 2026-10-20 사장님 "시즌키워드도 오늘의 글감도 마찬가지" — 검색어 덧붙이기(앱 레포 keyword-enrich.cjs → /data/keyword-enrich.json)를 두 판이 검색어로 찾아 붙인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKeywordEnrich, isHotEnrich, seasonalOrderTier } from '../src/lib/keywordEnrich.mjs';

const store = { entries: {
  '연말정산 간소화': {
    demand: { verdict: 'rising', label: '지금 오르는 중', fact: '최근 4주 …', series: [1, 2, 3], recentChangePct: 40, lastYearNextPct: null, asOf: '2026-10-12' },
    measure: { searchVolume: 2110, documentCount: 139889 },
    kinQuestions: [{ title: '정보동의', link: 'https://kin.naver.com/qna/detail.naver?docId=1', views: 653 }, { title: '나쁜', link: 'https://evil.example/x' }],
    solves: ['문제 → 해결'], actionTitles: ['연말정산 간소화 자료 조회, 부양가족 동의 안 될 때'],
  },
  '빈 칸': {},
} };

test('검색어로 찾고, 띄어쓰기가 달라도 같은 검색어로 본다 · 지식인 밖 링크는 버린다', () => {
  const map = parseKeywordEnrich(store);
  const e = map.get('연말정산간소화');
  assert.equal(e.demand.verdict, 'rising');
  assert.equal(e.measure.searchVolume, 2110);
  assert.equal(e.kinQuestions.length, 1);
  assert.deepEqual(e.actionTitles, ['연말정산 간소화 자료 조회, 부양가족 동의 안 될 때']);
  assert.equal(parseKeywordEnrich(null).size, 0);
  assert.equal(parseKeywordEnrich({ entries: 'x' }).size, 0);
});

test('지금 뜨는(새로 뜬 · 오르는 · 곧 시즌) 검색어인지', () => {
  assert.equal(isHotEnrich({ demand: { verdict: 'season-soon' } }), true);
  assert.equal(isHotEnrich({ demand: { verdict: 'steady' } }), false);
  assert.equal(isHotEnrich(undefined), false);
});

test('시즌 순서 묶음 — 지금 뜨는 소재 → 이번 달 · 다음 달 → 나머지', () => {
  const hot = { demand: { verdict: 'rising' } };
  assert.ok(seasonalOrderTier(hot, false) < seasonalOrderTier(undefined, true));
  assert.ok(seasonalOrderTier(undefined, true) < seasonalOrderTier(undefined, false));
  assert.ok(seasonalOrderTier(hot, true) < seasonalOrderTier(hot, false));
});

test('시즌 · 글감 화면에 덧붙이기가 배선돼 있다', () => {
  const seasonal = readFileSync(new URL('../src/components/leword/seasonal/SeasonalKeywordsBoard.tsx', import.meta.url), 'utf8');
  assert.match(seasonal, /<KeywordAids /);
  assert.match(seasonal, /shuffleWithinTiers\(/);
  assert.match(seasonal, /순서 섞기/);
  const briefs = readFileSync(new URL('../src/components/leword/TopicBriefsBoard.tsx', import.meta.url), 'utf8');
  assert.match(briefs, /<KeywordAids /);
  assert.match(briefs, /isHotEnrich\(/);
});

// 2026-10-20 사장님 "실시간검색어 틈새키워드도 마찬가지로" — 카드에 이미 있는 30일 추세 · 지식인은 겹치지 않게 빼고 붙인다.
test('틈새 카드에 판정 문장 · 해결할 문제 · 행동 제목 · 벤치마킹이 붙고, 지금 뜨는 키워드 먼저 섞는다', () => {
  const tab = readFileSync(new URL('../src/components/leword/IssueNicheTab.tsx', import.meta.url), 'utf8');
  assert.match(tab, /<KeywordAids query=\{row\.keyword\} enrich=\{enrichOf\(row\.keyword\)\} variant="issue" \/>/);
  assert.match(tab, /shuffleWithinTiers\(/);
  assert.match(tab, /순서 섞기/);
  const aids = readFileSync(new URL('../src/components/leword/shared/KeywordAids.tsx', import.meta.url), 'utf8');
  assert.match(aids, /variant === 'issue'/);
});

// 2026-10-21 사장님 "리더남 황금키워드에도 마찬가지" — 큰 순서(등급 → 입찰가 구간)는 지키고, 그 안에서 지금 뜨는 키워드 먼저 · 카드에 덧붙이기.
test('황금 카드에 판정 문장 · 해결할 문제 · 행동 제목 · 벤치마킹이 붙고, 등급 · 입찰가 다음 순서로 지금 뜨는 키워드가 앞선다', () => {
  const tab = readFileSync(new URL('../src/components/leword/GoldenTab.tsx', import.meta.url), 'utf8');
  assert.match(tab, /<KeywordAids query=\{row\.keyword\} enrich=\{enrichOf\(row\.keyword\)\} variant="issue" \/>/);
  const money = tab.indexOf('if (ma !== null && mb !== null && ma !== mb) return ma - mb;');
  const hot = tab.indexOf('isHotEnrich(enrichOf(a.keyword))');
  const slope = tab.indexOf('const sa = slope(a);');
  assert.ok(money > 0 && hot > money && slope > hot, '등급 → 입찰가 → 지금 뜨는 → 오름세 순');
});
