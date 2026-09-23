/**
 * NAVER FULL AUTO — CONTENT_READY + IMAGE_READY = AUTO_PUBLISH (spec §17, §18; T17).
 */
import { describe, expect, it } from 'vitest';
import { resolveFullAutoImagePolicy } from '../image/fullAuto/fullAutoImagePolicy';
import { buildFullAutoImageSlots, updateFullAutoImageSlot, type FullAutoImageSlot } from '../image/fullAuto/fullAutoImageSlots';
import {
  decideFullAutoPublish,
  describeFullAutoImageReview,
  evaluateFullAutoImageReadiness,
  verifyFullAutoHeadingMapping,
} from '../image/fullAuto/fullAutoPublishDecision';

const HEADINGS = ['기준 날짜', '대상 조건', '신청 방법', '주의할 점', '자주 묻는 질문'];

function allDone(headingScope = 'all'): { slots: FullAutoImageSlot[]; policy: ReturnType<typeof resolveFullAutoImagePolicy> } {
  const policy = resolveFullAutoImagePolicy({ headingScope });
  let slots = buildFullAutoImageSlots({ title: '제목', headings: HEADINGS, policy });
  for (const slot of slots) {
    if (slot.state === 'PENDING') slots = updateFullAutoImageSlot(slots, slot.key, { state: 'SUCCESS', width: 800, height: 800, provider: 'nano-banana-2' });
  }
  return { slots, policy };
}

function decide(slots: FullAutoImageSlot[], policy: ReturnType<typeof resolveFullAutoImagePolicy>) {
  return decideFullAutoPublish({ contentReady: true, image: evaluateFullAutoImageReadiness(slots, policy) });
}

describe('FULL AUTO publish decision', () => {
  it('every required image present → AUTO_PUBLISH', () => {
    const { slots, policy } = allDone();
    expect(evaluateFullAutoImageReadiness(slots, policy).status).toBe('IMAGE_READY');
    expect(decide(slots, policy).decision).toBe('AUTO_PUBLISH');
  });

  it('T17: thumbnail failure → IMAGE_REVIEW_REQUIRED, never AUTO_PUBLISH', () => {
    const { slots, policy } = allDone();
    const broken = updateFullAutoImageSlot(slots, 'thumbnail', { state: 'FAILED', reason: '엔진 응답 없음' });
    const decision = decide(broken, policy);
    expect(decision.decision).toBe('IMAGE_REVIEW_REQUIRED');
    expect(decision.reasons.join(' ')).toContain('썸네일 이미지 생성 실패');
  });

  it('ALL scope with a missing H2 image → review, with the slot named', () => {
    const { slots, policy } = allDone();
    const decision = decide(updateFullAutoImageSlot(slots, 'h2-3', { state: 'FAILED', reason: 'timeout' }), policy);
    expect(decision.decision).toBe('IMAGE_REVIEW_REQUIRED');
    expect(decision.reasons).toEqual(['소제목 3 이미지 생성 실패 — timeout']);
  });

  it('explicit ODD / EVEN / NONE: the images the setting leaves out are normal, not failures', () => {
    for (const scope of ['odd', 'even', 'none']) {
      const { slots, policy } = allDone(scope);
      expect(decide(slots, policy).decision).toBe('AUTO_PUBLISH');
    }
  });

  it('a pending slot (run stopped half way) is not publishable', () => {
    const policy = resolveFullAutoImagePolicy();
    const slots = buildFullAutoImageSlots({ title: 't', headings: HEADINGS, policy });
    expect(decide(slots, policy).decision).toBe('IMAGE_REVIEW_REQUIRED');
  });

  it('homefeed thumbnail must be 800x800 when the pipeline shaped it; a Naver search photo keeps its frame', () => {
    const { slots, policy } = allDone();
    const wide = updateFullAutoImageSlot(slots, 'thumbnail', { width: 800, height: 450 });
    expect(decide(wide, policy).reasons[0]).toContain('800x450');
    const naver = updateFullAutoImageSlot(slots, 'thumbnail', { width: 1200, height: 800, provider: 'naver' });
    expect(decide(naver, policy).decision).toBe('AUTO_PUBLISH');
  });

  it('§15: an image made by another model than the selected engine is not published silently', () => {
    const { slots, policy } = allDone();
    const swapped = updateFullAutoImageSlot(slots, 'h2-2', { fallbackUsed: true, actualProvider: 'gemini-2.5-flash-image' });
    const decision = decide(swapped, policy);
    expect(decision.decision).toBe('IMAGE_REVIEW_REQUIRED');
    expect(decision.reasons[0]).toContain('gemini-2.5-flash-image');
  });

  it('images switched off by the user → publish as text-only', () => {
    const policy = resolveFullAutoImagePolicy({ textOnlyPublish: true });
    const readiness = evaluateFullAutoImageReadiness([], policy);
    expect(readiness.status).toBe('IMAGES_DISABLED');
    expect(decideFullAutoPublish({ contentReady: true, image: readiness }).decision).toBe('AUTO_PUBLISH');
  });

  it('content that is not ready never publishes, whatever the images', () => {
    const { slots, policy } = allDone();
    const decision = decideFullAutoPublish({ contentReady: false, contentReason: '본문 비어 있음', image: evaluateFullAutoImageReadiness(slots, policy) });
    expect(decision.decision).toBe('CONTENT_NOT_READY');
  });

  it('§4: headings that change after images were made are caught before publishing', () => {
    const { slots } = allDone();
    expect(verifyFullAutoHeadingMapping(slots, HEADINGS)).toEqual([]);
    const renamed = [...HEADINGS];
    renamed[1] = '대상 조건 총정리';
    expect(verifyFullAutoHeadingMapping(slots, renamed)[0]).toContain('소제목 2');
    expect(verifyFullAutoHeadingMapping(slots, HEADINGS.slice(0, 4))[0]).toContain('5 → 4');
  });

  it('a renamed heading that the scope left without an image does not hold the post', () => {
    const { slots } = allDone('odd');
    const renamed = [...HEADINGS];
    renamed[1] = '대상 조건 총정리'; // H2 2 is SKIPPED_BY_SETTING under "odd"
    expect(verifyFullAutoHeadingMapping(slots, renamed)).toEqual([]);
  });

  it('the owner-facing review message lists every reason and what to do next', () => {
    const { slots, policy } = allDone();
    const message = describeFullAutoImageReview(decide(updateFullAutoImageSlot(slots, 'thumbnail', { state: 'FAILED' }), policy));
    expect(message).toContain('자동 발행하지 않았습니다');
    expect(message).toContain('• 썸네일');
    expect(message).toContain('이미지 관리 탭');
  });
});
