/**
 * 곧 뜰 숏텐츠 후보 — 앱이 10분마다 올리는 /data/shortents-upcoming.json 읽기.
 * 모양 검증 · 나쁜 URL 버리기 · 신선도(30분) · 순서 보존 · 적중 장부.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShortentsUpcoming, loadShortentsUpcoming, upcomingFreshness, UPCOMING_STALE_MINUTES } from '../src/lib/shortentsUpcoming.mjs';

const cand = (over) => ({
  keyword: '미국 이란 공격 준비', sources: ['signal.bz'], articles90: 14, recent20: 4, press: 13,
  firstArticleAt: '2026-10-29T21:00:00.000Z', exclusive: false, capped: false,
  samples: [{ title: '트럼프 작전 부활', press: 'news.example.com', publishedAt: '2026-10-29T22:30:00.000Z', link: 'https://n.news.naver.com/a/1' }],
  ...over,
});
const file = (candidates, hitRate) => ({
  schemaVersion: 1, builtAt: '2026-10-29T22:40:00.000Z', source: 'realtime-keywords-news-sample',
  rule: { windowMin: 90, recentMin: 20, minArticles: 3, minPress: 2 }, measured: 23, candidates,
  hitRate: hitRate ?? { days: 7, flagged: 10, matched: 3, avgLeadMin: 42, recent: [{ keyword: 'a', hitKeyword: 'a 결혼', hitAt: '2026-10-29T22:00:00+09:00', leadMin: 40 }] },
});

test('정상 파일 — 칸과 순서를 그대로 읽는다', () => {
  const r = parseShortentsUpcoming(file([cand(), cand({ keyword: '북 방사포', press: 7 })]));
  assert.deepEqual(r.candidates.map((c) => c.keyword), ['미국 이란 공격 준비', '북 방사포']);
  assert.equal(r.candidates[0].press, 13);
  assert.equal(r.candidates[0].samples[0].link, 'https://n.news.naver.com/a/1');
  assert.equal(r.measured, 23);
  assert.equal(r.rule.windowMin, 90);
  assert.deepEqual(r.hitRate, { days: 7, flagged: 10, matched: 3, avgLeadMin: 42, recent: [{ keyword: 'a', hitKeyword: 'a 결혼', hitAt: '2026-10-29T22:00:00+09:00', leadMin: 40 }] });
});

test('키워드 없는 후보 · 숫자가 아닌 칸은 버리거나 null', () => {
  const r = parseShortentsUpcoming(file([cand({ keyword: '' }), cand({ press: 'x', articles90: -1 })]));
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].press, null);
  assert.equal(r.candidates[0].articles90, null);
});

test('기사 링크는 http(s) 만 살린다', () => {
  const r = parseShortentsUpcoming(file([cand({ samples: [{ title: 't', link: 'javascript:alert(1)' }, { title: 'u', link: 'https://www.yna.co.kr/x' }] })]));
  assert.deepEqual(r.candidates[0].samples.map((s) => s.link), [null, 'https://www.yna.co.kr/x']);
});

test('깨진 파일 · 없는 파일은 빈 결과', async () => {
  assert.deepEqual(parseShortentsUpcoming(null).candidates, []);
  assert.deepEqual(parseShortentsUpcoming({ candidates: 'x' }).candidates, []);
  const r = await loadShortentsUpcoming(async () => ({ ok: false }));
  assert.equal(r.builtAt, null);
  assert.equal(r.hitRate, null);
});

test('적중 장부가 없거나 깨졌으면 null', () => {
  assert.equal(parseShortentsUpcoming({ ...file([cand()]), hitRate: 'x' }).hitRate, null);
});

test('신선도 — 30분 넘으면 앱이 꺼져 있었다고 본다', () => {
  const built = '2026-10-29T22:40:00.000Z';
  assert.equal(UPCOMING_STALE_MINUTES, 30);
  assert.deepEqual(upcomingFreshness(built, Date.parse(built) + 10 * 60000), { minutes: 10, stale: false });
  assert.deepEqual(upcomingFreshness(built, Date.parse(built) + 31 * 60000), { minutes: 31, stale: true });
  assert.deepEqual(upcomingFreshness(null), { minutes: null, stale: true });
});
