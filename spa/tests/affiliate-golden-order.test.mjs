// [2026-10-28 사장님 "검색량은 많고 문서수가 작은 순서대로 보여주면 안되나요" → "기본 정렬 자체를 바꾸세요"]
import test from 'node:test';
import assert from 'node:assert/strict';
import { goldenMetrics, compareGoldenRatio } from '../src/lib/affiliateGoldenOrder.mjs';

test('검색량·문서수: 니즈 검색어 값이 먼저, 없으면 상품명 값. 0·빈 값은 안 잰 것', () => {
  assert.deepEqual(goldenMetrics({ needVolume: 3570, needDocs: 1650, searchVolume: 10, documentCount: 5 }), { volume: 3570, docs: 1650, ratio: 3570 / 1650 });
  assert.deepEqual(goldenMetrics({ needVolume: null, searchVolume: 900, documentCount: 300 }), { volume: 900, docs: 300, ratio: 3 });
  assert.equal(goldenMetrics({ needVolume: 500, needDocs: 0 }).ratio, null);
  assert.equal(goldenMetrics({}).ratio, null);
});

test('기본 정렬: 검색량 100+ 를 검색량÷문서수 큰 순, 같으면 검색량 큰 순 → 검색량 100 미만 → 숫자 없음', () => {
  const items = [
    { name: '안 잰 것' },
    { name: '물티슈', needVolume: 130, needDocs: 3684 },
    { name: '소수요 고비율', needVolume: 60, needDocs: 6 },
    { name: '가습기', needVolume: 23690, needDocs: 13460 },
    { name: '스니커즈', needVolume: 3570, needDocs: 1650 },
    { name: '같은 비율 큰 검색량', needVolume: 7140, needDocs: 3300 },
    { name: '쿠팡 상품', searchVolume: 1200, documentCount: 400 },
  ];
  assert.deepEqual([...items].sort(compareGoldenRatio).map(i => i.name),
    ['쿠팡 상품', '같은 비율 큰 검색량', '스니커즈', '가습기', '물티슈', '소수요 고비율', '안 잰 것']);
});

test('숫자가 없는 상품끼리는 원래 순서를 지킨다(안정 정렬)', () => {
  const items = [{ name: 'a' }, { name: 'b' }, { name: 'c', needVolume: 200, needDocs: 100 }, { name: 'd' }];
  assert.deepEqual([...items].sort(compareGoldenRatio).map(i => i.name), ['c', 'a', 'b', 'd']);
});
