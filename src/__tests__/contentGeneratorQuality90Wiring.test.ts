import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const contentGeneratorPath = path.join(process.cwd(), 'src', 'contentGenerator.ts');
const source = fs.readFileSync(contentGeneratorPath, 'utf8');

describe('contentGenerator QualityGate90 wiring', () => {
  it('sends a near-threshold final body through the real quality gate before deciding', () => {
    expect(source).toContain('isQuality90Mode(generationQualityMode)');
    expect(source).toContain('&& shouldRunFinalQualityEvaluation({');
    expect(source).toContain('plainLength >= validationMinChars || finalNearThresholdQualityEvaluation');
    expect(source).toContain('validateShoppingConnectContent(optimized, validationMinChars)');
  });

  it('assesses the actual optimized body before returning generated content', () => {
    expect(source).toContain("from './content/quality90Gate.js';");
    expect(source).toContain('assessQuality90Gate,');
    expect(source).toContain('isQuality90Mode,');
    expect(source).toContain('_quality90Assessment = assessQuality90Gate(_gateResult, _modeForGate);');
    expect(source).toContain('quality90Miss: _quality90Assessment.miss');
  });

  it('regenerates only blocking misses and recognizes near-target publication passes', () => {
    expect(source).toContain("(_gateResult.decision === 'regenerate' || _quality90Assessment?.miss)");
    expect(source).toContain('QualityGate90 ${_quality90Assessment.reasons.join');
    expect(source).toContain('_quality90Assessment.nearTargetAccepted');
    expect(source).toContain('90점 목표 근접 통과');
    expect(source).toContain('continue; // for 루프 다음 attempt');
  });

  it('forces self-critique correction for 90-point misses even when cost saver would skip ordinary patches', () => {
    expect(source).toContain('const _quality90HardMiss = Boolean(_quality90Assessment?.miss);');
    expect(source).toContain("(_gateResult.decision === 'patch' || _humanFloorMiss || _quality90HardMiss)");
    expect(source).toContain('(costPolicy.allowQualityGateSelfCritique || _quality90HardMiss)');
    expect(source).toContain('patch 후 재평가');
  });

  it('uses a bounded follow-up regeneration when the forced patch still misses 90', () => {
    expect(source).toContain('let _quality90FollowupRetryUsed = false;');
    expect(source).toContain('_quality90Assessment?.miss');
    expect(source).toContain('!_quality90FollowupRetryUsed');
    expect(source).toContain('patch 후에도 90점 미달');
    expect(source).toContain('QualityGate90 target still missed after bounded retries');
  });

  it('uses the centralized gate result without hard-blocking score-only misses after bounded repair', () => {
    expect(source).not.toContain('QUALITY_TARGET_NOT_MET');
    expect(source).toContain('_quality90Assessment?.miss && attempt === MAX_ATTEMPTS');
    expect(source).not.toContain('canAcceptQuality90Fallback(_gateResult, _modeForGate)');
    expect(source).not.toMatch(/modeScore(?:\.score)?\s*<\s*75/);
    expect(source).toContain('_quality90Assessment.blockingReasons.join');
    expect(source).toContain("quality90AdvisoryAccepted = quality90FinalDisposition === 'ADVISORY'");
    expect(source).toContain('보정 횟수를 모두 사용해 경고와 함께 다음 안전검사로 진행');
    expect(source).not.toContain('자동 발행 하한을 충족하지 못해 발행을 중단했습니다');
  });

  it('keeps shopping score and final length misses advisory after bounded retries', () => {
    expect(source).toContain('shoppingQualityAdvisoryAccepted = shoppingQualityDisposition.advisoryAccepted');
    expect(source).toContain('affiliateAuthenticityAdvisoryAccepted = authenticity.score < 85');
    expect(source).toContain('if (authenticity.hardFail)');
    expect(source).toContain('권장 분량 미달 결과를 경고와 함께 반환');
    expect(source).not.toContain('90점 품질 검사를 실행할 최소 분량에 미달해 자동 발행을 중단했습니다');
  });

  it('keeps evidence-backed safety failures blocking after score-only misses become advisory', () => {
    expect(source).toContain('getCriticalQuality90SafetyReasons,');
    expect(source).toContain('[CONTENT_SAFETY_BLOCKED]');
  });
});
