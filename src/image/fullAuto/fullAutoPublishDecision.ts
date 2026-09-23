/**
 * NAVER FULL AUTO — may this article publish on its own?
 *
 * CONTENT_READY (the writing pipeline's own verdict, unchanged) + IMAGE_READY = AUTO_PUBLISH.
 * Image readiness is judged only from deterministic slot states and metadata — no model call.
 *
 * Scope: only unattended runs (one-click full auto, the reservation queue, multi-account) ask this.
 * Semi-auto publishing, where the owner watches the editor and curates images live, never does
 * (feedback: live publishing trusts the user's curation).
 *
 * Pure; inlined into the renderer bundle, so names carry a fullAuto prefix.
 */
import type { FullAutoImagePolicy } from './fullAutoImagePolicy.js';
import { fullAutoSlotLabel, summarizeFullAutoImageSlots, type FullAutoImageSlot, type FullAutoSlotSummary } from './fullAutoImageSlots.js';

export type FullAutoImageReadinessStatus = 'IMAGE_READY' | 'IMAGE_REVIEW_REQUIRED' | 'IMAGES_DISABLED';

export interface FullAutoImageReadiness {
  readonly status: FullAutoImageReadinessStatus;
  /** Korean, one per problem, safe to show to the owner. */
  readonly reasons: readonly string[];
  readonly summary: FullAutoSlotSummary;
}

function fullAutoSlotProblem(slot: FullAutoImageSlot): string | null {
  const label = fullAutoSlotLabel(slot);
  if (slot.state === 'SUCCESS' && slot.fallbackUsed === true) {
    // Spec §15: no silent provider change. The image exists, but the owner decides whether to use it.
    return `${label} 이미지는 선택한 엔진이 아닌 ${slot.actualProvider || '다른 모델'}(으)로 만들어졌습니다`;
  }
  if (slot.state === 'SUCCESS' || slot.state === 'SKIPPED_BY_SETTING') return null;
  if (slot.state === 'PENDING') return `${label} 이미지가 아직 만들어지지 않았습니다`;
  const reason = String(slot.reason || '').trim();
  return `${label} 이미지 생성 실패${reason ? ` — ${reason.slice(0, 120)}` : ''}`;
}

/**
 * The size check applies to images the pipeline shapes itself (AI engines, the director's real-photo
 * composites). A Naver search photo or the user's own folder photo keeps its original frame on purpose.
 */
function fullAutoSizeIsOurs(slot: FullAutoImageSlot): boolean {
  const provider = String(slot.provider || '').trim().toLowerCase();
  if (slot.assetKind === 'naver' || slot.assetKind === 'user') return false;
  return !/^(?:naver|local|local-folder|user|manual|saved|collected)$/u.test(provider);
}

export function evaluateFullAutoImageReadiness(
  slots: readonly FullAutoImageSlot[],
  policy: Pick<FullAutoImagePolicy, 'imagesEnabled' | 'thumbnail' | 'squareSize'>,
): FullAutoImageReadiness {
  const summary = summarizeFullAutoImageSlots(slots);
  if (!policy.imagesEnabled) {
    return Object.freeze({ status: 'IMAGES_DISABLED', reasons: Object.freeze([]), summary });
  }
  const reasons: string[] = [];
  const thumbnail = slots.find((slot) => slot.kind === 'thumbnail');
  if (policy.thumbnail.enabled && !thumbnail) reasons.push('썸네일 칸이 계획에 없습니다');
  for (const slot of slots) {
    const problem = fullAutoSlotProblem(slot);
    if (problem) reasons.push(problem);
  }
  const size = policy.squareSize;
  if (size && thumbnail?.state === 'SUCCESS' && thumbnail.width && thumbnail.height
    && fullAutoSizeIsOurs(thumbnail)
    && (thumbnail.width !== size || thumbnail.height !== size)) {
    reasons.push(`썸네일 크기가 ${thumbnail.width}x${thumbnail.height}입니다 (${size}x${size} 필요)`);
  }
  return Object.freeze({
    status: reasons.length === 0 ? 'IMAGE_READY' : 'IMAGE_REVIEW_REQUIRED',
    reasons: Object.freeze(reasons),
    summary,
  });
}

/**
 * Headings may not change after images exist (V1 order: final text → images). Returns one reason per
 * slot whose H2 title no longer matches the final article at the same number, plus a count change.
 */
export function verifyFullAutoHeadingMapping(
  slots: readonly FullAutoImageSlot[],
  finalHeadings: readonly string[],
): string[] {
  const clean = (value: string) => String(value || '').replace(/\s+/gu, ' ').trim();
  const finals = finalHeadings.map(clean).filter(Boolean);
  const sections = slots.filter((slot) => slot.kind === 'section');
  const reasons: string[] = [];
  if (sections.length !== finals.length) {
    reasons.push(`이미지를 만든 뒤 소제목 수가 바뀌었습니다 (${sections.length} → ${finals.length})`);
  }
  for (const slot of sections) {
    // A heading left out by the scope has no image to misplace; the count check above still guards numbering.
    if (slot.state === 'SKIPPED_BY_SETTING') continue;
    const final = finals[slot.number - 1];
    if (final !== undefined && final !== clean(slot.heading)) {
      reasons.push(`소제목 ${slot.number}이 이미지 생성 뒤 바뀌었습니다 ("${clean(slot.heading).slice(0, 20)}" → "${final.slice(0, 20)}")`);
    }
  }
  return reasons;
}

export type FullAutoPublishDecisionKind = 'AUTO_PUBLISH' | 'IMAGE_REVIEW_REQUIRED' | 'CONTENT_NOT_READY';

export interface FullAutoPublishDecision {
  readonly decision: FullAutoPublishDecisionKind;
  readonly reasons: readonly string[];
}

export function decideFullAutoPublish(input: {
  readonly contentReady: boolean;
  readonly contentReason?: string;
  readonly image: FullAutoImageReadiness;
  /** Extra mapping problems from verifyFullAutoHeadingMapping, if the caller checked. */
  readonly mappingProblems?: readonly string[];
}): FullAutoPublishDecision {
  if (!input.contentReady) {
    return Object.freeze({
      decision: 'CONTENT_NOT_READY',
      reasons: Object.freeze([String(input.contentReason || '글이 준비되지 않았습니다')]),
    });
  }
  const imageReasons = input.image.status === 'IMAGE_REVIEW_REQUIRED' ? input.image.reasons : [];
  const reasons = [...imageReasons, ...(input.mappingProblems || [])];
  return Object.freeze({
    decision: reasons.length === 0 ? 'AUTO_PUBLISH' : 'IMAGE_REVIEW_REQUIRED',
    reasons: Object.freeze(reasons),
  });
}

/** Owner-facing message for a held article. */
export function describeFullAutoImageReview(decision: FullAutoPublishDecision): string {
  if (decision.decision !== 'IMAGE_REVIEW_REQUIRED') return '';
  return [
    '이미지 검토가 필요해 자동 발행하지 않았습니다.',
    ...decision.reasons.map((reason) => `• ${reason}`),
    '글과 성공한 이미지는 그대로 남겨 두었습니다. 이미지 관리 탭에서 빈 칸만 다시 만든 뒤 발행하세요.',
  ].join('\n');
}
