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
  // 실측 칸 — 숫자일 때만 그리고 아니면 '미측정'(지어내지 않음)
  for (const k of ['searchVolume', 'documentCount', 'bid']) assert.ok(board.includes(`typeof c.metrics?.${k} === 'number'`), k);
  assert.ok(board.includes("'미측정'"));
});

test('검색용 제목 — 회차 제목이 없으면 실측 검색어가 있을 때만 [지금 제목 만들기](앱 · 검색형 엔진)', () => {
  const board = readFileSync(new URL('../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx', import.meta.url), 'utf8');
  assert.ok(board.includes("kind: 'adsense'") && board.includes('query: c.metrics.query'), '검색형 엔진 · 대표 검색어를 넘긴다');
  assert.ok(board.includes('c.metrics?.query') && board.includes('대표 검색어가 아직 실측되지 않아'), '검색어 없으면 버튼 대신 이유');
  assert.ok(board.includes('localStorage.setItem(MADE_KEY(c.id)'));
  const bridge = readFileSync(new URL('../src/lib/bridge.ts', import.meta.url), 'utf8');
  assert.ok(bridge.includes("kind?: 'homefeed' | 'adsense'"));
});

// 사장님(2026-10-07) "벤치마킹 글을 볼 수 있어야 본보기가 된다 — 반드시". 티스토리가 사장님 IP 를 막아도 워커가 구조만 읽어 온다.
test('글 구조 보기 — 고수 글마다 워커(다른 IP)로 소제목 목차 · 글자 수 · 이미지 · 표 · 광고 자리, 개인 키는 싣지 않는다', () => {
  const board = readFileSync(new URL('../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx', import.meta.url), 'utf8');
  assert.ok(board.includes("callWorkerRaw('adsense-post-outline', { url: s.url })"), '키 없이 워커 직접(callWorkerRaw)');
  assert.ok(board.includes('글 구조 보기'));
  for (const k of ['o.chars', 'o.headings', 'o.images', 'o.tables', 'o.adSlots']) assert.ok(board.includes(k), k);
  assert.ok(!/dangerouslySetInnerHTML/.test(board), '남의 글 HTML 을 그대로 꽂지 않는다');
});
