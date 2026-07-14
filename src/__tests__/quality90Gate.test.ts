import { describe, expect, it } from 'vitest';
import {
  assessQuality90Gate,
  canAcceptQuality90Fallback,
  getCriticalQuality90SafetyReasons,
  isQuality90Mode,
  QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE,
  QUALITY90_FALLBACK_MIN_MODE_SCORE,
  QUALITY90_TARGET_SCORE,
  resolveFinalQuality90Disposition,
} from '../content/quality90Gate';
import type { EvaluationResult, SubScore } from '../content/qualityEvaluator';

const subScore = (
  score: number,
  issues: readonly string[] = [],
  suggestions: readonly string[] = [],
  details: Readonly<Record<string, number>> = {},
): SubScore => ({
  score,
  details,
  issues,
  suggestions,
});

const evaluation = (overrides: Partial<EvaluationResult>): EvaluationResult => ({
  mode: 'seo',
  modeScore: subScore(92),
  humanlikeScore: subScore(88),
  safetyScore: subScore(95),
  finalScore: 91,
  decision: 'pass',
  retryDirective: null,
  weights: { mode: 0.6, safety: 0.25, humanlike: 0.15 },
  ...overrides,
});

describe('quality90Gate', () => {
  it('accepts a safe pass-level result without treating 90 as an absolute publication floor', () => {
    expect(canAcceptQuality90Fallback(evaluation({
      modeScore: subScore(77),
      finalScore: 83,
      safetyScore: subScore(95),
      humanlikeScore: subScore(78),
      decision: 'pass',
    }), 'seo')).toBe(true);

    expect(canAcceptQuality90Fallback(evaluation({
      mode: 'affiliate',
      modeScore: subScore(86),
      finalScore: 84,
      safetyScore: subScore(95),
      humanlikeScore: subScore(QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE - 1),
      decision: 'pass',
    }), 'affiliate')).toBe(false);

    expect(canAcceptQuality90Fallback(evaluation({
      modeScore: subScore(88),
      finalScore: 82,
      safetyScore: subScore(45),
      decision: 'regenerate',
    }), 'seo')).toBe(false);

    expect(canAcceptQuality90Fallback(evaluation({
      modeScore: subScore(QUALITY90_FALLBACK_MIN_MODE_SCORE - 1),
      finalScore: 83,
      safetyScore: subScore(95),
      decision: 'pass',
    }), 'seo')).toBe(false);
  });

  it('enables the hard target for SEO, homefeed, mate, and affiliate modes', () => {
    expect(isQuality90Mode('seo')).toBe(true);
    expect(isQuality90Mode('homefeed')).toBe(true);
    expect(isQuality90Mode('mate')).toBe(true);
    expect(isQuality90Mode('affiliate')).toBe(true);
    expect(isQuality90Mode('business')).toBe(false);
  });

  it('passes SEO content only when mode and final scores reach 90', () => {
    const result = assessQuality90Gate(evaluation({
      modeScore: subScore(QUALITY90_TARGET_SCORE),
      finalScore: QUALITY90_TARGET_SCORE,
    }), 'seo');

    expect(result).toMatchObject({
      enabled: true,
      passed: true,
      targetReached: true,
      nearTargetAccepted: false,
      miss: false,
      reasons: [],
      directive: '',
    });
  });

  it('publishes the reported mode 77 and final 83 case as a near-target pass', () => {
    const result = assessQuality90Gate(evaluation({
      modeScore: subScore(77, ['answer-first evidence is weak'], ['add decision criteria']),
      finalScore: 83,
      decision: 'pass',
    }), 'seo');

    expect(result).toMatchObject({
      enabled: true,
      passed: true,
      targetReached: false,
      nearTargetAccepted: true,
      miss: false,
      directive: '',
    });
    expect(result.reasons).toContain('modeScore 77<90');
    expect(result.reasons).toContain('finalScore 83<90');
  });

  it('never accepts a numeric near-pass while factual safety signals remain unresolved', () => {
    const result = assessQuality90Gate(evaluation({
      modeScore: subScore(88),
      finalScore: 84,
      safetyScore: subScore(
        88,
        ['hallucination warning'],
        ['remove unsupported claim'],
        { fidelity: 60, hallucination: 13, evidenceIntegrity: 100 },
      ),
      decision: 'pass',
    }), 'seo');

    expect(result).toMatchObject({
      passed: false,
      nearTargetAccepted: false,
      miss: true,
    });
    expect(result.blockingReasons).toContain('publication criticalSafety HALLUCINATION_SIGNAL');
    expect(getCriticalQuality90SafetyReasons(result)).toEqual(['HALLUCINATION_SIGNAL']);
    expect(resolveFinalQuality90Disposition(result)).toBe('BLOCK_SAFETY');
  });

  it.each(['seo', 'homefeed', 'mate', 'affiliate'] as const)(
    'accepts the one-point publication-floor tolerance for %s mode',
    (mode) => {
      const result = assessQuality90Gate(evaluation({
        mode,
        modeScore: subScore(74),
        finalScore: 83,
        safetyScore: subScore(95),
        humanlikeScore: subScore(78),
        decision: 'pass',
      }), mode);

      expect(result).toMatchObject({
        enabled: true,
        passed: true,
        targetReached: false,
        nearTargetAccepted: true,
        miss: false,
        blockingReasons: [],
        directive: '',
      });
      expect(getCriticalQuality90SafetyReasons(result)).toEqual([]);
    },
  );

  it('treats a score-only final miss as advisory after bounded repair', () => {
    const result = assessQuality90Gate(evaluation({
      modeScore: subScore(68),
      finalScore: 72,
      safetyScore: subScore(95),
      decision: 'patch',
    }), 'seo');

    expect(result.miss).toBe(true);
    expect(getCriticalQuality90SafetyReasons(result)).toEqual([]);
    expect(resolveFinalQuality90Disposition(result)).toBe('ADVISORY');
  });

  it.each(['seo', 'homefeed', 'mate', 'affiliate'] as const)(
    'keeps blocking content below the tolerated publication floor for %s mode',
    (mode) => {
      const result = assessQuality90Gate(evaluation({
        mode,
        modeScore: subScore(QUALITY90_FALLBACK_MIN_MODE_SCORE - 1),
        finalScore: 83,
        safetyScore: subScore(95),
        humanlikeScore: subScore(78),
        decision: 'pass',
      }), mode);

      expect(result).toMatchObject({
        enabled: true,
        passed: false,
        nearTargetAccepted: false,
        miss: true,
      });
      expect(result.blockingReasons).toEqual([
        `publication modeScore 73<${QUALITY90_FALLBACK_MIN_MODE_SCORE}`,
      ]);
    },
  );

  it('allows a safe near-target homefeed result when humanlike reaches its publication floor', () => {
    const result = assessQuality90Gate(evaluation({
      mode: 'homefeed',
      modeScore: subScore(93),
      finalScore: 91,
      humanlikeScore: subScore(72, ['too report-like'], ['add conversational transitions']),
    }), 'homefeed');

    expect(result.miss).toBe(false);
    expect(result.nearTargetAccepted).toBe(true);
    expect(result.reasons).toContain('humanlikeScore 72<90');
  });

  it('allows a safe near-target affiliate result instead of forcing another rewrite', () => {
    const result = assessQuality90Gate(evaluation({
      mode: 'affiliate',
      modeScore: subScore(94),
      finalScore: 92,
      humanlikeScore: subScore(84, ['too promotional'], ['replace ad copy with grounded observations']),
    }), 'affiliate');

    expect(result.miss).toBe(false);
    expect(result.nearTargetAccepted).toBe(true);
    expect(result.reasons).toContain('humanlikeScore 84<90');
  });

  it('keeps blocking results below the publication floors or with a non-pass decision', () => {
    const lowMode = assessQuality90Gate(evaluation({
      modeScore: subScore(QUALITY90_FALLBACK_MIN_MODE_SCORE - 1),
      finalScore: 83,
      safetyScore: subScore(95),
      decision: 'pass',
    }), 'seo');
    expect(lowMode).toMatchObject({ passed: false, nearTargetAccepted: false, miss: true });
    expect(lowMode.directive).toContain('QualityGate 90+');
    expect(lowMode.directive).toContain('현재 점수');
    expect(lowMode.directive).toContain('자동 발행 하한');
    expect(lowMode.directive).not.toMatch(/[媛吏諛]/);

    const unsafe = assessQuality90Gate(evaluation({
      modeScore: subScore(95),
      finalScore: 91,
      safetyScore: subScore(45),
      decision: 'regenerate',
    }), 'seo');
    expect(unsafe).toMatchObject({ passed: false, nearTargetAccepted: false, miss: true });
  });

  it('does not gate business mode', () => {
    const result = assessQuality90Gate(evaluation({
      modeScore: subScore(40),
      finalScore: 45,
    }), 'business');

    expect(result).toMatchObject({
      enabled: false,
      passed: true,
      miss: false,
    });
  });
});
