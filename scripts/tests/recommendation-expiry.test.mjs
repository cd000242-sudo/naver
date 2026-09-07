import test from 'node:test';
import assert from 'node:assert/strict';
import { expireIssueBoard } from '../../spa/src/lib/recommendationExpiry.mjs';

test('cached recommendations expire without any successful network refresh', () => {
  const at = Date.parse('2026-09-06T00:00:00Z');
  const row = {keyword:'테스트 설치',issue:'테스트',measuredAt:new Date(at).toISOString()};
  const board = {rows:[row],observations:[{...row,keyword:'테스트 가격'}],freeSample:{keywords:[row.keyword]},issues:[{issue:'테스트',nextWave:[{keyword:row.keyword,onBoard:true}],rowCount:1}]};
  assert.equal(expireIssueBoard(board,at+48*3600000-1).rows.length,1);
  const expired = expireIssueBoard(board,at+48*3600000+1);
  assert.equal(expired.rows.length,0);
  assert.equal(expired.observations.length,0);
  assert.deepEqual(expired.freeSample.keywords,[]);
  assert.equal(expired.issues[0].nextWave[0].onBoard,false);
  assert.equal(expired.issues[0].rowCount,0);
  assert.equal(board.rows.length,1);
});
test('invalid or future source dates are never current recommendations', () => {
  const now = Date.now();
  const board = {rows:[{measuredAt:'invalid'},{measuredAt:new Date(now+600000).toISOString()}],issues:[]};
  assert.equal(expireIssueBoard(board,now).rows.length,0);
});
test('expired editions cannot keep an issue flow looking current', () => {
  const board = {publishedAt:'2026-09-01T00:00:00Z',rows:[],issues:[{issue:'과거 이슈',isHot:true}]};
  assert.deepEqual(expireIssueBoard(board,Date.parse('2026-09-06T00:00:00Z')).issues,[]);
  assert.equal(board.issues.length,1);
});
