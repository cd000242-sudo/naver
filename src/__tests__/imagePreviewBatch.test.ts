import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginImagePreviewBatch,
  endImagePreviewBatch,
  resolveImagePreviewPosition,
  setImagePreviewBatchSlot,
} from '../renderer/modules/imagePreviewBatch';

/**
 * [2026-09-02 사장님] "1번 이미지가 생성된 이미지를 계속 하나씩 똑같이 보여주거든."
 * 소제목마다 IPC 한 번 → main 은 늘 index 0 / total 1 → 1번 타일만 바뀐다. 루프가 자리를 알려준다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

afterEach(() => {
  endImagePreviewBatch();
  vi.useRealTimers();
});

describe('배치 안의 한 장짜리 이벤트는 루프의 자리로 옮긴다', () => {
  it('실측: 5장 루프의 4번째 호출이 index 0 으로 와도 3번 타일로 간다', () => {
    beginImagePreviewBatch(5);
    setImagePreviewBatchSlot(3);
    expect(resolveImagePreviewPosition(0, 1)).toEqual({ index: 3, total: 5 });
  });

  it('여러 장 이벤트는 자기 index 를 안다 — 손대지 않는다', () => {
    beginImagePreviewBatch(5);
    setImagePreviewBatchSlot(3);
    expect(resolveImagePreviewPosition(2, 6)).toEqual({ index: 2, total: 6 });
  });

  it('배치가 없으면 그대로다', () => {
    expect(resolveImagePreviewPosition(0, 1)).toEqual({ index: 0, total: 1 });
    beginImagePreviewBatch(1); // 한 장짜리 배치는 배치가 아니다
    expect(resolveImagePreviewPosition(0, 1)).toEqual({ index: 0, total: 1 });
  });

  it('끝내면 그대로 돌아간다', () => {
    beginImagePreviewBatch(4);
    setImagePreviewBatchSlot(2);
    endImagePreviewBatch();
    expect(resolveImagePreviewPosition(0, 1)).toEqual({ index: 0, total: 1 });
  });

  it('끝내지 못한 낡은 배치는 무시한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T08:00:00Z'));
    beginImagePreviewBatch(4);
    setImagePreviewBatchSlot(2);
    vi.setSystemTime(new Date('2026-09-02T08:31:00Z'));
    expect(resolveImagePreviewPosition(0, 1)).toEqual({ index: 0, total: 1 });
  });
});

describe('배선: 브리지가 자리를 옮기고, 프롬프트대로 루프가 자리를 알려준다', () => {
  it('costAndAutoGen 브리지가 resolveImagePreviewPosition 을 지난다', () => {
    const src = read('renderer/modules/costAndAutoGen.ts');
    expect(src).toMatch(/const \{ index, total \} = resolveImagePreviewPosition\(data\.index, data\.total\);/u);
  });

  it('headingImageGen 루프가 begin → slot → end 를 부른다', () => {
    const src = read('renderer/modules/headingImageGen.ts');
    expect(src).toMatch(/beginImagePreviewBatch\(emptyHeadings\.length\)/u);
    expect(src).toMatch(/setImagePreviewBatchSlot\(i\)/u);
    expect(src).toMatch(/finally\s*\{\s*endImagePreviewBatch\(\);\s*\}/u);
  });
});
