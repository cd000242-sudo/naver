/**
 * 애드센스 고수 벤치마크 탭(2026-10-07 사장님 "에드센스 벤치마킹은 홈판 아래에 넣어주세요").
 * 판은 앱 레포 scripts/adsense-benchmarks.cjs 가 3시간마다 /data/adsense-benchmarks.json 으로 싣는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterAdsenseCards, adsenseCategories, adsenseWritingAdvice, blogCount } from '../src/lib/adsenseBenchmarkModel.mjs';

const card = (over) => ({ id: 'x', keyword: '청년미래적금 우대형', title: '청년미래적금 2차 신청 조건', category: '금융·재테크', grade: 'S', recommended: false, priority: 10, sources: [{ id: 'a', title: 't', url: 'https://a.tistory.com/1' }], ...over });

test('거르기 — ★(3곳 이상) · 분야 · 검색어', () => {
  const cards = [card({ id: '1', recommended: true }), card({ id: '2', category: '건강·의학', keyword: '혈압약 부작용', title: '혈압약 부작용 정리' }), card({ id: '3', title: '청년도약계좌 해지' })];
  assert.deepEqual(filterAdsenseCards(cards, { mode: 'star' }).map((c) => c.id), ['1']);
  assert.deepEqual(filterAdsenseCards(cards, { category: '건강·의학' }).map((c) => c.id), ['2']);
  assert.deepEqual(filterAdsenseCards(cards, { query: '도약' }).map((c) => c.id), ['3']);
  assert.equal(filterAdsenseCards(cards, {}).length, 3);
});

test('분야 칩은 글 많은 순 · 블로그 수는 중복 없이', () => {
  const cards = [card({ category: '금융·재테크' }), card({ category: '금융·재테크' }), card({ category: '건강·의학' })];
  assert.deepEqual(adsenseCategories(cards).map((c) => `${c.category} ${c.count}`), ['금융·재테크 2', '건강·의학 1']);
  assert.equal(blogCount(card({ sources: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] })), 2);
});

test('쓰는 요령은 실측 통계에서만 — 통계가 없으면 빈 목록', () => {
  const advice = adsenseWritingAdvice({ count: 7900, lengthMedian: 36, yearPct: 20, numberPct: 50, questionPct: 15, bracketPct: 15 });
  assert.ok(advice.some((a) => a.includes('36자')));
  assert.ok(advice.some((a) => a.includes('50%')));
  assert.deepEqual(adsenseWritingAdvice({ count: 0 }), []);
  assert.deepEqual(adsenseWritingAdvice(null), []);
});

test('탭 배선 — 홈판 추천 바로 아래 · 로그인 탭 · 판 파일 · 지어낸 수치 없음', () => {
  const page = readFileSync(new URL('../src/pages/LewordPage.tsx', import.meta.url), 'utf8');
  const homefeedAt = page.indexOf("{ id: 'homefeed'");
  const adsenseAt = page.indexOf("{ id: 'adsense'");
  const picksAt = page.indexOf("{ id: 'picks'");
  assert.ok(homefeedAt > 0 && homefeedAt < adsenseAt && adsenseAt < picksAt, '홈판 추천 바로 아래');
  assert.match(page, /activeTab === 'adsense' && <AdsenseBenchmarkBoard \/>/);
  assert.match(page, /const GUEST_TABS: ReadonlySet<string> = new Set\(\['golden', 'issue'\]\);/, '맛보기 목록에 넣지 않는다');
  const board = readFileSync(new URL('../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx', import.meta.url), 'utf8');
  assert.ok(board.includes("'/data/adsense-benchmarks.json'"));
  assert.ok(!/예상\s*(수익|트래픽|유입)|확률/.test(board), '추정치 문구 금지');
});
