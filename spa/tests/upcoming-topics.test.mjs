/**
 * 미리 써 둘 소재(2026-10-11 사장님 "지금 홈판도 미리 쓰면 뜰 소재가 있으면 — A매치 우루과이전에 처음 나온 김민수 선수 글이 그날만 43만").
 * 판은 앱 레포 scripts/upcoming-topics.js 가 하루 두 번 /data/upcoming-topics.json 으로 싣는다. 화면은 검사하고 그대로 그린다(잰 사실만).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeUpcoming, upcomingView, whenLabel } from '../src/lib/upcomingTopicsModel.mjs';

const watch = (name, documentCount, more = {}) => ({ name, signal: '생애 첫 발탁', quote: `${name}가 생애 첫 발탁됐다.`, url: 'https://n.news/a', angles: [`${name} 프로필`], publishAt: '경기 종료 직후', searchVolume: 1200, documentCount, suggestions: [`${name} 나이`], ...more });
const card = (id, startsAt, more = {}) => ({ id, kind: 'sports', league: '축구 국가대표 A매치', title: '대한민국 vs 파라과이', startsAt, dateOnly: false, articleCount: 3, articles: [{ title: '기사', url: 'https://n.news/a' }], watch: [watch('김민수', 37)], ...more });
const board = (cards) => ({ schemaVersion: 1, generatedAt: '2026-10-11T00:00:00Z', windowDays: 7, cards });
const now = Date.parse('2026-10-11T01:00:00Z'); // KST 10:00

test('형식이 틀리면 버리고, 링크는 http(s)만 · 숫자는 숫자만(못 잰 값은 null)', () => {
  assert.equal(normalizeUpcoming(null), null);
  assert.equal(normalizeUpcoming({ cards: '아님' }), null);
  const item = normalizeUpcoming(board([card('a', '2026-10-14T11:00:00Z', { articles: [{ title: 'x', url: 'javascript:alert(1)' }], watch: [watch('김민수', '많음', { url: 'javascript:x', searchVolume: -1, homeTitles: ['제목 하나', 42] })] })])).cards[0];
  assert.deepEqual(item.articles, []);
  assert.equal(item.watch[0].url, null);
  assert.equal(item.watch[0].documentCount, null);
  assert.equal(item.watch[0].searchVolume, null);
  assert.deepEqual(item.watch[0].homeTitles, ['제목 하나']);
});

test('지난 사건은 빼고(경기는 시작 6시간 뒤 · 날짜만 있는 예정은 그날이 지나면), 날짜순 · 사람은 블로그 문서가 적은 순(못 잰 값은 뒤)', () => {
  const data = normalizeUpcoming(board([
    card('later', '2026-10-16T11:00:00Z'),
    card('past', '2026-10-10T15:00:00Z'), // KST 10/11 00:00 시작 → 6시간 지남
    card('soon', '2026-10-11T10:00:00Z', { watch: [watch('유명선수', 184983), watch('모름', null), watch('새얼굴', 12)] }),
    card('today-dateonly', '2026-10-10T15:00:00Z', { kind: 'schedule', dateOnly: true }), // KST 10/11 하루 — 아직 오늘
  ]));
  const view = upcomingView(data, now);
  assert.deepEqual(view.map((c) => c.id), ['today-dateonly', 'soon', 'later']);
  assert.deepEqual(view[1].watch.map((w) => w.name), ['새얼굴', '유명선수', '모름']);
});

test('시각 표시 — 오늘 · 내일 · D-n (KST), 날짜만 있는 예정은 시각 없이', () => {
  assert.equal(whenLabel({ startsAt: '2026-10-11T10:00:00Z', dateOnly: false }, now), '오늘 19:00');
  assert.equal(whenLabel({ startsAt: '2026-10-12T09:30:00Z', dateOnly: false }, now), '내일 18:30');
  assert.equal(whenLabel({ startsAt: '2026-10-14T11:00:00Z', dateOnly: false }, now), 'D-3 · 10/14(수) 20:00');
  assert.equal(whenLabel({ startsAt: '2026-10-12T15:00:00Z', dateOnly: true }, now), 'D-2 · 10/13(화)');
});

test('배선 — 홈판 탭 맨 위에 미리 써 둘 소재 칸 · 잰 사실만(확률 · 예상 문구 없음)', () => {
  const boardSrc = readFileSync(new URL('../src/components/leword/homefeed/HomefeedBenchmarkBoard.tsx', import.meta.url), 'utf8');
  assert.match(boardSrc, /<UpcomingTopicsPanel\s*\/>/);
  const panel = readFileSync(new URL('../src/components/leword/homefeed/UpcomingTopicsPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /\/data\/upcoming-topics\.json/);
  assert.match(panel, /미리 써 둘 소재/);
  assert.doesNotMatch(panel, /확률|예상\s*(트래픽|수익|방문)|뜰\s*가능성/);
});

// 2026-10-11 사장님 "미리 선점은 접었다 폈다 할 수 있게, 처음에는 접어 놔"
test('미리 써 둘 소재 칸 — 처음엔 접힘, 머리줄 버튼(aria-expanded)으로 펼친다', () => {
  const panel = readFileSync(new URL('../src/components/leword/homefeed/UpcomingTopicsPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(panel, /aria-expanded=\{open\}/);
  assert.match(panel, /\{open && </);
});
