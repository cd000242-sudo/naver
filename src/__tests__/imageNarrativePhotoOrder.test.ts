/**
 * 사진 글생성 — 업로드 화면의 사진 순서와 "N번 사진" 메모 계약.
 *
 * 사용자가 썸네일을 재배치하면, 화면의 1번·2번… 표기와 Vision에 전달되는
 * 사진 번호가 반드시 같은 배열 순서를 바라봐야 한다.
 */

import { describe, expect, it } from 'vitest';
import {
  reorderUploadedImages,
  type UploadedImage,
} from '../renderer/modules/imageNarrativeUpload.js';
import {
  formatImageNarrativeContext,
  withPhotoOrdinal,
} from '../imageNarrative/context.js';

function uploadedImage(id: string): UploadedImage {
  return {
    id,
    base64: `base64-${id}`,
    mimeType: 'image/jpeg',
    fileName: `${id}.jpg`,
    fileSizeBytes: 1,
    previewUrl: `blob:${id}`,
    exif: {},
    wasConverted: false,
  };
}

describe('사진 글생성 썸네일 순서 변경', () => {
  it('드래그한 사진을 목표 위치로 옮기고 원본 배열은 바꾸지 않는다', () => {
    const before = ['photo-1', 'photo-2', 'photo-3', 'photo-4'].map(uploadedImage);

    const reordered = reorderUploadedImages(before, 1, 3);

    expect(reordered.map((image) => image.id)).toEqual([
      'photo-1', 'photo-3', 'photo-4', 'photo-2',
    ]);
    expect(before.map((image) => image.id)).toEqual([
      'photo-1', 'photo-2', 'photo-3', 'photo-4',
    ]);
    expect(reordered).not.toBe(before);
  });

  it('앞으로 옮겨도 동일하게 동작하며 잘못된 인덱스는 현재 순서를 유지한다', () => {
    const before = ['photo-1', 'photo-2', 'photo-3'].map(uploadedImage);

    expect(reorderUploadedImages(before, 2, 0).map((image) => image.id)).toEqual([
      'photo-3', 'photo-1', 'photo-2',
    ]);
    expect(reorderUploadedImages(before, -1, 1).map((image) => image.id)).toEqual([
      'photo-1', 'photo-2', 'photo-3',
    ]);
    expect(reorderUploadedImages(before, 0, 99).map((image) => image.id)).toEqual([
      'photo-1', 'photo-2', 'photo-3',
    ]);
  });
});

describe('사진 번호 메모는 현재 화면 순서를 따른다', () => {
  it('재배치된 각 사진에 새 번호를 붙여 Vision 해석에 전달한다', () => {
    const visibleOrder = reorderUploadedImages(
      ['arrival', 'room', 'dinner'].map(uploadedImage),
      2,
      0,
    );
    const context = { notes: '1번은 저녁 식사, 2번은 숙소, 3번은 도착 장면으로 써주세요.' };

    const perPhotoNotes = visibleOrder.map((_, index) =>
      withPhotoOrdinal(context, index + 1, visibleOrder.length).notes,
    );

    expect(visibleOrder.map((image) => image.id)).toEqual(['dinner', 'arrival', 'room']);
    expect(perPhotoNotes).toEqual([
      expect.stringContaining('현재 사진 = 현재 화면 순서 1번 / 전체 3장'),
      expect.stringContaining('현재 사진 = 현재 화면 순서 2번 / 전체 3장'),
      expect.stringContaining('현재 사진 = 현재 화면 순서 3번 / 전체 3장'),
    ]);
  });

  it('사진번호 안내는 현재 화면에 표시된 번호를 기준으로 설명한다', () => {
    const promptContext = formatImageNarrativeContext({ notes: '1번은 저녁 식사입니다.' });

    expect(promptContext).toContain('현재 화면에 표시된 사진 번호');
  });
});
