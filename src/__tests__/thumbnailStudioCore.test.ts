import { describe, expect, it } from 'vitest';
import { ThumbnailStudioHistory, thumbnailStudioFitText, thumbnailStudioLayoutText } from '../renderer/modules/thumbnailStudioCore';

const measure = (text: string, size: number) => Array.from(text).length * size;

describe('thumbnail studio text layout', () => {
  it('fits long Korean main and subtitle into safe bounds without deleting words', () => {
    const mainText = '제주도의 조용한 마을에서 발견한 새로운 여행 코스와 숨겨진 풍경';
    const subText = '처음 방문하는 사람도 편안하게 즐기는 여행 안내';
    const result = thumbnailStudioFitText({ mainText, subText, width: 680, height: 300, fontSize: 72, measure });
    expect(result.fits).toBe(true);
    expect(result.fontSize).toBeLessThan(72);
    expect(result.mainLines.join('')).toBe(mainText);
    expect(result.subLines.join('')).toBe(subText);
    expect(result.height).toBeLessThanOrEqual(300);
    for (const line of result.mainLines) expect(measure(line, result.fontSize)).toBeLessThanOrEqual(680);
  });
  it('keeps explicit line breaks and reports content that cannot fit at minimum size', () => {
    const result = thumbnailStudioFitText({ mainText: '가'.repeat(2000), subText: '', width: 120, height: 100, fontSize: 60, measure });
    expect(result.fits).toBe(false);
    expect(result.fontSize).toBe(16);
    expect(result.mainLines.join('')).toBe('가'.repeat(2000));
    expect(thumbnailStudioLayoutText({ mainText: '첫 줄\n둘째 줄', subText: '', width: 680, height: 300, fontSize: 32, measure }).mainLines).toEqual(['첫 줄', '둘째 줄']);
  });
});

describe('thumbnail studio bounded history', () => {
  it('undoes grouped typing, restores background references, and clears redo on a new edit', () => {
    const image = { src: 'data:image/png;base64,fixture' };
    const history = new ThumbnailStudioHistory<any>(3, (a, b) => a.text === b.text && a.image === b.image);
    history.push({ text: '', image: null }, '', 0);
    history.push({ text: '가', image }, 'typing', 10);
    history.push({ text: '가나', image }, 'typing', 20);
    expect(history.undo()).toEqual({ text: '', image: null });
    expect(history.redo()?.image).toBe(image);
    expect(history.undo()?.text).toBe('');
    history.push({ text: '다', image: null }, 'typing', 30);
    expect(history.canRedo).toBe(false);
  });
  it('bounds retention and ignores unchanged redraws', () => {
    const history = new ThumbnailStudioHistory<number>(3);
    for (let i = 0; i < 7; i++) history.push(i);
    history.push(6);
    expect(history.undo()).toBe(5);
    expect(history.undo()).toBe(4);
    expect(history.undo()).toBeUndefined();
    expect(history.canUndo).toBe(false);
  });
});
