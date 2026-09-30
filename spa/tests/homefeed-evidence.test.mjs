/**
 * 벤치마크 판 × 실측 홈판 기록(2026-10-01 사장님 "1번 2번 3번 전부").
 *  ① 실제 홈판 상위(어드바이저: 어제 20 · 최근 7일)에 같은 글 또는 같은 소재가 올랐나
 *  ③ 내 블로그가 홈판 유입을 받았던 글과 같은 소재인가
 * 둘 다 확률이 아니라 '확인된 사실'만 단다. 묶기 규칙은 판과 같은 것(groupTokens · sameStory)을 쓴다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateEvidence, evidenceSummary } from '../src/lib/homefeedEvidence.mjs';

const card = (id, title, sources) => ({ id, title, sources: sources.map(([t, url]) => ({ title: t, url })) });
const daily = {
  day: '2026-09-30',
  homefeedTitles: [{ title: '디올 원영 행사 사진 모음', url: 'http://blog.naver.com/zz/111' }],
  homefeedWeek: [
    { day: '2026-09-29', rank: 3, title: '허진호 감독 암살자 역사 논란 입장', url: 'http://blog.naver.com/aa/222' },
    { day: '2026-09-28', rank: 7, title: '완전히 다른 소재', url: 'http://blog.naver.com/bb/333' },
  ],
  myHomefeedHits: [{ title: '계약결혼 16기 상철 발언 정리', day: '2026-09-29', count: 42 }],
};

test('같은 글이 실제 홈판 상위에 있으면 same-post, 비슷한 소재면 similar', () => {
  const out = annotateEvidence([
    card('a', '허진호 감독, 암살자 역사 논란', [['허진호 감독, 암살자 역사 논란', 'https://blog.naver.com/aa/222']]),
    card('b', '디올과 원영의 만남', [['디올과 원영의 만남', 'https://blog.naver.com/cc/9']]),
    card('c', '관계없는 소재 하나', [['관계없는 소재 하나', 'https://blog.naver.com/dd/1']]),
  ], daily);
  assert.deepEqual(out[0].evidence.homefeed, { kind: 'same-post', day: '2026-09-29', rank: 3, title: '허진호 감독 암살자 역사 논란 입장', url: 'https://blog.naver.com/aa/222' });
  assert.equal(out[1].evidence.homefeed.kind, 'similar');
  assert.equal(out[1].evidence.homefeed.day, '2026-09-30');
  assert.equal(out[2].evidence.homefeed, null);
});
test('내 블로그 홈판 유입 글과 같은 소재면 표시한다', () => {
  const out = annotateEvidence([card('m', '계약결혼 16기 상철 막말', [['계약결혼 16기 상철 막말 자식은 골치', 'https://blog.naver.com/x/1']])], daily);
  assert.deepEqual(out[0].evidence.mine, { title: '계약결혼 16기 상철 발언 정리', day: '2026-09-29', count: 42 });
});
test('옛 앱(7일 · 내 글 모음 없음)이면 어제 20 과 어제 글별 유입으로 맞댄다', () => {
  const old = { day: '2026-09-30', homefeedTitles: daily.homefeedTitles, posts: [{ title: '계약결혼 16기 상철 발언 정리', homefeed: { count: 5, ratio: 0.5 } }, { title: '0 인 글', homefeed: { count: 0, ratio: 0 } }] };
  const out = annotateEvidence([card('m', '계약결혼 16기 상철 막말', [['계약결혼 16기 상철 막말', 'https://blog.naver.com/x/1']]), card('b', '디올과 원영의 만남', [['디올과 원영의 만남', 'https://blog.naver.com/cc/9']])], old);
  assert.equal(out[0].evidence.mine.count, 5);
  assert.equal(out[1].evidence.homefeed.kind, 'similar');
});
test('기록이 없으면 표시 없이 그대로, 원본은 안 바꾼다', () => {
  const cards = [card('a', '디올과 원영의 만남', [['디올과 원영의 만남', 'https://blog.naver.com/cc/9']])];
  const out = annotateEvidence(cards, null);
  assert.equal(out[0].evidence.homefeed, null);
  assert.equal(cards[0].evidence, undefined);
});
test('요약 — 실제 홈판 제목 수 · 기간 · 내 홈판 글 수', () => {
  assert.deepEqual(evidenceSummary(daily), { homefeedTitles: 3, days: 3, from: '2026-09-28', to: '2026-09-30', myHits: 1 });
  assert.equal(evidenceSummary(null), null);
});
