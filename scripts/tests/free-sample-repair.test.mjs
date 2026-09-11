import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_SAMPLE_SIZE, repairFreeSample } from '../../spa/src/lib/freeSample.mjs';

/**
 * 무료 맛보기 다섯이 한 개로 줄어 있던 것(2026-09-11, 사장님 "황금키워드는 1개만 보인다고 문의왔어요").
 *
 * 실측(leaderspro.kr/data/preemption-board.json, 발행 2026-09-09):
 *   행 43개 · freeSample.day 2026-09-09 · keywords 5개
 *   그런데 그 다섯 중 보드에 남아 있는 것은 '제주렌트카 본사' **하나뿐**이었다.
 *   화면은 이름으로 잠금을 푸는데(순번이 아니라) 이름이 없으니 한 장만 열렸다.
 *
 * 원인: 발행기가 **같은 날(KST)이면 직전 발행본의 다섯을 그대로 재사용**한다.
 * 그 의도는 옳다 — 새로고침할 때마다 새 키워드가 열리면 무료로 발굴이 된다(사장님 2026-08-20).
 * 하지만 보드 행은 회차마다 바뀐다(신규·이월·만료). 남아 있는지 확인하지 않아서 이름이 증발했다.
 *
 * 규칙: **하루 동안 고정하되, 사라진 자리만 메운다.** 살아남은 이름은 그대로 두고
 * 모자란 만큼만 보드 앞줄에서 채운다. 화면과 발행기가 같은 함수를 쓴다 —
 * 둘이 다른 다섯을 고르면 잠금과 정렬이 어긋난다.
 */
const board = (names) => ({ rows: names.map((keyword) => ({ keyword, topic: 'x' })) });

test('다섯이 다 살아 있으면 그대로 둔다', () => {
  const b = board(['가', '나', '다', '라', '마', '바']);
  assert.deepEqual(repairFreeSample(b, ['나', '다', '라', '마', '바']), ['나', '다', '라', '마', '바']);
});

test('사라진 자리만 보드 앞줄로 메운다 — 살아남은 이름은 안 바뀐다', () => {
  const b = board(['가', '나', '다', '라', '마', '바']);
  const got = repairFreeSample(b, ['바', '없는것1', '없는것2', '없는것3', '없는것4']);
  assert.equal(got.length, FREE_SAMPLE_SIZE);
  assert.equal(got[0], '바', '살아남은 이름이 자리를 지켜야 한다');
  assert.deepEqual(got.slice(1), ['가', '나', '다', '라']);
});

test('실측한 그 판을 재현한다 — 하나만 남았어도 다섯을 준다', () => {
  const b = board(['제주렌트카 본사', '행A', '행B', '행C', '행D', '행E']);
  const got = repairFreeSample(b, ['전설의사내시청률', '제주렌트카 본사', '다이소 증명사진 출력', '셀레나 이러닝', '현대자동차 견적내기']);
  assert.equal(got.length, 5);
  assert.ok(got.includes('제주렌트카 본사'));
});

test('발행본이 아예 없으면 보드 앞줄 다섯', () => {
  assert.deepEqual(repairFreeSample(board(['가', '나', '다', '라', '마', '바']), null), ['가', '나', '다', '라', '마']);
  assert.deepEqual(repairFreeSample(board(['가', '나', '다', '라', '마', '바']), []), ['가', '나', '다', '라', '마']);
});

test('보드가 다섯보다 적으면 있는 만큼만 — 없는 이름을 지어내지 않는다', () => {
  assert.deepEqual(repairFreeSample(board(['가', '나']), null), ['가', '나']);
  assert.deepEqual(repairFreeSample(board([]), ['가']), []);
});

test('같은 이름을 두 번 넣지 않는다', () => {
  const got = repairFreeSample(board(['가', '나', '다', '라', '마']), ['가', '가', '가']);
  assert.equal(new Set(got).size, got.length);
  assert.equal(got.length, 5);
});

test('원본을 건드리지 않는다', () => {
  const b = board(['가', '나', '다']);
  const published = ['가'];
  repairFreeSample(b, published);
  assert.deepEqual(published, ['가']);
  assert.equal(b.rows.length, 3);
});

test('주제·레인으로 거른 목록이 아니라 보드 전체에서 메운다 — 필터를 돌려 새 키워드를 여는 구멍을 막는다', () => {
  // 이 함수는 board.rows(발행 순서) 만 본다. 화면의 정렬·필터 결과를 받지 않는다.
  const b = { rows: [{ keyword: '가', topic: 'A' }, { keyword: '나', topic: 'B' }, { keyword: '다', topic: 'A' }] };
  assert.deepEqual(repairFreeSample(b, null), ['가', '나', '다']);
});
