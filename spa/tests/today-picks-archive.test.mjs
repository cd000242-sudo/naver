/**
 * 추천키워드 날짜 탭(2026-10-11 사장님 "어제 꺼는 어떻게 보니?") — 매일 새 키워드(어제 실린 말 금지)라 지난 판을 날짜별로 본다.
 * 앱 레포 today-picks-archive.js 가 /data/today-picks-archive/YYYY-MM-DD.json + index.json 을 싣는다(7일).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { archiveDays } from '../src/lib/todayPicksArchive.mjs';

test('지난 날짜만(오늘 제외) 최신순 — 어제 · 그제 · 그 전은 날짜(요일)', () => {
  const now = Date.parse('2026-10-11T01:00:00Z'); // KST 10/11 10:00
  const days = archiveDays({ days: ['2026-10-11', '2026-10-10', '2026-10-09', '2026-10-07', 'bad', '2026-10-12'] }, now);
  assert.deepEqual(days, [
    { day: '2026-10-10', label: '어제' },
    { day: '2026-10-09', label: '그제' },
    { day: '2026-10-07', label: '10/7(수)' },
  ]);
  assert.deepEqual(archiveDays(null, now), []);
});

test('배선 — 날짜 목록을 읽고, 고른 날짜의 보관본을 같은 표로 그린다', () => {
  const src = readFileSync(new URL('../src/components/leword/TodayPicksBoard.tsx', import.meta.url), 'utf8');
  assert.match(src, /\/data\/today-picks-archive\/index\.json/);
  assert.match(src, /\/data\/today-picks-archive\/\$\{day\}\.json/);
  assert.match(src, /archiveDays\(/);
  assert.match(src, />오늘</);
});
