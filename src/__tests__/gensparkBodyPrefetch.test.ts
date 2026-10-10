// [2026-10-10] 젠스파크 발행 이미지 "미리 한꺼번에" 판단 로직 시험.
import { describe, expect, it } from 'vitest';
import { gsPrefetchBodyIndexes, gsPrefetchMatchImages, gsPrefetchTimeoutMs } from '../image/fullAuto/gensparkBodyPrefetch';

const items = [
  { heading: '글 제목', isThumbnail: true, originalIndex: 0 },
  { heading: '바람 막는 텐트', isThumbnail: false, originalIndex: 1 },
  { heading: '영하 기준 침낭', isThumbnail: false, originalIndex: 2 },
  { heading: '출발 전 확인할 것', isThumbnail: false, originalIndex: 3 },
];
const img = (heading: string, file = `C:/img/${heading}.jpg`) => ({ heading, filePath: file, provider: 'genspark', originalIndex: 99 });

describe('gsPrefetchBodyIndexes', () => {
  it('젠스파크일 때만 썸네일을 뺀 본문 위치를 고른다', () => {
    expect(gsPrefetchBodyIndexes('genspark', items)).toEqual([1, 2, 3]);
    expect(gsPrefetchBodyIndexes('dropshot', items)).toEqual([]);
    expect(gsPrefetchBodyIndexes('openai-image', items)).toEqual([]);
  });
  it('본문이 2장 미만이면 한꺼번에 요청하지 않는다(이득 없음)', () => {
    expect(gsPrefetchBodyIndexes('genspark', items.slice(0, 2))).toEqual([]);
    expect(gsPrefetchBodyIndexes('genspark', [items[0]])).toEqual([]);
  });
});

describe('gsPrefetchMatchImages', () => {
  it('끝난 순서가 뒤섞여도 소제목 이름으로 칸에 맞추고, 번호는 그 칸의 원래 번호로 고친다', () => {
    const matched = gsPrefetchMatchImages(items, [1, 2, 3], [img('출발 전 확인할 것'), img('바람 막는 텐트'), img('영하 기준 침낭')]);
    expect([...matched.keys()].sort()).toEqual([1, 2, 3]);
    expect(matched.get(1)).toMatchObject({ heading: '바람 막는 텐트', isThumbnail: false, originalIndex: 1 });
    expect(matched.get(3)).toMatchObject({ heading: '출발 전 확인할 것', originalIndex: 3 });
  });
  it('못 받은 칸·파일 없는 결과·다른 소제목은 비워 둔다(호출자가 1장씩 다시 만든다)', () => {
    const matched = gsPrefetchMatchImages(items, [1, 2, 3], [img('바람 막는 텐트'), { heading: '영하 기준 침낭' }, img('엉뚱한 소제목')]);
    expect([...matched.keys()]).toEqual([1]);
  });
  it('공백·대소문자 차이는 같은 소제목으로 보고, 이미지 하나는 한 칸에만 쓴다', () => {
    const dup = [items[0], { heading: '같은  소제목', isThumbnail: false, originalIndex: 1 }, { heading: '같은 소제목', isThumbnail: false, originalIndex: 2 }];
    const matched = gsPrefetchMatchImages(dup, [1, 2], [img('같은 소제목', 'C:/a.jpg')]);
    expect(matched.size).toBe(1);
    expect(matched.get(1)?.filePath).toBe('C:/a.jpg');
  });
});

describe('gsPrefetchTimeoutMs', () => {
  it('4장 한 묶음마다 4분 + 시작 3분, 단 이미지 단계 전체 한도의 절반을 넘기지 않는다', () => {
    expect(gsPrefetchTimeoutMs(3, 60 * 60 * 1000)).toBe(180000 + 240000);
    expect(gsPrefetchTimeoutMs(6, 60 * 60 * 1000)).toBe(180000 + 2 * 240000);
    expect(gsPrefetchTimeoutMs(6, 15 * 60 * 1000)).toBe(450000);
  });
});
