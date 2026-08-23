import { beforeAll, describe, expect, it } from 'vitest';

// imageHelpers는 렌더러 유틸 체인을 통해 로드 시점에 window를 건드린다.
// 이 스위트는 DOM 없는 순수 해석기만 검증하므로 최소 스텁 후 동적 import 한다.
type ImageHelpers = typeof import('../renderer/utils/imageHelpers');
let THUMBNAIL_SLOT_TITLE: ImageHelpers['THUMBNAIL_SLOT_TITLE'];
let isThumbnailSlotTitle: ImageHelpers['isThumbnailSlotTitle'];
let resolveImageSlotFromTitles: ImageHelpers['resolveImageSlotFromTitles'];

beforeAll(async () => {
  (globalThis as any).window = (globalThis as any).window || {};
  const mod = await import('../renderer/utils/imageHelpers');
  THUMBNAIL_SLOT_TITLE = mod.THUMBNAIL_SLOT_TITLE;
  isThumbnailSlotTitle = mod.isThumbnailSlotTitle;
  resolveImageSlotFromTitles = mod.resolveImageSlotFromTitles;
});

// [2026-08-23] 이미지 관리 탭 인덱스 밀림 회귀 가드.
//   증상: 썸네일을 바꾸면 소제목 1이 바뀌고, 소제목 1을 바꾸면 소제목 2가 바뀌었다.
//   원인: 카드 목록은 썸네일을 0번 슬롯으로 포함하는데 ImageManager.headings는
//        글 불러오기 경로에서 썸네일 없는 본문 목록이라, 같은 숫자가 서로 다른
//        소제목을 가리켰다. 교체/배치 경로는 이제 제목으로만 대상을 지정한다.

const CARD_SLOTS = ['🖼️ 썸네일', '소제목 하나', '소제목 둘', '소제목 셋'];
const BODY_ONLY = ['소제목 하나', '소제목 둘', '소제목 셋'];

describe('이미지 슬롯 공간', () => {
  it('썸네일 제목 판별은 별칭과 배지를 모두 흡수한다', () => {
    expect(isThumbnailSlotTitle(THUMBNAIL_SLOT_TITLE)).toBe(true);
    expect(isThumbnailSlotTitle('썸네일')).toBe(true);
    expect(isThumbnailSlotTitle('🖼️ 썸네일 📌 썸네일')).toBe(true);
    expect(isThumbnailSlotTitle('소제목 하나')).toBe(false);
    expect(isThumbnailSlotTitle('')).toBe(false);
  });

  it("'thumbnail' 참조는 항상 썸네일 키로 확정된다", () => {
    const slot = resolveImageSlotFromTitles(CARD_SLOTS, 'thumbnail');
    expect(slot).toEqual({ title: THUMBNAIL_SLOT_TITLE, isThumbnail: true, slotIndex: 0 });
  });

  it('제목 참조는 목록에 없어도 그 제목 그대로 확정된다', () => {
    const slot = resolveImageSlotFromTitles(BODY_ONLY, { title: '소제목 둘' });
    expect(slot?.title).toBe('소제목 둘');
    expect(slot?.isThumbnail).toBe(false);
  });

  it('제목이 썸네일 별칭이면 정규 썸네일 키로 모은다', () => {
    const slot = resolveImageSlotFromTitles(CARD_SLOTS, { title: '썸네일' });
    expect(slot?.title).toBe(THUMBNAIL_SLOT_TITLE);
    expect(slot?.isThumbnail).toBe(true);
  });

  it('숫자 참조는 카드 슬롯 목록으로만 해석한다 — 0번은 썸네일', () => {
    expect(resolveImageSlotFromTitles(CARD_SLOTS, 0)?.title).toBe(THUMBNAIL_SLOT_TITLE);
    expect(resolveImageSlotFromTitles(CARD_SLOTS, 1)?.title).toBe('소제목 하나');
    expect(resolveImageSlotFromTitles(CARD_SLOTS, 2)?.title).toBe('소제목 둘');
  });

  it('본문 목록으로 해석하면 한 칸씩 밀린다 — 이 차이가 버그의 정체였다', () => {
    // 회귀 재현: 같은 숫자가 두 목록에서 다른 소제목을 가리킨다.
    expect(resolveImageSlotFromTitles(BODY_ONLY, 0)?.title).toBe('소제목 하나');
    expect(resolveImageSlotFromTitles(CARD_SLOTS, 0)?.title).toBe(THUMBNAIL_SLOT_TITLE);
    // 그래서 교체 경로는 숫자가 아니라 제목을 넘긴다.
    expect(resolveImageSlotFromTitles(BODY_ONLY, { title: THUMBNAIL_SLOT_TITLE })?.title)
      .toBe(THUMBNAIL_SLOT_TITLE);
    expect(resolveImageSlotFromTitles(CARD_SLOTS, { title: THUMBNAIL_SLOT_TITLE })?.title)
      .toBe(THUMBNAIL_SLOT_TITLE);
  });

  it('범위를 벗어나거나 빈 참조는 대상 없음으로 처리한다', () => {
    expect(resolveImageSlotFromTitles(CARD_SLOTS, 99)).toBeNull();
    expect(resolveImageSlotFromTitles(CARD_SLOTS, -1)).toBeNull();
    expect(resolveImageSlotFromTitles(CARD_SLOTS, { title: '   ' })).toBeNull();
    expect(resolveImageSlotFromTitles(undefined as any, 0)).toBeNull();
  });

  it('카드 제목의 📌 썸네일 배지는 키에서 제거된다', () => {
    const slot = resolveImageSlotFromTitles(CARD_SLOTS, { title: '소제목 하나  ' });
    expect(slot?.title).toBe('소제목 하나');
  });
});
