/**
 * outcomeRecorder.ts — composes one dataset row at publish completion (main process).
 *
 * [2026-11-08 exposure-measurement plan, step 2]
 * Called from recordContentPolicyPublication, which already runs in main for every immediate, scheduler and
 * daily publish. The renderer-side tracking call never fires (its payload has no `quality`), so recording here
 * is what removes the "previous post's info attached to a scheduled post" risk: everything below comes from the
 * payload that was actually published, keyed by the URL's blogId/logNo.
 */
import { hashAccountId } from '../account/cohortStore.js';
import { recordOutcomePublication } from './outcomeDataset.js';
import { computeOutcomeFeatures } from './outcomeFeatures.js';
import type { TrackingKeyword } from './trackingKeyword.js';

export interface PublicationOutcomeInput {
  readonly userDataPath: string;
  readonly accountId: string;
  readonly blogId: string;
  readonly logNo: string;
  readonly publishedAt: string;
  readonly mode: string;
  readonly title: string;
  readonly body: string;
  readonly headings: readonly unknown[];
  readonly imageCount: number;
  readonly tracking: TrackingKeyword;
}

/** Images actually carried by the publish payload (generated set first, then structured content). */
export function imageCountFromPayload(payload: unknown): number {
  const bag = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>;
  const list = [bag.generatedImages, bag.images, bag.structuredContent?.images].find(Array.isArray);
  return Array.isArray(list) ? list.length : 0;
}

export async function recordPublicationOutcome(input: PublicationOutcomeInput): Promise<void> {
  await recordOutcomePublication(input.userDataPath, {
    blogId: input.blogId,
    logNo: input.logNo,
    accountHash: hashAccountId(input.accountId || input.blogId).slice(0, 16),
    publishedAt: input.publishedAt,
    mode: input.mode,
    keyword: { value: input.tracking.value, source: input.tracking.source, kind: input.tracking.kind },
    features: computeOutcomeFeatures({
      title: input.title,
      body: input.body,
      headings: input.headings,
      imageCount: input.imageCount,
      publishedAt: input.publishedAt,
    }),
  });
}
