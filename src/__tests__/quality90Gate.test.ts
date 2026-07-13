import { describe, expect, it } from 'vitest';
import { assessQuality90Gate, isQuality90Mode, QUALITY90_TARGET_SCORE } from '../content/quality90Gate';
import type { EvaluationResult, SubScore } from '../content/qualityEvaluator';

const subScore = (score: number, issues: readonly string[] = [], suggestions: readonly string[] = []): SubScore => ({
  score,
  details: {},
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
      miss: false,
      reasons: [],
      directive: '',
    });
  });

  it('treats an 80-point pass decision as a miss for actual generation', () => {
    const result = assessQuality90Gate(evaluation({
      modeScore: subScore(88, ['answer-first evidence is weak'], ['add decision criteria']),
      finalScore: 86,
      decision: 'pass',
    }), 'seo');

    expect(result.miss).toBe(true);
    expect(result.reasons).toContain('modeScore 88<90');
    expect(result.reasons).toContain('finalScore 86<90');
    expect(result.directive).toContain('QualityGate 90+ HARD TARGET');
    expect(result.directive).toContain('add decision criteria');
  });

  it('requires homefeed humanlike score to reach 90 as well', () => {
    const result = assessQuality90Gate(evaluation({
      mode: 'homefeed',
      modeScore: subScore(93),
      finalScore: 91,
      humanlikeScore: subScore(72, ['too report-like'], ['add conversational transitions']),
    }), 'homefeed');

    expect(result.miss).toBe(true);
    expect(result.reasons).toContain('humanlikeScore 72<90');
    expect(result.directive).toContain('사람다움 점수 90점 이상');
  });

  it('requires affiliate content to reach 90 for mode, final, and humanlike scores', () => {
    const result = assessQuality90Gate(evaluation({
      mode: 'affiliate',
      modeScore: subScore(94),
      finalScore: 92,
      humanlikeScore: subScore(84, ['too promotional'], ['replace ad copy with grounded observations']),
    }), 'affiliate');

    expect(result.miss).toBe(true);
    expect(result.reasons).toContain('humanlikeScore 84<90');
    expect(result.directive).toContain('친한 사람에게 설명하듯');
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
