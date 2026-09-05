import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsefulYoutubeTopic, isUsefulYoutubeLead, isRelevantYoutubeTopic, cleanYoutubeSnapshot } from '../../spa/src/lib/youtubeTopicQuality.mjs';

test('인물 조회와 사이트 이동용 검색어는 글감에서 제외한다', () => {
  for (const query of ['리센느 나무위키', '고윤정나무위키', '김승원 프로필', '용혜인 나이', '리니지클래식 인벤', '고윤정 인스타 주소', '박준형 와이프', '장원영 국적', '배우 MBTI', '', null]) {
    assert.equal(isUsefulYoutubeTopic(query), false, String(query));
  }
});
test('사건·제품·사용법과 구매 판단 검색어는 유지한다', () => {
  for (const query of ['갤럭시 폴드8 가격', '나연 혀클리너', '아이폰 프로필 사진 변경', '신병4 사보타주', '청년도약계좌 신청기간', '윈도우 단축키']) {
    assert.equal(isUsefulYoutubeTopic(query), true, query);
  }
});
test('이전 스냅샷과 확장어도 같은 기준으로 정제하며 수집 시각은 바꾸지 않는다', () => {
  const source = { collectedAt: '2026-09-05T19:33:30.243Z', rows: [
    { keyword: '고윤정 나무위키', expansions: [] },
    { keyword: '갤럭시 폴드8 가격', video: { title: '갤럭시 폴드8 사용해 봤습니다' }, expansions: ['갤럭시 폴드8 나무위키', '갤럭시 폴드8 가격 비교'] },
  ] };
  const output = cleanYoutubeSnapshot(source);
  assert.equal(output.collectedAt, source.collectedAt);
  assert.equal(output.rows.length, 1);
  assert.deepEqual(output.rows[0].expansions, ['갤럭시 폴드8 가격 비교']);
  assert.equal(source.rows.length, 2);
  assert.deepEqual(cleanYoutubeSnapshot(null).rows, []);
  assert.deepEqual(cleanYoutubeSnapshot({ rows: [null] }).rows, []);
});

test('연도와 숫자만 있는 제목 조각으로 다른 사건의 자동완성을 수집하지 않는다', () => {
  for (const lead of ['2026', '2026년', '2026년 9월', '9/5', '', null]) assert.equal(isUsefulYoutubeLead(lead), false, String(lead));
  for (const lead of ['갤럭시 폴드8', '나연 혀클리너', '2026 LCK', '신병4']) assert.equal(isUsefulYoutubeLead(lead), true, lead);
});

test('같은 앞 단어라도 영상에 없는 다른 인물·작품·사건으로 확장하지 않는다', () => {
  for (const [keyword, title] of [
    ['2026 고2 9모', 'GEN vs HLE | 2026 Wooribank LCK Playoffs'],
    ['유리 틸레만스', '대화 금지인데 더 시끄러움 #유리 #김규원 #김연경'],
    ['틈만나면 정해인', '현빈도 내기 싫었던 점심값 #틈만나면 #현빈 #우도환'],
    ['신들린 로맨스', '신들린 그녀의 오디션 #스케치코미디'],
    ['갤럭시 폴드8 가격', ''],
  ]) assert.equal(isRelevantYoutubeTopic(keyword, title), false, keyword);
});

test('영상에 확인되는 제품과 사건은 실제 자동완성의 구매·사용법 확장을 유지한다', () => {
  for (const [keyword, title] of [
    ['나연 혀클리너', '나연이 쓰는 혀 클리너 공개'],
    ['갤럭시 폴드8 가격 비교', '갤럭시 폴드8 플립8 직접 써 봤어요'],
    ['구광모 파양 이유', '구광모 회장 파양 소송 왜?'],
    ['신병4 재방송 시간', '#신병4 4회 #쇼츠'],
    ['신병4 몇부작', '#신병4 4회 #쇼츠'],
    ['VCT 퍼시픽 일정', 'GE vs T1 - VCT 퍼시픽 스테이지 2'],
  ]) assert.equal(isRelevantYoutubeTopic(keyword, title), true, keyword);
});

test('화면에서도 관계없는 캐시 행과 확장어를 제거하고 수집 시각을 유지한다', () => {
  const source = { collectedAt: '2026-09-05T21:44:31Z', rows: [
    { keyword: '유리 틸레만스', video: { title: '#유리 #김연경' } },
    { keyword: '틈만나면 현빈', video: { title: '#틈만나면 #현빈' }, expansions: ['틈만나면 현빈 다시보기', '틈만나면 정해인'] },
  ] };
  const result = cleanYoutubeSnapshot(source);
  assert.equal(result.collectedAt, source.collectedAt);
  assert.deepEqual(result.rows.map((row) => row.keyword), ['틈만나면 현빈']);
  assert.deepEqual(result.rows[0].expansions, ['틈만나면 현빈 다시보기']);
  assert.equal(source.rows.length, 2);
});
