import { describe, expect, it } from 'vitest';
import {
  buildContentExpansionRetryInstruction,
  resolveExpansionTargetChars,
  shouldRunFinalQualityEvaluation,
} from '../contentLengthRetryPolicy';

describe('contentLengthRetryPolicy', () => {
  it('runs quality evaluation for a near-threshold final result instead of aborting before scoring', () => {
    expect(shouldRunFinalQualityEvaluation({
      visibleChars: 1297,
      validationMinChars: 1500,
      warningMinChars: 1000,
      attempt: 2,
      maxAttempts: 2,
    })).toBe(true);

    expect(shouldRunFinalQualityEvaluation({
      visibleChars: 1297,
      validationMinChars: 1500,
      warningMinChars: 1000,
      attempt: 1,
      maxAttempts: 2,
    })).toBe(false);

    expect(shouldRunFinalQualityEvaluation({
      visibleChars: 999,
      validationMinChars: 1500,
      warningMinChars: 1000,
      attempt: 2,
      maxAttempts: 2,
    })).toBe(false);
  });

  it('increases the retry target by 20 percent per attempt and caps at the safe max', () => {
    expect(resolveExpansionTargetChars({ requestedMinChars: 3000, attempt: 0, safeMaxChars: 80000 })).toBe(3000);
    expect(resolveExpansionTargetChars({ requestedMinChars: 3000, attempt: 1, safeMaxChars: 80000 })).toBe(3600);
    expect(resolveExpansionTargetChars({ requestedMinChars: 3000, attempt: 2, safeMaxChars: 80000 })).toBe(4200);
    expect(resolveExpansionTargetChars({ requestedMinChars: 90000, attempt: 2, safeMaxChars: 80000 })).toBe(80000);
  });

  it('builds a source-bounded expansion instruction without allowing fabricated facts', () => {
    const instruction = buildContentExpansionRetryInstruction({
      plainLength: 1200,
      minChars: 3000,
      requestedMinChars: 3000,
      attempt: 1,
      safeMaxChars: 80000,
    });

    expect(instruction).toContain('현재 본문 분량은 1200자로 목표(3000자)의 40%');
    expect(instruction).toContain('3600자를 목표로 확장');
    expect(instruction).toContain('자료에 없는 통계·수치·연구 결과·전문가 인용·경험담');
    expect(instruction).toContain('결론 뒤에 어떤 내용도 추가하지 마세요');
  });
});
