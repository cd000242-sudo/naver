import { buildNarrativeSections } from './inferenceAggregator/sectionBuilder.js';
import type { InferenceMode, NarrativePlan } from './types.js';

export interface NarrativeReviewEdit {
  readonly caption?: string;
  readonly category?: InferenceMode;
  readonly locationHint?: string;
  readonly takenAt?: string;
  readonly userDescription?: string;
}

export type NarrativeReviewEditsById = Record<string, NarrativeReviewEdit>;

const VALID_MODES = new Set<InferenceMode>([
  'travel',
  'food',
  'lodging',
  'daily',
  'review',
  'cafe',
  'auto',
]);

export function applyReviewEditsToPlan(
  plan: NarrativePlan,
  editsById?: NarrativeReviewEditsById,
): NarrativePlan {
  if (!editsById || Object.keys(editsById).length === 0) {
    return plan;
  }

  const orderedResults = plan.orderedResults.map((response) => {
    const edit = editsById[response.imageId];
    if (!edit) return response;

    const description = firstNonEmpty(edit.userDescription, edit.caption);
    const locationHint = cleanText(edit.locationHint);
    const category = VALID_MODES.has(edit.category as InferenceMode)
      ? edit.category
      : undefined;

    return {
      ...response,
      result: {
        ...response.result,
        ...(category ? { scene_type: category } : {}),
        ...(locationHint ? { location_hint: locationHint } : {}),
        ...(description ? { description_ko: description } : {}),
      },
      ...('exif' in response && edit.takenAt
        ? { exif: { ...(response as any).exif, takenAt: edit.takenAt } }
        : {}),
    };
  });

  return {
    ...plan,
    sections: buildNarrativeSections(orderedResults),
    orderedResults,
    needsUserReview: false,
    warnings: plan.warnings.filter((warning) => !warning.includes('G1')),
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 1500) : undefined;
}
