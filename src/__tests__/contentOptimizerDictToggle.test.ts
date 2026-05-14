import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { optimizeContentForNaver, resetOptimizerLog } from '../contentOptimizer.js';

// Sample paragraph that the dictionary-based steps would normally augment with
// "솔직히 / 직접 / 체감 / 개인적으로" style human-expression injection.
const PLAIN_BODY = [
  '오늘은 새 노트북 구매기를 정리해본다.',
  '예전 모델보다 가벼워서 휴대성이 확실히 좋아졌다.',
  '배터리는 하루 사용에 무리 없는 수준이었다.',
  '발열은 게임을 돌릴 때 손등에 약하게 느껴졌다.',
  '결론적으로 가성비는 만족스러운 편이라고 본다.',
].join('\n\n');

describe('optimizeContentForNaver — skipDictInjection toggle', () => {
  beforeEach(() => {
    resetOptimizerLog();
    delete process.env.DISABLE_NAVER_DICT_INJECTION;
  });

  afterEach(() => {
    delete process.env.DISABLE_NAVER_DICT_INJECTION;
  });

  it('default behavior: returns non-empty string and may apply dictionary post-processing', () => {
    const result = optimizeContentForNaver(PLAIN_BODY, 'professional', true);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('skipDictInjection=true produces output of same or smaller size (no injection)', () => {
    const baseline = optimizeContentForNaver(PLAIN_BODY, 'professional', true);
    const skipped = optimizeContentForNaver(PLAIN_BODY, 'professional', true, {
      skipDictInjection: true,
    });
    // When dictionary injection is skipped, the output should not be larger
    // than the baseline (the baseline may have human/EEAT phrases injected).
    expect(skipped.length).toBeLessThanOrEqual(baseline.length);
  });

  it('skipDictInjection=true preserves the original sentence structure', () => {
    const skipped = optimizeContentForNaver(PLAIN_BODY, 'professional', true, {
      skipDictInjection: true,
    });
    // Core content keywords from the input should still be present.
    expect(skipped).toContain('노트북');
    expect(skipped).toContain('배터리');
    expect(skipped).toContain('가성비');
  });

  it('DISABLE_NAVER_DICT_INJECTION env triggers skip when option omitted', () => {
    const baseline = optimizeContentForNaver(PLAIN_BODY, 'professional', true);
    resetOptimizerLog();
    process.env.DISABLE_NAVER_DICT_INJECTION = 'true';
    const skipped = optimizeContentForNaver(PLAIN_BODY, 'professional', true);
    expect(skipped.length).toBeLessThanOrEqual(baseline.length);
  });

  it('explicit option overrides env (option=false re-enables injection despite env=true)', () => {
    // env says skip, but explicit option says do not skip → injection should still occur.
    // Injection is non-deterministic (random selection), so compare size against the
    // explicit-skip case rather than against another randomized run.
    process.env.DISABLE_NAVER_DICT_INJECTION = 'true';
    const explicitOff = optimizeContentForNaver(PLAIN_BODY, 'professional', true, {
      skipDictInjection: false,
    });
    resetOptimizerLog();
    const explicitOn = optimizeContentForNaver(PLAIN_BODY, 'professional', true, {
      skipDictInjection: true,
    });
    // The injection-enabled run should produce output at least as long as
    // the injection-skipped run (extra phrases get added, never removed).
    expect(explicitOff.length).toBeGreaterThanOrEqual(explicitOn.length);
  });

  it('handles empty content without throwing', () => {
    expect(optimizeContentForNaver('', 'professional', true, { skipDictInjection: true })).toBe('');
  });
});
