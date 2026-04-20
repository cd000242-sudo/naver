import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isFeatureEnabled,
  getEnabledFeatures,
  __resetCacheForTest,
} from '../services/featureFlagConfig';
import type { FeatureFlag } from '../analytics/featureFlagTracker';

const tmpFile = path.join(os.tmpdir(), `feature_flag_config_test_${Date.now()}.json`);

beforeEach(() => {
  process.env.AUTOPUS_FEATURE_FLAG_CONFIG = tmpFile;
  __resetCacheForTest();
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

afterEach(() => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  delete process.env.AUTOPUS_FEATURE_FLAG_CONFIG;
  __resetCacheForTest();
});

describe('isFeatureEnabled — default-on behavior', () => {
  it('returns true when config file is absent', () => {
    expect(isFeatureEnabled('validator')).toBe(true);
    expect(isFeatureEnabled('feedback_loop')).toBe(true);
  });

  it('returns true when config exists but flag key is missing', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ validator: true }), 'utf-8');
    __resetCacheForTest();
    expect(isFeatureEnabled('feedback_loop')).toBe(true);
  });

  it('returns false ONLY when explicitly disabled', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ validator: false }), 'utf-8');
    __resetCacheForTest();
    expect(isFeatureEnabled('validator')).toBe(false);
    expect(isFeatureEnabled('feedback_loop')).toBe(true);
  });

  it('handles corrupt config by treating as empty (all on)', () => {
    fs.writeFileSync(tmpFile, '{not json', 'utf-8');
    __resetCacheForTest();
    expect(isFeatureEnabled('validator')).toBe(true);
  });
});

describe('getEnabledFeatures', () => {
  const allFlags: FeatureFlag[] = ['validator', 'thumbnail_auto', 'feedback_loop'];

  it('returns all flags when config absent', () => {
    const enabled = getEnabledFeatures(allFlags);
    expect(enabled).toEqual(allFlags);
  });

  it('filters out explicitly disabled flags', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ validator: false, thumbnail_auto: true }),
      'utf-8',
    );
    __resetCacheForTest();
    const enabled = getEnabledFeatures(allFlags);
    expect(enabled).toEqual(['thumbnail_auto', 'feedback_loop']);
  });
});
