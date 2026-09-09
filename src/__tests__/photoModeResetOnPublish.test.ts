/*
 * [2026-09-09 사장님] "어떤 모드든지 글 발행이 완료되면 다음 글을 발행할 수 있도록
 * 초기화가 되어야 합니다. 다음 글 작성할 수 있는 준비가 되어야 되는데 그게 빠졌어요."
 *
 * resetAllFields() 는 SEO/반자동 시절 입력칸만 비웠고, 뒤에 붙은 사진 모드 패널은
 * 아무도 건드리지 않았다. 지난 글의 사진·상황 메모·장소가 남아 다음 글에 섞여 들었다.
 *
 * jsdom 을 띄우지 않고 최소 DOM 스텁만 쓴다 — 이 모듈이 document 에서 쓰는 것은
 * getElementById 하나뿐이라, 스텁이 오히려 그 가정을 드러낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONTEXT_IDS = [
  'image-narrative-context-time',
  'image-narrative-context-people',
  'image-narrative-context-place',
  'image-narrative-context-occasion',
  'image-narrative-context-notes',
];

const clearUploadedImages = vi.fn();
const clearPickedPlaces = vi.fn();

vi.mock('../renderer/modules/imageNarrativeUpload.js', () => ({
  clearUploadedImages: () => clearUploadedImages(),
}));
vi.mock('../renderer/modules/placePicker.js', () => ({
  clearPickedPlaces: () => clearPickedPlaces(),
}));

let fields: Map<string, { value: string }>;

beforeEach(() => {
  clearUploadedImages.mockReset();
  clearPickedPlaces.mockReset();
  fields = new Map(CONTEXT_IDS.map((id) => [id, { value: '지난 글에 적었던 내용' }]));
  (globalThis as any).document = {
    getElementById: (id: string) => fields.get(id) ?? null,
  };
});

afterEach(() => {
  delete (globalThis as any).document;
});

describe('발행 후 사진 모드 초기화', () => {
  it('업로드 사진과 장소 목록을 함께 비운다', async () => {
    const { resetPhotoModeForNextPost } = await import('../renderer/modules/photoModeReset.js');
    resetPhotoModeForNextPost();
    expect(clearUploadedImages).toHaveBeenCalledTimes(1);
    expect(clearPickedPlaces).toHaveBeenCalledTimes(1);
  });

  it('상황·경험 입력칸을 모두 비운다', async () => {
    const { resetPhotoModeForNextPost } = await import('../renderer/modules/photoModeReset.js');
    resetPhotoModeForNextPost();
    for (const id of CONTEXT_IDS) {
      expect(fields.get(id)!.value, `${id} 가 남아 있다`).toBe('');
    }
  });

  it('한 곳이 실패해도 나머지 초기화를 멈추지 않는다', async () => {
    clearUploadedImages.mockImplementation(() => { throw new Error('사진 정리 실패'); });
    const { resetPhotoModeForNextPost } = await import('../renderer/modules/photoModeReset.js');
    expect(() => resetPhotoModeForNextPost()).not.toThrow();
    expect(clearPickedPlaces).toHaveBeenCalledTimes(1);
    expect(fields.get('image-narrative-context-notes')!.value).toBe('');
  });
});
