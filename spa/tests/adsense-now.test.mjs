// 2026-10-20 사장님 — 애드센스 벤치마킹: 플랫폼(워드프레스 먼저) 구분 · 지금 급상승 먼저 · 문서 낮고 검색량 높은 순 ·
// "지금 글을 쓰면 트래픽을 몰고 올 수 있냐"를 그래프 확인 결과로 알려 주기 · 같은 경쟁 등급 안에서만 섞기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADSENSE_PLATFORMS, cardPlatforms, filterAdsenseCards, adsenseOrderTier, adsenseNowPicks, shuffleAdsenseCards } from '../src/lib/adsenseBenchmarkModel.mjs';

const NOW = Date.parse('2026-10-20T03:00:00Z');
const measuredAt = new Date(NOW - 86400000).toISOString();
const card = (id, { sv = 1000, dc = 500, verdict = null, platforms = ['tistory'] } = {}) => ({
  id, keyword: id, recommended: false, priority: 0, category: '생활',
  sources: platforms.map((platform, i) => ({ id: `${id}-${i}`, platform, title: id })),
  metrics: { query: id, searchVolume: sv, documentCount: dc, bid: null, measuredAt },
  ...(verdict ? { demand: { verdict, label: verdict, fact: `${id} 사실`, series: [1, 2, 3] } } : {}),
});
const ids = (cards) => cards.map((c) => c.id);

test('플랫폼 탭은 워드프레스가 먼저다', () => {
  assert.deepEqual(ADSENSE_PLATFORMS.map((p) => p.key), ['wordpress', 'tistory', 'blogspot']);
});

test('카드의 플랫폼은 출처 글들의 플랫폼 모음이고, 플랫폼 거르기는 그 글이 하나라도 있으면 보인다', () => {
  const mixed = card('m', { platforms: ['tistory', 'wordpress'] });
  assert.deepEqual([...cardPlatforms(mixed)].sort(), ['tistory', 'wordpress']);
  const cards = [mixed, card('t'), card('b', { platforms: ['blogspot'] })];
  assert.deepEqual(ids(filterAdsenseCards(cards, { platform: 'wordpress', nowMs: NOW })), ['m']);
  assert.deepEqual(ids(filterAdsenseCards(cards, { platform: 'tistory', nowMs: NOW })), ['m', 't']);
  assert.deepEqual(ids(filterAdsenseCards(cards, { platform: '', nowMs: NOW })), ['m', 't', 'b']);
});

test('같은 경쟁 등급 안에서는 지금 오르는 중 · 곧 시즌이 앞 묶음이다', () => {
  const hot = card('hot', { dc: 900, verdict: 'rising' });
  const plain = card('plain', { dc: 100, verdict: 'steady' });
  const hard = card('hard', { dc: 900000, verdict: 'rising' });
  assert.ok(adsenseOrderTier(hot, NOW) < adsenseOrderTier(plain, NOW));
  assert.ok(adsenseOrderTier(plain, NOW) < adsenseOrderTier(hard, NOW), '급상승이어도 고경쟁은 저경쟁 뒤');
});

test('섞어도 묶음 순서는 지키고 묶음 안에서만 바뀐다', () => {
  const cards = [card('h1', { dc: 300, verdict: 'rising' }), card('h2', { dc: 400, verdict: 'season-soon' }), card('p1', { dc: 200 }), card('p2', { dc: 250 }), card('x', { dc: 900000 })];
  for (const seed of [1, 7, 99, 12345]) {
    const out = ids(shuffleAdsenseCards(cards, NOW, seed));
    assert.deepEqual(new Set(out.slice(0, 2)), new Set(['h1', 'h2']));
    assert.deepEqual(new Set(out.slice(2, 4)), new Set(['p1', 'p2']));
    assert.equal(out[4], 'x');
  }
});

test('지금 써야 할 키워드: 오르는 중 · 곧 시즌이면서 문서 경쟁 낮은 실측 소재만, 급상승 → 경쟁 낮은 순', () => {
  const cards = [
    card('season', { dc: 100, verdict: 'season-soon' }),
    card('rise-hard', { dc: 200000, verdict: 'rising' }),
    card('rise-b', { dc: 800, verdict: 'rising' }),
    card('rise-a', { dc: 300, verdict: 'rising' }),
    card('flat', { dc: 50, verdict: 'steady' }),
    card('small', { sv: 50, dc: 10, verdict: 'rising' }),
  ];
  assert.deepEqual(ids(adsenseNowPicks(cards, NOW, 6)), ['rise-a', 'rise-b', 'season']);
  assert.deepEqual(ids(adsenseNowPicks(cards, NOW, 1)), ['rise-a']);
});

test('새로 뜬 말도 지금 써야 할 키워드에 들고, 급상승과 같은 앞줄이다', () => {
  const cards = [card('season', { dc: 100, verdict: 'season-soon' }), card('brand-new', { dc: 900, verdict: 'new' }), card('rise', { dc: 300, verdict: 'rising' })];
  assert.deepEqual(ids(adsenseNowPicks(cards, NOW, 6)), ['rise', 'brand-new', 'season']);
  assert.ok(adsenseOrderTier(card('n', { dc: 900, verdict: 'new' }), NOW) < adsenseOrderTier(card('p', { dc: 100 }), NOW));
});

// 2026-10-20 사장님 "순서 섞기해도 안 섞이네요" — 경쟁 등급 6칸으로 나누니 맨 위 묶음이 1장뿐인 화면이 많았다(실측: 워드프레스 · 정부지원금 1/4/15).
test('섞기 묶음은 굵게 — 실측 · 문서/검색 5배 이하(0·1등급)는 한 묶음이라 섞으면 맨 위가 바뀐다', () => {
  const low = card('low', { dc: 300 });
  const mid = card('mid', { dc: 3000 });
  assert.equal(adsenseOrderTier(low, NOW), adsenseOrderTier(mid, NOW));
  const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => card(id, { dc: 200 + i * 700 }));
  const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => shuffleAdsenseCards(cards, NOW, seed)[0].id));
  assert.ok(firsts.size > 1, '시드가 바뀌면 맨 위 카드가 바뀐다');
});

// 2026-10-20 — 작성 안내 새 칸: 이 글이 해결할 문제 · 행동 키워드 제목 · 지식인 질문(링크는 지식인 주소만)
import { withGuides } from '../src/lib/homefeedGuides.mjs';
test('안내 파일의 해결 · 행동 제목 · 지식인 질문이 카드에 붙고, 지식인 밖 링크는 버린다', () => {
  const board = { candidates: [{ id: 'a', sources: [] }] };
  const store = { guides: [{ id: 'a', urls: [], guide: { direction: '방향 문장입니다', searchTargets: [], mustInclude: ['x'], mustAvoid: [], checkBefore: [], solves: ['문제 → 해결'], actionTitles: ['기초연금 모의계산 하는 법'] }, kinQuestions: [{ title: '질문1', link: 'https://kin.naver.com/qna/detail.naver?docId=1', views: 10 }, { title: '나쁜 링크', link: 'https://evil.example/x', views: 1 }] }] };
  const c = withGuides(board, store).candidates[0];
  assert.deepEqual(c.solves, ['문제 → 해결']);
  assert.deepEqual(c.actionTitles, ['기초연금 모의계산 하는 법']);
  assert.equal(JSON.stringify(c.kinQuestions), JSON.stringify([{ title: '질문1', link: 'https://kin.naver.com/qna/detail.naver?docId=1', views: 10, answers: null, askedAt: '' }]));
});

test('카드에 해결할 문제 · 지식인 질문 · 벤치마킹할 곳 · 그래프 대기 안내가 배선돼 있다', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx', import.meta.url), 'utf8');
  for (const part of ['<DemandBlock c={c} />', '<DemandPending c={c} />', '<SolveBlock c={c} />', '<KinBlock c={c} />', '<BenchmarkBlock c={c} />']) assert.ok(src.includes(part), part);
  const aids = readFileSync(new URL('../src/components/leword/adsense/AdsenseWriteAids.tsx', import.meta.url), 'utf8');
  assert.match(aids, /callWorkerRaw\('keyword-frontal', \{ keywords: query \}\)/);
});
