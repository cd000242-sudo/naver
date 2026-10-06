/**
 * 벤치마크 판 × 실측 홈판 기록(2026-10-01 사장님 "1번 2번 3번 전부").
 *  ① 실제 홈판 상위(어드바이저: 어제 20 · 최근 7일)에 같은 글 또는 같은 소재가 올랐나
 *  ③ 내 블로그가 홈판 유입을 받았던 글과 같은 소재인가
 * 둘 다 확률이 아니라 '확인된 사실'만 단다. 묶기 규칙은 판과 같은 것(groupTokens · sameStory)을 쓴다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateEvidence, describeEvidence, evidenceSummary } from '../src/lib/homefeedEvidence.mjs';

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

/*
 * 2026-10-06 사장님 "이것도 똑바로 수정해주시고" — 옛 문장 "실제 홈판 기록과 맞댐 · 어드바이저 09/29~10/05 홈판 상위 93개 ·
 * 내 블로그 홈판 유입 글 19개"는 무엇을 했는지(어디서 온 기록을, 카드 몇 개와 겹쳐 봤는지) 알아듣기 어려웠다.
 */
test('근거 문장은 기록의 출처 · 기간 · 겹친 카드 수를 쉬운 말로 말한다', () => {
 const text = describeEvidence({ homefeedTitles: 93, days: 7, from: '2026-09-29', to: '2026-10-05', myHits: 19 }, { homefeed: 12, mine: 3 }, 'app');
 assert.match(text, /9월 29일~10월 5일 \(7일\)/);
 assert.match(text, /홈판에 오른 글 93개/);
 assert.match(text, /내 블로그 글 19개/);
 assert.match(text, /아래 소재 중 12개/);
 assert.match(text, /3개/);
 assert.match(text, /이 PC 앱/);
 assert.doesNotMatch(text, /맞댐/);
 assert.match(describeEvidence({ homefeedTitles: 20, days: 1, from: '2026-10-05', to: '2026-10-05', myHits: 0 }, { homefeed: 0, mine: 0 }, 'sync'), /10월 5일 하루/);
});
