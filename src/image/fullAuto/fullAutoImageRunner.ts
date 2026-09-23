/**
 * NAVER FULL AUTO — one unattended image run for one FINAL article.
 *
 *   final article + policy → slot plan → generate (shared automation loop) → reconcile slots
 *   → image readiness → publish decision (+ cost line)
 *
 * The same runner serves the one-click full auto, the reservation queue and multi-account, so the
 * three can never drift apart again. Generation is injected: the renderer passes
 * generateImagesForAutomation (multiAccountManager); tests pass a stub. No DOM, no storage.
 */
import type { FullAutoImagePolicy } from './fullAutoImagePolicy.js';
import {
  buildFullAutoImageSlots,
  reconcileFullAutoSlotsWithImages,
  summarizeFullAutoImageSlots,
  updateFullAutoImageSlot,
  type FullAutoImageSlot,
} from './fullAutoImageSlots.js';
import {
  decideFullAutoPublish,
  evaluateFullAutoImageReadiness,
  verifyFullAutoHeadingMapping,
  type FullAutoImageReadiness,
  type FullAutoPublishDecision,
} from './fullAutoPublishDecision.js';
import {
  buildFullAutoImageHeadingList,
  fullAutoArticleTitle,
  fullAutoFinalHeadingTitles,
  type FullAutoArticleLike,
  type FullAutoRealImageCandidate,
} from './fullAutoImageRequest.js';

export interface FullAutoSlotResultEvent {
  readonly key: string;
  readonly state: 'SUCCESS' | 'FAILED';
  readonly reason?: string;
  readonly image?: {
    readonly provider?: string;
    readonly assetKind?: string;
    readonly width?: number;
    readonly height?: number;
    readonly textRendered?: boolean;
    readonly fallbackUsed?: boolean;
    readonly actualProvider?: string;
  };
}

export type FullAutoGenerateFn = (
  provider: string,
  headings: unknown[],
  title: string,
  options: Record<string, unknown>,
) => Promise<unknown[]>;

export interface FullAutoImageRunInput {
  /** The article exactly as it will be published (title / headings / intro fixed). */
  readonly article: FullAutoArticleLike;
  readonly fallbackTitle?: string;
  readonly provider: string;
  readonly policy: FullAutoImagePolicy;
  /** Flow options passed through to the automation loop (stopCheck, onProgress, flightScope …). */
  readonly baseOptions?: Record<string, unknown>;
  readonly cardPromise?: string;
  readonly realImages?: readonly FullAutoRealImageCandidate[];
  readonly onStage?: (stage: unknown) => void;
  /** 1-image price for the provider (KRW), null when unknown — only for the cost line. */
  readonly costPerImageKrw?: number | null;
}

export interface FullAutoImageRunResult {
  readonly images: unknown[];
  readonly slots: readonly FullAutoImageSlot[];
  readonly readiness: FullAutoImageReadiness;
  readonly decision: FullAutoPublishDecision;
  readonly costLine: string;
}

function fullAutoSlotPatchFromEvent(event: FullAutoSlotResultEvent): Partial<FullAutoImageSlot> {
  if (event.state === 'FAILED') return { state: 'FAILED', reason: String(event.reason || '이미지 생성 실패') };
  const image = event.image || {};
  return {
    state: 'SUCCESS',
    reason: undefined,
    ...(image.provider ? { provider: String(image.provider) } : {}),
    ...(image.assetKind ? { assetKind: String(image.assetKind) } : {}),
    ...(Number.isFinite(image.width) ? { width: Number(image.width) } : {}),
    ...(Number.isFinite(image.height) ? { height: Number(image.height) } : {}),
    ...(typeof image.textRendered === 'boolean' ? { textRendered: image.textRendered } : {}),
    ...(image.fallbackUsed === true ? { fallbackUsed: true } : {}),
    ...(image.actualProvider ? { actualProvider: String(image.actualProvider) } : {}),
  };
}

/** "이미지 6장(썸네일 1 + 소제목 5) · 예상 ₩582" — never an estimate we cannot back with a price. */
export function describeFullAutoImageCost(
  slots: readonly FullAutoImageSlot[],
  provider: string,
  costPerImageKrw: number | null | undefined,
): string {
  const summary = summarizeFullAutoImageSlots(slots);
  const sections = slots.filter((slot) => slot.kind === 'section' && slot.state !== 'SKIPPED_BY_SETTING').length;
  const thumbnails = slots.filter((slot) => slot.kind === 'thumbnail').length;
  const head = `이미지 ${summary.planned}장(썸네일 ${thumbnails} + 소제목 ${sections}) · 엔진 ${provider || '미지정'}`;
  if (costPerImageKrw === 0) return `${head} · 추가 비용 0원(구독/무료 엔진)`;
  if (typeof costPerImageKrw === 'number' && Number.isFinite(costPerImageKrw) && costPerImageKrw > 0) {
    return `${head} · 예상 ₩${Math.round(costPerImageKrw * summary.planned).toLocaleString('ko-KR')} (1장 ₩${costPerImageKrw})`;
  }
  return `${head} · 단가 미집계`;
}

export async function runFullAutoImages(
  input: FullAutoImageRunInput,
  generate: FullAutoGenerateFn,
): Promise<FullAutoImageRunResult> {
  const { policy } = input;
  const title = fullAutoArticleTitle(input.article, input.fallbackTitle || '');
  const finalHeadings = fullAutoFinalHeadingTitles(input.article);
  let slots: FullAutoImageSlot[] = buildFullAutoImageSlots({ title, headings: finalHeadings, policy });
  const costLine = describeFullAutoImageCost(slots, input.provider, input.costPerImageKrw);

  let images: unknown[] = [];
  if (policy.imagesEnabled && slots.some((slot) => slot.state === 'PENDING')) {
    const generated = await generate(input.provider, buildFullAutoImageHeadingList(input.article, policy, title), title, {
      ...(input.baseOptions || {}),
      imagePolicy: policy,
      continueOnImageFailure: true,
      directorContext: { cardPromise: input.cardPromise, realImages: input.realImages || [] },
      onSlotResult: (event: FullAutoSlotResultEvent) => {
        slots = updateFullAutoImageSlot(slots, event.key, fullAutoSlotPatchFromEvent(event));
      },
      ...(input.onStage ? { onStage: input.onStage } : {}),
    });
    images = Array.isArray(generated) ? generated : [];
    slots = reconcileFullAutoSlotsWithImages(slots, images as never[]);
  }

  const readiness = evaluateFullAutoImageReadiness(slots, policy);
  const decision = decideFullAutoPublish({ contentReady: true, image: readiness });
  return { images, slots, readiness, decision, costLine };
}

/**
 * Right before publishing (after every later edit), confirm the images still belong to the same H2s.
 * A changed heading list turns an AUTO_PUBLISH into IMAGE_REVIEW_REQUIRED instead of mis-placing images.
 */
export function recheckFullAutoDecisionBeforePublish(
  result: Pick<FullAutoImageRunResult, 'slots' | 'readiness'>,
  finalArticle: FullAutoArticleLike,
): FullAutoPublishDecision {
  const mappingProblems = result.readiness.status === 'IMAGES_DISABLED'
    ? []
    : verifyFullAutoHeadingMapping(result.slots, fullAutoFinalHeadingTitles(finalArticle));
  return decideFullAutoPublish({ contentReady: true, image: result.readiness, mappingProblems });
}
