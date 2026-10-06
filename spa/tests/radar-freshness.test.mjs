/**
 * 외부유입 레이더 작성일 표시(2026-10-06 사장님 "오래된 건 절대 있으면 안 되고" · 기준 14일).
 * 서버(워커)가 14일 안의 글만 보내고, 화면은 그 날짜를 '3일 전 · 10월 3일' 처럼 보여 준다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { radarAgeLabel } from '../src/lib/radarFreshness.mjs';

const NOW = Date.parse('2026-10-06T08:00:00Z'); // 10월 6일 17시 KST

test('작성 시각이 있으면 상대 시간과 날짜를 함께 쓴다', () => {
 assert.equal(radarAgeLabel({ postedAt: '2026-10-06T05:00:00Z', postdate: '2026-10-06' }, NOW), '3시간 전 · 10월 6일');
 assert.equal(radarAgeLabel({ postedAt: '2026-10-03T08:00:00Z', postdate: '2026-10-03' }, NOW), '3일 전 · 10월 3일');
 assert.equal(radarAgeLabel({ postedAt: '2026-10-06T07:59:00Z', postdate: '2026-10-06' }, NOW), '방금 · 10월 6일');
});
test('날짜만 있으면 날짜만, 둘 다 없으면 빈 문자열', () => {
 assert.equal(radarAgeLabel({ postdate: '2026-09-30' }, NOW), '9월 30일');
 assert.equal(radarAgeLabel({}, NOW), '');
});
