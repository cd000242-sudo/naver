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
