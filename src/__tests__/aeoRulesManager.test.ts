import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AEO_RULES,
  parseAeoRules,
  loadAeoRules,
} from '../aeoRulesManager';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPEC-AEO-EXPOSURE-2026 R2 — external rules foundation.
// 베타 룰 변경 시 코드 재배포 없이 JSON만 수정. DEFAULT는 현재 하드코딩 바이트 일치.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('DEFAULT_AEO_RULES', () => {
  it('matches the current hardcoded R1 thresholds (byte-equal no-op)', () => {
    expect(DEFAULT_AEO_RULES.imageRatio.minRatio).toBe(0.33);
    expect(DEFAULT_AEO_RULES.curiosityHook.minHooks).toBe(2);
    expect(DEFAULT_AEO_RULES.h2QuestionRatio.minRatio).toBe(0.6);
  });
});

describe('parseAeoRules', () => {
  it('returns defaults for an empty object', () => {
    expect(parseAeoRules('{}')).toEqual(DEFAULT_AEO_RULES);
  });

  it('applies a partial override and keeps the rest at default', () => {
    const rules = parseAeoRules('{"imageRatio":{"minRatio":0.5}}');
    expect(rules.imageRatio.minRatio).toBe(0.5);
    expect(rules.curiosityHook.minHooks).toBe(DEFAULT_AEO_RULES.curiosityHook.minHooks);
    expect(rules.h2QuestionRatio.minRatio).toBe(DEFAULT_AEO_RULES.h2QuestionRatio.minRatio);
  });

  it('falls back to defaults on invalid JSON without throwing', () => {
    expect(parseAeoRules('not json {{{')).toEqual(DEFAULT_AEO_RULES);
  });

  it('ignores wrong-typed values and keeps the default for that field', () => {
    const rules = parseAeoRules('{"curiosityHook":{"minHooks":"abc"},"h2QuestionRatio":{"minRatio":-5}}');
    expect(rules.curiosityHook.minHooks).toBe(DEFAULT_AEO_RULES.curiosityHook.minHooks);
    // negative ratio is invalid → default preserved
    expect(rules.h2QuestionRatio.minRatio).toBe(DEFAULT_AEO_RULES.h2QuestionRatio.minRatio);
  });

  it('does not mutate DEFAULT_AEO_RULES', () => {
    const snapshot = JSON.stringify(DEFAULT_AEO_RULES);
    parseAeoRules('{"imageRatio":{"minRatio":0.9}}');
    expect(JSON.stringify(DEFAULT_AEO_RULES)).toBe(snapshot);
  });
});

describe('loadAeoRules', () => {
  it('returns defaults when the file does not exist (no throw)', () => {
    const rules = loadAeoRules('this/path/does/not/exist/aeo_rules.json');
    expect(rules).toEqual(DEFAULT_AEO_RULES);
  });
});
