/**
 * 홈판 흐름 요약(2026-10-06) — 사장님 "홈판에 뜬 것들과 고수 블로거들을 어떻게 썼고 우리는 어떻게 써야 하는지 ·
 * 오늘의 자주 뜨는 홈판 주제는 없네?". 수집기(앱 레포 homefeed-benchmarks-trends.cjs)가 판에 trends 를 싣고 화면이 그린다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeBenchmarkBoard, normalizeTrends } from '../src/lib/homefeedBenchmarkModel.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const trends = {
  windowHours: 24, from: '2026-10-05T09:00:00.000Z', to: '2026-10-06T09:00:00.000Z', posts: 857, channels: 160,
  categories: [{ category: '문화·연예', posts: 104, channels: 42, stories: [{ keyword: '나는솔로 14기', title: '나는솔로 그후', category: '문화·연예', channels: 5, homeTitle: '' }], examples: [{ title: '"몰랐다" 조세호 복귀', name: '블로그a', url: 'https://blog.naver.com/a/1' }] }],
  topStories: [{ keyword: '나는솔로 14기', title: '나는솔로 그후', category: '문화·연예', channels: 5, homeTitle: '이거 보고 다시 봤다' }],
  writing: { basis: 'naver-blog', stats: { count: 830, length: { median: 40, p25: 34, p75: 47 }, quoteStart: 39, ellipsis: 27, question: 27, exclaim: 10, number: 58, colloquial: 4 }, guide: ['길이는 34~47자 안에서'] },
};

test('trends 를 검사해 그대로 싣는다 — 위험한 주소는 버린다', () => {
  const clean = normalizeTrends({ ...trends, categories: [{ ...trends.categories[0], examples: [{ title: 'x', name: 'y', url: 'javascript:alert(1)' }] }] });
  assert.equal(clean.posts, 857);
  assert.equal(clean.categories[0].channels, 42);
  assert.equal(clean.categories[0].examples[0].url, null);
  assert.equal(clean.writing.stats.length.median, 40);
  assert.deepEqual(clean.writing.guide, ['길이는 34~47자 안에서']);
  assert.equal(normalizeTrends(null), null);
  assert.equal(normalizeTrends({ categories: 'x' }), null);
});

test('판 정리(normalizeBenchmarkBoard)가 trends 를 버리지 않는다', () => {
  const board = normalizeBenchmarkBoard({ schemaVersion: 1, generatedAt: '2026-10-06T09:00:00.000Z', sources: [], candidates: [], trends });
  assert.equal(board.trends?.channels, 160);
  const old = normalizeBenchmarkBoard({ schemaVersion: 1, generatedAt: '2026-10-06T09:00:00.000Z', sources: [], candidates: [] });
  assert.equal(old.trends, null, 'trends 없는 옛 판도 그대로 읽힌다');
});

test('보드 맨 위에 흐름 판이 붙고, 분야를 누르면 카드가 그 분야로 걸러진다', () => {
  const board = read('../src/components/leword/homefeed/HomefeedBenchmarkBoard.tsx');
  assert.match(board, /<HomefeedTrendsPanel/);
  assert.match(board, /onPickCategory=\{\(name\)=>\{ ?setCategory\(name\)/);
  const panel = read('../src/components/leword/homefeed/HomefeedTrendsPanel.tsx');
  assert.match(panel, /오늘 자주 뜨는 홈판 주제/);
  assert.match(panel, /고수 블로거/);
  assert.match(panel, /우리는 이렇게/);
  // 추정치 금지 — 확률 · 예상 문구를 쓰지 않는다.
  assert.doesNotMatch(panel, /확률|예상 (조회|트래픽|수익)/);
});

/*
 * 2026-10-06 사장님 "홈판은 사이트에 300개 초과해서는 안 보여 주네요?" — 출처 786곳을 모아도 화면 모델이 출처를 300곳,
 * 카드를 300장에서 잘랐다(추천 791장 중 491장 버림, 실측). 판 생성기(앱 레포 core.cjs) · 실시간 계산(homefeedLive.mjs)과 같은 1,000.
 */
test('홈판 화면 모델은 출처 · 카드를 300에서 자르지 않는다 — 상한 1,000', () => {
  const source = (i) => ({ id: `s${i}`, name: `블로그${i}`, platform: 'naver-blog', url: `https://blog.naver.com/b${i}`, status: 'ok', postCount: 1 });
  const card = (i) => ({ id: `c${i}`, keyword: `소재${i}`, title: `제목${i}`, category: '문화·연예', status: 'verify', recommended: true, sources: [] });
  const board = normalizeBenchmarkBoard({ schemaVersion: 1, generatedAt: '2026-10-06T00:00:00.000Z', status: 'fresh', sources: Array.from({ length: 1100 }, (_, i) => source(i)), candidates: Array.from({ length: 1100 }, (_, i) => card(i)) });
  assert.equal(board.sources.length, 1000);
  assert.equal(board.candidates.length, 1000);
  assert.match(read('../src/lib/homefeedLive.mjs'), /const MAX_CARDS = 1000;/);
});

/*
 * 2026-10-06 사장님 "벤치마크 자료가 엄청 오래 걸리네" — 실측: 실시간 수집이 14초 · 22MB(출처 781곳 20묶음)인데
 * 화면이 그걸 다 받은 뒤에야 처음 그렸다. 정기 판(2MB)을 먼저 그리고 실시간은 뒤에서 바꿔 끼운다.
 * 묶음 수는 정기 판의 출처 수로 미리 알 수 있어 20묶음을 처음부터 동시에 부른다(첫 묶음 7초 대기 없앰).
 */
test('홈판 벤치마크는 정기 판을 먼저 그리고 실시간 판은 뒤에서 바꿔 끼운다', () => {
  const board = read('../src/components/leword/homefeed/HomefeedBenchmarkBoard.tsx');
  assert.doesNotMatch(board, /Promise\.all\(\[\s*fetch\('\/data\/homefeed-benchmarks\.json'/);
  const firstPaint = board.indexOf('setData(normalizeBenchmarkBoard(raw))');
  const liveCall = board.indexOf('fetchLiveFeeds(');
  assert.ok(firstPaint > 0 && liveCall > firstPaint, '정기 판을 그린 뒤에 실시간을 부른다');
  assert.match(board, /livePending/);
  const live = read('../src/lib/homefeedLiveFetch.ts');
  assert.match(live, /export async function fetchLiveFeeds\(expectedBatches = 0\)/);
});
