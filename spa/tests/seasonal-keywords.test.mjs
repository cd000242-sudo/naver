import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSeasonalBoard, filterSeasonalTopics, koreaMonth, nextMonth, isPlanningPriority, paginateTopics, loadSeasonalBoard, safeSourceUrl, timingNotice } from '../src/components/leword/seasonal/seasonalModel.mjs';

const topic = (id, month = 10, extra = {}) => ({ id, month, category: '세금·경제', type: '정기', keyword: '부가세', angle: '신고 대상과 기한', prep: '2주 전 준비', money: true, sourceTitle: '국세청', sourceUrl: 'https://nts.go.kr/', sourceStatus: '공식 일정 확인', suggestions: ['부가세 신고'], observedAt: '2026-10-16T00:00:00Z', ...extra });
const board = (topics = [topic('a')]) => ({ version: 1, updatedAt: '2026-10-16T00:00:00Z', audit: { originalTopics: 288, addedTopics: 1, excludedSuggestions: 0, notes: ['검토 완료'] }, stats: { topics: topics.length, autocompleteUnique: new Set(topics.flatMap(t => t.suggestions)).size, moneyTopics: topics.filter(t => t.money).length }, topics });

test('한국 날짜와 연말 다음달을 기준으로 기획 우선 후보를 고른다', () => {
  assert.equal(koreaMonth(new Date('2026-12-31T16:00:00Z')), 1);
  assert.equal(nextMonth(12), 1);
  assert.equal(nextMonth(10), 11);
  assert.equal(isPlanningPriority(topic('a', 1), 12), true);
  assert.equal(isPlanningPriority(topic('a', 2), 12), false);
});
test('월·분야·돈 관련 필터와 자동완성 검색을 교집합으로 적용한다', () => {
  const topics = [topic('a'), topic('b', 11, { category: '여행', money: false }), topic('c', 10, { keyword: '법인세', suggestions: ['법인세 중간예납'] })];
  assert.deepEqual(filterSeasonalTopics(topics, { month: 10, category: '세금·경제', moneyOnly: true, query: ' 중간예납 ' }).map(t => t.id), ['c']);
  assert.equal(filterSeasonalTopics(topics, { month: 'all' }).length, 3);
  assert.equal(filterSeasonalTopics(topics, { category: '여행', moneyOnly: true }).length, 0);
  assert.equal(filterSeasonalTopics(topics, { query: '기한' }).length, 3);
  assert.equal(topics[0].id, 'a');
});
test('24개씩 표시하고 비어 있거나 마지막 페이지를 넘겨도 안전하다', () => {
  const list = Array.from({ length: 25 }, (_, i) => topic(String(i)));
  assert.equal(paginateTopics(list, 1).items.length, 24);
  assert.equal(paginateTopics(list, 99).items[0].id, '24');
  assert.equal(paginateTopics(list, -1).page, 1);
  assert.deepEqual(paginateTopics([], 1), { items: [], page: 1, pages: 1, total: 0 });
});
test('스키마와 집계 수를 검사하고 중복 ID·부정확한 자료를 거부한다', () => {
  assert.equal(parseSeasonalBoard(board()).topics.length, 1);
  for (const bad of [null, {}, { ...board(), version: 2 }, { ...board(), updatedAt: 'bad' }, board([topic('x'), topic('x')]), board([topic('x', 13)]), board([topic('x', 0)]), board([topic('x', 10, { money: 'yes' })]), board([topic('x', 10, { suggestions: [null] })]), board([topic('x', 10, { observedAt: 'bad' })]), { ...board(), stats: { topics: 22 } }, { ...board(), audit: { notes: [] } }]) {
    assert.throws(() => parseSeasonalBoard(bad));
  }
  assert.equal(parseSeasonalBoard(board([topic('x', 10, { observedAt: null })])).topics[0].observedAt, null);
  const normalized = board([topic('x', 10, { suggestions: ['IRP 공제', 'irp  공제', 'irp공제'] })]);
  assert.equal(parseSeasonalBoard({ ...normalized, stats: { ...normalized.stats, autocompleteUnique: 1 } }).stats.autocompleteUnique, 1);
});
test('사이트에 배포하는 실제 JSON을 화면 소비 모델로 읽을 수 있다', async () => {
  const source = JSON.parse(await readFile(new URL('../public/data/seasonal-keywords.json', import.meta.url), 'utf8'));
  const parsed = parseSeasonalBoard(source);
  assert.equal(parsed.topics.length, source.stats.topics);
  assert.ok(parsed.topics.length > 0);
  assert.equal(new Set(parsed.topics.map(t => t.month)).size, 12);
});
test('출처 링크는 HTTPS만 허용하고 HTML처럼 보이는 검색어는 텍스트로 유지한다', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', '/local', 'https://user:pass@example.com', 'bad']) assert.equal(safeSourceUrl(url), null);
  assert.equal(safeSourceUrl('https://nts.go.kr/'), 'https://nts.go.kr/');
  assert.throws(() => parseSeasonalBoard(board([topic('a', 10, { sourceUrl: 'javascript:alert(1)' })])));
  assert.equal(parseSeasonalBoard(board([topic('a', 10, { keyword: '<script>x</script>' })])).topics[0].keyword, '<script>x</script>');
});
test('공고·음력·기상 주제는 월 고정 일정으로 안내하지 않는다', () => {
  assert.match(timingNotice('공고형'), /공고/);
  assert.match(timingNotice('모집형'), /공고/);
  assert.match(timingNotice('음력형'), /음력/);
  assert.match(timingNotice('기상형'), /날씨/);
  assert.match(timingNotice('정기'), /확인/);
});
test('조회 실패 후 새 요청으로 재시도하며 상태·JSON 오류를 숨기지 않는다', async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const fetcher = async (url, opts) => { calls++; assert.equal(url, '/data/seasonal-keywords.json'); assert.equal(opts.signal, signal); return { ok: calls > 1, status: 503, json: async () => board() }; };
  await assert.rejects(loadSeasonalBoard(signal, fetcher));
  assert.equal((await loadSeasonalBoard(signal, fetcher)).topics.length, 1);
  await assert.rejects(loadSeasonalBoard(signal, async () => ({ ok: true, json: async () => ({}) })));
  await assert.rejects(loadSeasonalBoard(signal, async () => { throw new Error('offline'); }));
});
