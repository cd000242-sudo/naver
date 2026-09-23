/**
 * NAVER FULL AUTO — slots keyed by the user-visible 1-based H2 number (spec §11, §14, §16; T4, T13-T16, T18).
 */
import { describe, expect, it } from 'vitest';
import { resolveFullAutoImagePolicy } from '../image/fullAuto/fullAutoImagePolicy';
import {
  buildFullAutoImageSlots,
  describeFullAutoImageStage,
  findFullAutoSlotForImage,
  fullAutoItemsForScope,
  fullAutoScopeKeepsHeading,
  reconcileFullAutoSlotsWithImages,
  summarizeFullAutoImageSlots,
  updateFullAutoImageSlot,
} from '../image/fullAuto/fullAutoImageSlots';
import { keepSectionImage } from '../image/headingImageSelection';

const FIVE = ['EV9 충전 커넥터가 안 빠지는 증상', '잠금 해제 순서', '충전구 결빙 확인', '서비스센터 가기 전 체크', '재발 막는 습관'];
const FOUR = FIVE.slice(0, 4);

function plan(headings: string[], headingScope: string) {
  return buildFullAutoImageSlots({ title: '제목', headings, policy: resolveFullAutoImagePolicy({ headingScope }) });
}

function states(slots: ReturnType<typeof plan>) {
  return slots.map((slot) => `${slot.key}:${slot.state === 'SKIPPED_BY_SETTING' ? 'skip' : 'need'}`);
}

describe('FULL AUTO image slots', () => {
  it('T4: H2 5 → thumbnail 1 + 5 H2 images = 6 planned', () => {
    const slots = plan(FIVE, 'all');
    expect(slots.map((s) => s.key)).toEqual(['thumbnail', 'h2-1', 'h2-2', 'h2-3', 'h2-4', 'h2-5']);
    expect(summarizeFullAutoImageSlots(slots)).toMatchObject({ planned: 6, done: 0, skipped: 0, label: '0/6' });
  });

  it('T13 ALL / T14 ODD / T15 EVEN / T16 NONE use the 1-based H2 number; the thumbnail is separate', () => {
    expect(states(plan(FIVE, 'odd'))).toEqual(['thumbnail:need', 'h2-1:need', 'h2-2:skip', 'h2-3:need', 'h2-4:skip', 'h2-5:need']);
    expect(states(plan(FIVE, 'even'))).toEqual(['thumbnail:need', 'h2-1:skip', 'h2-2:need', 'h2-3:skip', 'h2-4:need', 'h2-5:skip']);
    expect(states(plan(FOUR, 'odd'))).toEqual(['thumbnail:need', 'h2-1:need', 'h2-2:skip', 'h2-3:need', 'h2-4:skip']);
    expect(states(plan(FOUR, 'even'))).toEqual(['thumbnail:need', 'h2-1:skip', 'h2-2:need', 'h2-3:skip', 'h2-4:need']);
    const none = plan(FIVE, 'none');
    expect(summarizeFullAutoImageSlots(none)).toMatchObject({ planned: 1, skipped: 5 });
    expect(none[0].key).toBe('thumbnail');
  });

  it('uses the same parity rule as the app-wide heading image selection', () => {
    for (let n = 1; n <= 10; n++) {
      expect(fullAutoScopeKeepsHeading('odd', n)).toBe(keepSectionImage('odd-only', n));
      expect(fullAutoScopeKeepsHeading('even', n)).toBe(keepSectionImage('even-only', n));
      expect(fullAutoScopeKeepsHeading('all', n)).toBe(keepSectionImage('all', n));
    }
  });

  it('numbers only real sections: an H2 containing "대표" or "서론" is still a numbered section', () => {
    const items = [
      { heading: '썸네일', isThumbnail: true },
      { heading: '대표 트림 가격' },
      { heading: '서론에서 말한 조건' },
      { heading: '결론' },
    ];
    const scoped = fullAutoItemsForScope(items, 'odd');
    expect(scoped.map((s) => [s.number, s.kept])).toEqual([[0, true], [1, true], [2, false], [3, true]]);
  });

  it('T18: when H2 3 fails, H2 4 keeps its own slot — nothing shifts', () => {
    let slots = plan(FIVE, 'all');
    slots = updateFullAutoImageSlot(slots, 'thumbnail', { state: 'SUCCESS' });
    slots = updateFullAutoImageSlot(slots, 'h2-1', { state: 'SUCCESS' });
    slots = updateFullAutoImageSlot(slots, 'h2-2', { state: 'SUCCESS' });
    slots = updateFullAutoImageSlot(slots, 'h2-3', { state: 'FAILED', reason: 'quota' });
    const images = [
      { isThumbnail: true, heading: '제목' },
      { heading: FIVE[0] }, { heading: FIVE[1] }, { heading: FIVE[3] }, { heading: FIVE[4] },
    ];
    const settled = reconcileFullAutoSlotsWithImages(slots, images);
    expect(settled.map((s) => s.state)).toEqual(['SUCCESS', 'SUCCESS', 'SUCCESS', 'FAILED', 'SUCCESS', 'SUCCESS']);
    expect(settled[3].reason).toBe('quota');
    expect(findFullAutoSlotForImage(settled, { heading: FIVE[3] })?.key).toBe('h2-4');
  });

  it('a slot with no returned image becomes FAILED; skipped slots stay skipped', () => {
    const settled = reconcileFullAutoSlotsWithImages(plan(FIVE, 'odd'), [{ isThumbnail: true }]);
    expect(settled.find((s) => s.key === 'h2-1')?.state).toBe('FAILED');
    expect(settled.find((s) => s.key === 'h2-2')?.state).toBe('SKIPPED_BY_SETTING');
  });

  it('immutability: updating a slot returns a new list and leaves the old one untouched', () => {
    const before = plan(FIVE, 'all');
    const after = updateFullAutoImageSlot(before, 'h2-2', { state: 'FAILED' });
    expect(before[2].state).toBe('PENDING');
    expect(after[2].state).toBe('FAILED');
    expect(after).not.toBe(before);
  });

  it('progress labels for the UI', () => {
    expect(describeFullAutoImageStage({ kind: 'thumbnail', index: 1, total: 6 })).toBe('🖼️ 썸네일 생성 중 (1/6)');
    expect(describeFullAutoImageStage({ kind: 'section', number: 3, index: 4, total: 6 })).toBe('🖼️ 소제목 3 이미지 생성 중 (4/6)');
  });

  it('no images planned when images are switched off', () => {
    expect(buildFullAutoImageSlots({ title: 't', headings: FIVE, policy: resolveFullAutoImagePolicy({ textOnlyPublish: true }) })).toEqual([]);
  });
});
