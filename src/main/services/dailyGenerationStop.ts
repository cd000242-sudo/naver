// src/main/services/dailyGenerationStop.ts
// The daily auto-publisher runs with no window to ask. When a post stops while it writes or draws (limit / login / model),
// the stop is saved as a record and the owner gets a desktop notification; opening the app shows the card.
// Nothing here switches an engine: an unattended run never changes the model on its own.

import { gstopBuildRecord, type GstopRecord } from '../../generationStop/resumeRecord.js';
import { gstopClassify, type GstopStage } from '../../generationStop/stopClassifier.js';
import type { DailyPublishingJob, DailyPublishingPlan } from '../../scheduler/dailyPublishingTypes.js';

const IMAGE_FAILURE = /이미지 생성|이미지를|image generation|IMAGE_/i;

export interface DailyGenerationStopInput {
  readonly plan: Pick<DailyPublishingPlan, 'accountId' | 'generator' | 'imageSource'>;
  readonly job: Pick<DailyPublishingJob, 'key'>;
  readonly message: string;
  /** The engine the plan actually used for text (resolved from app settings when the plan says "app-settings"). */
  readonly textEngine?: string;
  readonly now?: number;
}

/** A record for a generation stop, or null when the failure is anything else (unknown publish outcome, Naver account stop ...). */
export function dailyGenerationStopRecord(input: DailyGenerationStopInput): GstopRecord | null {
  const message = String(input.message || '').trim();
  if (!message) return null;
  const now = input.now ?? Date.now();
  const stage: GstopStage = IMAGE_FAILURE.test(message) ? 'image' : 'text';
  const engine = stage === 'image' ? String(input.plan.imageSource || '') : String(input.textEngine || input.plan.generator || '');
  const info = gstopClassify(message, stage, engine, now);
  if (!info) return null;
  const engineLevel = info.cause === 'limit' || info.cause === 'login' || info.cause === 'model';
  if (!engineLevel && !(stage === 'image' && info.cause === 'image')) return null;
  return gstopBuildRecord({
    kind: 'daily', info, label: input.plan.accountId, now,
    id: `daily-${input.job.key}`, accountId: input.plan.accountId, jobKey: input.job.key,
  });
}
