import { describe, expect, it } from 'vitest';

import {
  buildContentQualityV3RecordedRolloutCase,
} from '../contentQualityV3/recordedRolloutCase.js';

const machineAssessment = Object.freeze({
  caseId: 'seo-001',
  stratum: 'seo',
  disposition: 'NOT_RUN' as const,
  schemaValid: true,
  publishable: true,
  criticalHallucinationCount: 0,
  fakeFirstPersonCount: 0,
  unsupportedCurrentNumberCount: 0,
});

const provenance = Object.freeze({
  candidateOutputSha256: '1'.repeat(64),
  legacyOutputSha256: '2'.repeat(64),
  requestSha256: '3'.repeat(64),
  providerResponseSha256: '4'.repeat(64),
});

const measuredPass = Object.freeze({
  caseId: 'seo-001',
  stratum: 'seo',
  disposition: 'PASS' as const,
  ...provenance,
  candidateQualityScore: 91,
  legacyQualityScore: 89,
  costRatio: 0.7,
  latencyRatio: 0.9,
});

describe('Content Quality V3 recorded rollout case builder', () => {
  it('strictly merges machine safety assessment with externally measured PASS evidence', () => {
    const result = buildContentQualityV3RecordedRolloutCase(
      machineAssessment,
      measuredPass,
    );

    expect(result).toEqual({
      caseId: 'seo-001',
      stratum: 'seo',
      disposition: 'PASS',
      schemaValid: true,
      publishable: true,
      criticalHallucinationCount: 0,
      fakeFirstPersonCount: 0,
      unsupportedCurrentNumberCount: 0,
      ...provenance,
      candidateQualityScore: 91,
      legacyQualityScore: 89,
      costRatio: 0.7,
      latencyRatio: 0.9,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(['PRODUCT_FAIL', 'INFRA_EXTERNAL', 'NOT_RUN'] as const)(
    'keeps %s evidence non-passing and never manufactures performance metrics',
    disposition => {
      const result = buildContentQualityV3RecordedRolloutCase(machineAssessment, {
        caseId: machineAssessment.caseId,
        stratum: machineAssessment.stratum,
        disposition,
        ...provenance,
      });

      expect(result).toEqual({
        caseId: machineAssessment.caseId,
        stratum: machineAssessment.stratum,
        disposition,
        ...provenance,
      });
      expect(result).not.toHaveProperty('candidateQualityScore');
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it('requires a machine PRODUCT_FAIL to remain PRODUCT_FAIL', () => {
    const failedMachineAssessment = {
      ...machineAssessment,
      disposition: 'PRODUCT_FAIL' as const,
      publishable: false,
    };

    expect(() => buildContentQualityV3RecordedRolloutCase(
      failedMachineAssessment,
      { ...measuredPass, disposition: 'PASS' },
    )).toThrowError('INVALID_CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE');

    expect(buildContentQualityV3RecordedRolloutCase(
      failedMachineAssessment,
      {
        caseId: failedMachineAssessment.caseId,
        stratum: failedMachineAssessment.stratum,
        disposition: 'PRODUCT_FAIL',
        ...provenance,
      },
    )).toMatchObject({ disposition: 'PRODUCT_FAIL' });
  });

  it('rejects missing, uppercase, empty, or mismatched externally recorded provenance', () => {
    const invalidMeasuredEvidence: unknown[] = [
      { ...measuredPass, candidateOutputSha256: '' },
      { ...measuredPass, legacyOutputSha256: 'A'.repeat(64) },
      { ...measuredPass, requestSha256: '3'.repeat(63) },
      { ...measuredPass, caseId: 'seo-002' },
      { ...measuredPass, stratum: 'homefeed' },
      (() => {
        const copy = { ...measuredPass } as Record<string, unknown>;
        delete copy.providerResponseSha256;
        return copy;
      })(),
    ];

    for (const evidence of invalidMeasuredEvidence) {
      expect(() => buildContentQualityV3RecordedRolloutCase(
        machineAssessment,
        evidence as never,
      )).toThrowError('INVALID_CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE');
    }
  });

  it('rejects extra keys, accessors, custom prototypes, and invalid measured numbers', () => {
    let accessorReads = 0;
    const accessorEvidence = { ...measuredPass };
    Object.defineProperty(accessorEvidence, 'requestSha256', {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return provenance.requestSha256;
      },
    });
    const candidates: unknown[] = [
      { ...measuredPass, rawProviderResponse: 'secret' },
      accessorEvidence,
      Object.assign(Object.create({ inherited: true }), measuredPass),
      { ...measuredPass, candidateQualityScore: Number.NaN },
      { ...measuredPass, costRatio: -1 },
      { ...measuredPass, latencyRatio: Number.POSITIVE_INFINITY },
    ];

    for (const evidence of candidates) {
      expect(() => buildContentQualityV3RecordedRolloutCase(
        machineAssessment,
        evidence as never,
      )).toThrowError('INVALID_CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE');
    }
    expect(accessorReads).toBe(0);
  });

  it('rejects malformed machine assessment input instead of trusting caller overrides', () => {
    const invalidMachineAssessments: unknown[] = [
      { ...machineAssessment, extra: true },
      { ...machineAssessment, criticalHallucinationCount: -1 },
      { ...machineAssessment, schemaValid: 'true' },
      Object.assign(Object.create({ inherited: true }), machineAssessment),
    ];

    for (const assessment of invalidMachineAssessments) {
      expect(() => buildContentQualityV3RecordedRolloutCase(
        assessment as never,
        measuredPass,
      )).toThrowError('INVALID_CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE');
    }
  });
});
