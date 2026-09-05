import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsefulYoutubeTopic, cleanYoutubeSnapshot } from '../../spa/src/lib/youtubeTopicQuality.mjs';

test('인물 조회와 사이트 이동용 검색어는 글감에서 제외한다', () => {
  for (const query of ['리센느 나무위키', '고윤정나무위키', '김승원 프로필', '용혜인 나이', '리니지클래식 인벤', '고윤정 인스타 주소', '', null]) {
    assert.equal(isUsefulYoutubeTopic(query), false, String(query));
  }
});
test('사건·제품·사용법과 구매 판단 검색어는 유지한다', () => {
  for (const query of ['갤럭시 폴드8 가격', '나연 혀클리너', '아이폰 프로필 사진 변경', '신병4 사보타주', '청년도약계좌 신청기간']) {
    assert.equal(isUsefulYoutubeTopic(query), true, query);
  }
});
test('이전 스냅샷과 확장어도 같은 기준으로 정제하며 수집 시각은 바꾸지 않는다', () => {
  const source = { collectedAt: '2026-09-05T19:33:30.243Z', rows: [
    { keyword: '고윤정 나무위키', expansions: [] },
    { keyword: '갤럭시 폴드8 가격', expansions: ['갤럭시 폴드8 나무위키', '갤럭시 폴드8 가격 비교'] },
  ] };
  const output = cleanYoutubeSnapshot(source);
  assert.equal(output.collectedAt, source.collectedAt);
  assert.equal(output.rows.length, 1);
  assert.deepEqual(output.rows[0].expansions, ['갤럭시 폴드8 가격 비교']);
  assert.equal(source.rows.length, 2);
  assert.deepEqual(cleanYoutubeSnapshot(null).rows, []);
  assert.deepEqual(cleanYoutubeSnapshot({ rows: [null] }).rows, []);
});
