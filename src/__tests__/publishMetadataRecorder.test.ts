import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  recordPublishMeta,
  collectEnabledFeatures,
  CURRENT_PROMPT_VERSION,
} from '../services/publishMetadataRecorder';
import {
  getMetadata,
  __setStorageForTest,
  __clearForTest,
} from '../analytics/featureFlagTracker';
import type { ValidationResult } from '../services/contentValidationPipeline';

const tmpFile = path.join(os.tmpdir(), `publish_meta_recorder_${Date.now()}.json`);

beforeEach(() => {
  __setStorageForTest(tmpFile);
  __clearForTest();
});

afterEach(() => {
  __clearForTest();
});

function sampleValidation(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    pass: overrides.pass ?? true,
    issues: overrides.issues ?? [],
    metrics: {
      aiFingerprintScore: 0,
      totalIssueCount: overrides.metrics?.totalIssueCount ?? 0,
      criticalIssueCount: 0,
      verificationLoopTriggersFound: 3,
      qumaAnchorMissCount: 0,
      priceArtifactFound: false,
      ...(overrides.metrics ?? {}),
    },
  };
}

describe('recordPublishMeta — core contract', () => {
  it('persists a record with validation success', () => {
    const postId = recordPublishMeta({
      postId: 'p-1',
      featuresEnabled: ['validator'],
      validation: sampleValidation({ pass: true }),
    });
    expect(postId).toBe('p-1');
    const saved = getMetadata('p-1');
    expect(saved).not.toBeNull();
    expect(saved!.validationPassed).toBe(true);
    expect(saved!.featuresEnabled).toEqual(['validator']);
  });

  it('persists a record with validation failure', () => {
    recordPublishMeta({
      postId: 'p-2',
      featuresEnabled: ['validator', 'thumbnail_auto'],
      validation: sampleValidation({
        pass: false,
        metrics: { totalIssueCount: 4 } as ValidationResult['metrics'],
      }),
    });
    const saved = getMetadata('p-2');
    expect(saved!.validationPassed).toBe(false);
    expect(saved!.validationIssueCount).toBe(4);
  });

  it('generates an auto postId when none is provided', () => {
    const postId = recordPublishMeta({
      featuresEnabled: [],
      validation: sampleValidation(),
    });
    expect(postId).toMatch(/^auto-\d+-[a-z0-9]+$/);
    expect(getMetadata(postId)).not.toBeNull();
  });

  it('uses CURRENT_PROMPT_VERSION when no version is provided', () => {
    recordPublishMeta({
      postId: 'p-3',
      featuresEnabled: [],
    });
    expect(getMetadata('p-3')!.promptVersion).toBe(CURRENT_PROMPT_VERSION);
  });

  it('treats missing validation as pass=true, issueCount=0', () => {
    recordPublishMeta({ postId: 'p-4', featuresEnabled: [] });
    const saved = getMetadata('p-4')!;
    expect(saved.validationPassed).toBe(true);
    expect(saved.validationIssueCount).toBe(0);
  });
});

describe('collectEnabledFeatures', () => {
  it('extracts only the true flags', () => {
    const features = collectEnabledFeatures({
      validator: true,
      thumbnail_auto: true,
      smart_scheduler: false,
      feedback_loop: undefined,
    });
    expect(features.sort()).toEqual(['thumbnail_auto', 'validator']);
  });

  it('returns empty array when all flags are off', () => {
    expect(collectEnabledFeatures({ validator: false })).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(collectEnabledFeatures({})).toEqual([]);
  });
});
