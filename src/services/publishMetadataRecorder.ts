/**
 * Publish-time metadata recorder.
 *
 * Wraps featureFlagTracker.recordPublish with the ergonomics the publishing
 * pipeline needs:
 *   - Auto-generates a postId when the caller does not have one yet.
 *   - Pulls the current prompt version from a conventional constant so the
 *     caller need not thread it through every layer.
 *   - Maps a ValidationResult from contentValidationPipeline into the
 *     (validationPassed, validationIssueCount) meta fields.
 *   - Never throws on storage failure — logging only. Publishing must not
 *     break because the A/B log disk is full.
 *
 * Consumers call this AFTER a successful publish, passing in which feature
 * flags were active. The W3 / W4 analytics layers read the log later.
 */

import {
  recordPublish,
  type FeatureFlag,
  type PostFeatureMetadata,
} from '../analytics/featureFlagTracker.js';
import type { ValidationResult } from './contentValidationPipeline.js';

/** Prompt version bumped whenever homefeed/seo base prompts materially change. */
export const CURRENT_PROMPT_VERSION = 'homefeed-v2026.04.20';

export interface RecordParams {
  postId?: string;
  publishedAt?: string; // ISO; defaults to new Date().toISOString()
  featuresEnabled: FeatureFlag[];
  validation?: ValidationResult | null;
  promptVersion?: string;
  notes?: string;
}

/**
 * Record a publish event. Returns the postId (generated if missing) so the
 * caller can persist it alongside their own publish artifacts. Never throws.
 */
export function recordPublishMeta(params: RecordParams): string {
  const postId = params.postId || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const publishedAt = params.publishedAt || new Date().toISOString();
  const validationPassed = params.validation ? params.validation.pass : true;
  const validationIssueCount = params.validation
    ? params.validation.metrics.totalIssueCount
    : 0;

  const metadata: PostFeatureMetadata = {
    postId,
    publishedAt,
    featuresEnabled: params.featuresEnabled,
    promptVersion: params.promptVersion || CURRENT_PROMPT_VERSION,
    validationPassed,
    validationIssueCount,
    notes: params.notes,
  };

  try {
    recordPublish(metadata);
  } catch (err) {
    console.error('[publishMetadataRecorder] failed to persist, continuing:', err);
  }

  return postId;
}

/**
 * Build the feature-flag set from the current runtime configuration. Callers
 * pass a plain record of booleans from their config manager; this function
 * translates it to the canonical FeatureFlag[] used in the meta log.
 */
export function collectEnabledFeatures(toggles: Partial<Record<FeatureFlag, boolean>>): FeatureFlag[] {
  return (Object.entries(toggles) as [FeatureFlag, boolean | undefined][])
    .filter(([, enabled]) => enabled === true)
    .map(([flag]) => flag);
}
