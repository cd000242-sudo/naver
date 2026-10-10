/**
 * 1시간마다 섞기(2026-10-10 사장님 "홈판 · 애드센스 벤치마킹은 워낙 많아서 상위만 본다 — 1시간 주기로 섞고, 수동으로 섞는 버튼" · "오늘의 글감도").
 * 같은 시간대엔 모든 방문자 · 새로고침에 같은 순서, 정시(KST)마다 새 순서. 묶음(★ · 증거 등) 순서는 지키고 묶음 안에서만 섞는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kstHour, msToNextHour, shuffleSeed, shuffleWithinTiers } from '../src/lib/hourlyShuffle.mjs';

const items = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, tier: i < 10 ? 0 : i < 25 ? 1 : 2 }));
const order = (list) => list.map((x) => x.id).join(',');

test('같은 시드 = 같은 순서, 다른 시간대 · 수동 섞기 = 다른 순서 · 원본은 그대로 · 빠진 항목 없음', () => {
  const at = Date.parse('2026-10-10T03:10:00Z');
  const a = shuffleWithinTiers(items, (x) => x.tier, shuffleSeed(kstHour(at), 0));
  const b = shuffleWithinTiers(items, (x) => x.tier, shuffleSeed(kstHour(at + 40 * 60000), 0));
  assert.equal(order(a), order(b), '같은 시간대(12:10 · 12:50 KST)는 같은 순서');
  const nextHour = shuffleWithinTiers(items, (x) => x.tier, shuffleSeed(kstHour(at + 60 * 60000), 0));
  assert.notEqual(order(a), order(nextHour), '정시가 지나면 새 순서');
  const bumped = shuffleWithinTiers(items, (x) => x.tier, shuffleSeed(kstHour(at), 1));
  assert.notEqual(order(a), order(bumped), '수동 섞기는 다른 순서');
  assert.notEqual(order(a), order(items), '실제로 섞인다');
  assert.equal(order(items), Array.from({ length: 30 }, (_, i) => `c${i}`).join(','), '원본을 바꾸지 않는다');
  assert.deepEqual([...a].map((x) => x.id).sort(), [...items].map((x) => x.id).sort());
});

test('묶음 순서는 지킨다 — 0 묶음 전부가 1 묶음보다 앞, 1 묶음이 2 묶음보다 앞', () => {
  const out = shuffleWithinTiers(items, (x) => x.tier, 12345);
  const tiers = out.map((x) => x.tier);
  assert.deepEqual(tiers, [...tiers].sort((p, q) => p - q));
});

test('KST 시간 계산 — 정시 경계와 다음 정시까지 남은 시간', () => {
  assert.equal(kstHour(Date.parse('2026-10-10T14:59:59Z')) + 1, kstHour(Date.parse('2026-10-10T15:00:00Z')));
  assert.equal(msToNextHour(Date.parse('2026-10-10T03:59:30Z')), 30_000);
  assert.equal(msToNextHour(Date.parse('2026-10-10T04:00:00Z')), 3_600_000);
});

test('배선 — 홈판 · 애드센스 · 오늘의 글감이 매시 섞기와 [순서 섞기] 버튼을 쓴다', () => {
  for (const file of ['../src/components/leword/homefeed/HomefeedBenchmarkBoard.tsx', '../src/components/leword/adsense/AdsenseBenchmarkBoard.tsx', '../src/components/leword/TopicBriefsBoard.tsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /useShuffleSeed\(\)/, file);
    assert.match(src, /shuffleWithinTiers\(/, file);
    assert.match(src, /순서 섞기/, file);
  }
});
