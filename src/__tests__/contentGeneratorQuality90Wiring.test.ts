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

  it('does not allow an 80-point pass decision to skip regeneration in target modes', () => {
    expect(source).toContain("(_gateResult.decision === 'regenerate' || _quality90Assessment?.miss)");
    expect(source).toContain('QualityGate90 ${_quality90Assessment.reasons.join');
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

  it('accepts only a safe pass-level fallback and still blocks lower-quality results after bounded repair', () => {
    expect(source).toContain('QUALITY_TARGET_NOT_MET');
    expect(source).toContain('_quality90Assessment?.miss && attempt === MAX_ATTEMPTS');
    expect(source).toContain('canAcceptQuality90Fallback(_gateResult, _modeForGate)');
    expect(source).toContain('if (quality90FallbackAccepted)');
    expect(source).toContain('90점 품질 기준을 충족하지 못해 자동 발행을 중단했습니다');
  });
});
