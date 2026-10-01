/**
 * 0명 글 부검(2026-10-01) — spa/src/lib/postAutopsy.mjs.
 * 재료는 앱이 모은 사실(최근 14일 내 글 · 조회 · 발행 시각 · 같은 기간 홈판 상위). 판정은 확인된 사실만 — 원인을 지어내지 않는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { autopsyPosts } from '../src/lib/postAutopsy.mjs';

const post = (extra = {}) => ({ title: '전지현 생로랑 파리 패션쇼 착장 공개', url: 'https://blog.naver.com/me/1', publishedOn: '2026-09-29', publishedAt: '2026-09-29T05:00:00.000Z', approxTime: false, searchable: true, blocked: false, views: 0, viewDays: 2, viewsComplete: true, ...extra });
const hf = (extra = {}) => ({ day: '2026-09-29', rank: 5, title: '쌩얼로 등장... 전지현 생로랑 공항 패션', url: 'https://blog.naver.com/b/9', publishedAt: '2026-09-29T01:00:00.000Z', ...extra });
const facts = (posts, homefeed) => ({ from: '2026-09-17', to: '2026-09-30', posts, homefeed });
const hours = (peak) => Array.from({ length: 24 }, (_, hour) => ({ hour, yesterday: 0, dayBefore: 0, monthAverage: peak.includes(hour) ? 10 : 1 }));

test('같은 소재가 그날 홈판에 있고 그 글이 1시간 넘게 먼저 나왔으면 late — 몇 시간 먼저인지 적는다', () => {
  const [row] = autopsyPosts(facts([post()], [hf()])).zero;
  assert.equal(row.verdict, 'late');
  assert.equal(row.match.rank, 5);
  assert.equal(row.match.leadMinutes, 240);
});
test('같은 소재인데 내가 먼저거나 비슷하게 썼으면 outtitled — 두 제목을 나란히 볼 수 있게 홈판 글을 붙인다', () => {
  const [row] = autopsyPosts(facts([post({ publishedAt: '2026-09-29T01:30:00.000Z' })], [hf()])).zero;
  assert.equal(row.verdict, 'outtitled');
  assert.equal(row.match.title, '쌩얼로 등장... 전지현 생로랑 공항 패션');
});
test('다음 날 홈판에 오른 같은 소재도 찾는다 · 발행 시각을 모르면 앞뒤를 말하지 않는다(outtitled, leadMinutes null)', () => {
  const [row] = autopsyPosts(facts([post({ publishedAt: null })], [hf({ day: '2026-09-30', publishedAt: null })])).zero;
  assert.equal(row.verdict, 'outtitled');
  assert.equal(row.match.leadMinutes, null);
});
test('그날 홈판 기록은 있는데 같은 소재가 없으면 no-homefeed — 그날 실제로 오른 글 3개를 참고로', () => {
  const others = [1, 2, 3, 4].map((rank) => hf({ rank, title: `손흥민 ${rank}호골 터졌다 토트넘 역전승`, url: `https://blog.naver.com/x/${rank}` }));
  const [row] = autopsyPosts(facts([post()], others)).zero;
  assert.equal(row.verdict, 'no-homefeed');
  assert.deepEqual(row.dayTop.map((r) => r.rank), [1, 2, 3]);
});
test('그날 홈판 기록 자체가 없으면 unknown · 막힌 글은 blocked 가 먼저', () => {
  assert.equal(autopsyPosts(facts([post()], [])).zero[0].verdict, 'unknown');
  assert.equal(autopsyPosts(facts([post({ blocked: true })], [hf()])).zero[0].verdict, 'blocked');
});
test('검색 허용 꺼짐 · 내 독자 시간대 밖 발행은 덧붙임 표시 — 어림 시각이면 시간대는 말하지 않는다', () => {
  const myHours = hours([20, 21, 22, 23, 12, 13]);
  const [row] = autopsyPosts(facts([post({ searchable: false })], [hf()]), { myHours }).zero; // 05:00Z = 14시 KST
  assert.deepEqual(row.flags.map((f) => f.kind), ['no-search', 'off-hours']);
  assert.equal(row.flags[1].publishedHour, 14);
  assert.deepEqual(row.flags[1].peakHours, [12, 13, 20, 21, 22, 23]);
  const inPeak = autopsyPosts(facts([post({ publishedAt: '2026-09-29T12:00:00.000Z' })], [hf()]), { myHours }).zero[0]; // 21시 KST
  assert.deepEqual(inPeak.flags, []);
  const approx = autopsyPosts(facts([post({ approxTime: true })], [hf()]), { myHours }).zero[0];
  assert.deepEqual(approx.flags, []);
});
test('부검 대상은 발행일부터 기록이 완전하고 조회 0 인 글만 — 나머지는 개수로만', () => {
  const result = autopsyPosts(facts([post(), post({ url: 'u2', views: 3 }), post({ url: 'u3', viewsComplete: false }), post({ url: 'u4', views: null, viewsComplete: false })], [hf()]));
  assert.equal(result.zero.length, 1);
  assert.deepEqual(result.summary, { posts: 4, complete: 2, zero: 1, incomplete: 2, verdicts: { late: 1 } });
});
test('발행 뒤 기록된 시간 — 마지막 기록일(KST) 끝까지 몇 시간 동안 0명이었나', () => {
  assert.equal(autopsyPosts(facts([post()], [hf()])).zero[0].hoursTracked, 34); // 09-29 14시 KST → 09-30 24시
  assert.equal(autopsyPosts(facts([post({ publishedAt: null })], [hf()])).zero[0].hoursTracked, null);
});
test('사실이 없으면 빈 결과', () => {
  assert.deepEqual(autopsyPosts(null), { zero: [], summary: { posts: 0, complete: 0, zero: 0, incomplete: 0, verdicts: {} } });
});
