import { describe, expect, it } from 'vitest';

import { normalizePublishImageSequence } from '../image/publishImageSequence';

// [2026-09-03 사장님 라이브] 썸네일 생성기 적용 + 풀오토 발행 → 대표 이미지 2장 업로드(1/2, 2/2)
describe('발행 이미지 시퀀스 — 대표 이미지는 하나', () => {
  it('isThumbnail 항목이 둘이면 첫 항목만 남긴다', () => {
    const content = { headings: [{ title: '소제목 A' }, { title: '소제목 B' }] };
    const images = [
      { heading: '🖼️ 썸네일', filePath: 'C:/x/thumbnail_1.png', isThumbnail: true },
      { heading: '9월 꽃구경', filePath: 'C:/x/9월 꽃구경_1.png', isThumbnail: true },
      { heading: '소제목 A', filePath: 'C:/x/a.png' },
      { heading: '소제목 B', filePath: 'C:/x/b.png' },
    ];
    const seq = normalizePublishImageSequence(content, images);
    expect(seq.filter((i) => i.isThumbnail).length).toBe(1);
    expect(seq[0].filePath).toBe('C:/x/thumbnail_1.png');
    expect(seq.length).toBe(3);
  });
});

