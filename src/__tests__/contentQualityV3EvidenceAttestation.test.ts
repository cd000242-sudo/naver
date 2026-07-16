import { describe, expect, it, vi } from 'vitest';

import {
  APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256,
  CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
  CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
  CONTENT_QUALITY_V3_EVIDENCE_MODEL,
  CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
  computeContentQualityV3EvidenceArtifactSha256,
  evaluateContentQualityV3EvidenceAttestation as evaluateEvidenceAttestation,
  type ContentQualityV3CanonicalEvidence,
  type ContentQualityV3EvidenceAttestation,
  type ContentQualityV3EvidenceAttestationMetadata,
} from '../contentQualityV3/evidenceAttestation.js';
import { getCurrentContentQualityV3EvidenceBindings } from '../contentQualityV3/currentEvidenceBindings.js';
import { CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 } from '../contentQualityV3/candidateRuntimeFingerprint.js';

const RAW_EVIDENCE_PACKAGE_SHA256 = '9'.repeat(64);

function evaluateContentQualityV3EvidenceAttestation(
  value: unknown,
  recordedEvidence: ContentQualityV3CanonicalEvidence,
  expectedRunId: string | undefined,
) {
  return evaluateEvidenceAttestation(
    value,
    recordedEvidence,
    expectedRunId,
    RAW_EVIDENCE_PACKAGE_SHA256,
  );
}

function metadata(
  overrides: Partial<ContentQualityV3EvidenceAttestationMetadata> = {},
): ContentQualityV3EvidenceAttestationMetadata {
  return {
    schemaVersion: CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
    provider: CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
    model: CONTENT_QUALITY_V3_EVIDENCE_MODEL,
    locale: CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
    runId: 'run-1',
    rawEvidencePackageSha256: RAW_EVIDENCE_PACKAGE_SHA256,
    ...getCurrentContentQualityV3EvidenceBindings(),
    ...overrides,
  };
}

function evidence(): ContentQualityV3CanonicalEvidence {
  return {
    cases: [{ caseId: 'case-1', candidateQualityScore: 91 }],
    pairwiseJudgments: [{
      judgmentId: 'judgment-1',
      runId: 'run-1',
      verdict: 'CANDIDATE_WIN',
    }],
  };
}

function attestation(
  value = evidence(),
  pinned = metadata(),
): ContentQualityV3EvidenceAttestation {
  return {
    ...pinned,
    artifactSha256: computeContentQualityV3EvidenceArtifactSha256(value, pinned),
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

describe('Content Quality V3 evidence attestation', () => {
  it('uses deterministic key-sorted SHA-256 without mutating immutable evidence', () => {
    const first = deepFreeze(evidence());
    const reordered = deepFreeze<ContentQualityV3CanonicalEvidence>({
      cases: [{ candidateQualityScore: 91, caseId: 'case-1' }],
      pairwiseJudgments: [{
        verdict: 'CANDIDATE_WIN',
        runId: 'run-1',
        judgmentId: 'judgment-1',
      }],
    });
    const before = structuredClone(first);

    const firstDigest = computeContentQualityV3EvidenceArtifactSha256(first, metadata());
    const secondDigest = computeContentQualityV3EvidenceArtifactSha256(reordered, metadata());

    expect(firstDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(secondDigest).toBe(firstDigest);
    expect(first).toEqual(before);
    expect(CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION).toBe(2);
  });

  it('is fail-closed when missing and leaves self-consistent evidence unapproved', () => {
    const value = evidence();
    const missing = evaluateContentQualityV3EvidenceAttestation(undefined, value, 'run-1');
    const fabricated = evaluateContentQualityV3EvidenceAttestation(
      attestation(value),
      value,
      'run-1',
    );

    expect(missing).toEqual({ status: 'MISSING' });
    expect(fabricated).toEqual({ status: 'UNAPPROVED' });
    expect(Object.isFrozen(missing)).toBe(true);
    expect(Object.isFrozen(fabricated)).toBe(true);
    expect(APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256).toEqual([]);
    expect(Object.isFrozen(APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256)).toBe(true);
  });

  it('rejects self-consistent caller-declared artifact pins that do not match current artifacts', () => {
    const value = evidence();
    const callerPins = metadata({
      promptBundleSha256: '0'.repeat(64),
      outputSchemaSha256: '0'.repeat(64),
      corpusSha256: '0'.repeat(64),
      legacyBaselineSha256: '0'.repeat(64),
      candidateRuntimeSha256: '0'.repeat(64),
    });

    expect(evaluateContentQualityV3EvidenceAttestation(
      attestation(value, callerPins),
      value,
      'run-1',
    )).toEqual({ status: 'INVALID' });
  });

  it('requires the attested raw evidence package digest to match a separately verified package', () => {
    const value = evidence();
    const candidate = attestation(value);

    expect(evaluateEvidenceAttestation(
      candidate,
      value,
      'run-1',
      undefined,
    )).toEqual({ status: 'INVALID' });
    expect(evaluateEvidenceAttestation(
      candidate,
      value,
      'run-1',
      '8'.repeat(64),
    )).toEqual({ status: 'INVALID' });
    expect(evaluateEvidenceAttestation(
      candidate,
      value,
      'run-1',
      RAW_EVIDENCE_PACKAGE_SHA256,
    )).toEqual({ status: 'UNAPPROVED' });
  });

  it('caches one immutable current-artifact identity and rejects each stale pin', () => {
    const current = getCurrentContentQualityV3EvidenceBindings();
    const value = evidence();

    expect(getCurrentContentQualityV3EvidenceBindings()).toBe(current);
    expect(Object.isFrozen(current)).toBe(true);
    expect(current).toEqual({
      promptBundleSha256:
        '286dfd8d550a989ca4be471659da7427518f1c8675fec1a66bb713faf9945378',
      outputSchemaSha256:
        'd2a8e746c86950e548e63f5eff7cbe00a9fc1dbf8a057b12ed7a1d36c8b07cd4',
      corpusSha256:
        'cf1721af51303263182a38f7618f5431f4534858c5a9655c33fa90c61abf33f0',
      legacyBaselineSha256:
        'b1a96225acc6208106fa0395ef5e30d2f9b6d3c37e805769818bf56bb01763e7',
      candidateRuntimeSha256: CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256,
    });

    for (const key of [
      'promptBundleSha256',
      'outputSchemaSha256',
      'corpusSha256',
      'legacyBaselineSha256',
      'candidateRuntimeSha256',
    ] as const) {
      const stale = metadata({ [key]: 'f'.repeat(64) });
      expect(evaluateContentQualityV3EvidenceAttestation(
        attestation(value, stale),
        value,
        'run-1',
      )).toEqual({ status: 'INVALID' });
    }
  });

  it('fails closed when the raw legacy baseline cannot be loaded', async () => {
    const value = evidence();
    const candidate = attestation(value);
    vi.resetModules();
    vi.doMock('node:fs', () => ({
      readFileSync: () => {
        throw new Error('baseline unavailable');
      },
    }));

    try {
      const freshModule = await import('../contentQualityV3/evidenceAttestation.js');
      expect(freshModule.evaluateContentQualityV3EvidenceAttestation(
        candidate,
        value,
        'run-1',
        RAW_EVIDENCE_PACKAGE_SHA256,
      )).toEqual({ status: 'INVALID' });
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('detects evidence tampering and rejects stale current-artifact pins', () => {
    const originalEvidence = evidence();
    const originalAttestation = attestation(originalEvidence);
    const tamperedMetric: ContentQualityV3CanonicalEvidence = {
      ...originalEvidence,
      cases: [{ caseId: 'case-1', candidateQualityScore: 92 }],
    };
    const tamperedVerdict: ContentQualityV3CanonicalEvidence = {
      ...originalEvidence,
      pairwiseJudgments: [{
        judgmentId: 'judgment-1',
        runId: 'run-1',
        verdict: 'LEGACY_WIN',
      }],
    };
    const tamperedMetadata = {
      ...originalAttestation,
      corpusSha256: '5'.repeat(64),
    };
    const tamperedRunEvidence: ContentQualityV3CanonicalEvidence = {
      ...originalEvidence,
      pairwiseJudgments: [{
        judgmentId: 'judgment-1',
        runId: 'run-2',
        verdict: 'CANDIDATE_WIN',
      }],
    };
    const tamperedRunAttestation = {
      ...originalAttestation,
      runId: 'run-2',
    };

    for (const [candidate, candidateEvidence, runId] of [
      [originalAttestation, tamperedMetric, 'run-1'],
      [originalAttestation, tamperedVerdict, 'run-1'],
      [tamperedRunAttestation, tamperedRunEvidence, 'run-2'],
    ] as const) {
      expect(evaluateContentQualityV3EvidenceAttestation(
        candidate,
        candidateEvidence,
        runId,
      )).toEqual({ status: 'DIGEST_MISMATCH' });
    }

    expect(evaluateContentQualityV3EvidenceAttestation(
      tamperedMetadata,
      originalEvidence,
      'run-1',
    )).toEqual({ status: 'INVALID' });
  });

  it('rejects run replay against a different recorded run before approval', () => {
    const originalEvidence = evidence();
    const originalAttestation = attestation(originalEvidence);
    const replayedEvidence: ContentQualityV3CanonicalEvidence = {
      cases: [{ caseId: 'case-replayed', candidateQualityScore: 91 }],
      pairwiseJudgments: originalEvidence.pairwiseJudgments,
    };

    expect(evaluateContentQualityV3EvidenceAttestation(
      originalAttestation,
      replayedEvidence,
      'run-1',
    )).toEqual({ status: 'DIGEST_MISMATCH' });
    expect(evaluateContentQualityV3EvidenceAttestation(
      { ...originalAttestation, runId: 'run-2' },
      originalEvidence,
      'run-1',
    )).toEqual({ status: 'INVALID' });
  });

  it('rejects extra keys, accessors, custom prototypes, proxies, and invalid pinned metadata', () => {
    const value = evidence();
    const valid = attestation(value);
    let accessorReads = 0;
    const accessor = { ...valid };
    Object.defineProperty(accessor, 'artifactSha256', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return valid.artifactSha256;
      },
    });
    const customPrototype = Object.assign(Object.create({ inherited: true }), valid);
    const hostileProxy = new Proxy({ ...valid }, {
      ownKeys: () => {
        throw new Error('hostile ownKeys trap');
      },
    });
    const invalidValues: unknown[] = [
      null,
      { ...valid, extra: true },
      accessor,
      customPrototype,
      hostileProxy,
      { ...valid, schemaVersion: 1 },
      { ...valid, provider: 'openai' },
      { ...valid, model: 'gemini-3.5-flash' },
      { ...valid, locale: 'en-US' },
      { ...valid, runId: '' },
      { ...valid, promptBundleSha256: 'A'.repeat(64) },
      { ...valid, candidateRuntimeSha256: 'A'.repeat(64) },
      { ...valid, rawEvidencePackageSha256: 'A'.repeat(64) },
      { ...valid, artifactSha256: 'not-a-sha256' },
    ];

    for (const invalidValue of invalidValues) {
      expect(evaluateContentQualityV3EvidenceAttestation(
        invalidValue,
        value,
        'run-1',
      )).toEqual({ status: 'INVALID' });
    }
    expect(accessorReads).toBe(0);
  });

  it('bounds direct canonicalization arrays, strings, and own keys against memory abuse', () => {
    const oversizedArray = new Array(50_001);
    const oversizedString = 'x'.repeat(4_097);
    const excessiveKeys = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`key${index}`, index]),
    );
    const sparseArray = new Array(1);
    const extraKeyArray = [{}] as unknown[] & { extra?: true };
    extraKeyArray.extra = true;
    const customPrototypeArray: unknown[] = [{}];
    Object.setPrototypeOf(customPrototypeArray, Object.create(Array.prototype));
    let excessiveDepth: Record<string, unknown> = { value: 'leaf' };
    for (let depth = 0; depth < 20; depth += 1) {
      excessiveDepth = { nested: excessiveDepth };
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const cases of [
      oversizedArray,
      [{ value: oversizedString }],
      [excessiveKeys],
      sparseArray,
      extraKeyArray,
      customPrototypeArray,
      [excessiveDepth],
      [cyclic],
    ]) {
      expect(() => computeContentQualityV3EvidenceArtifactSha256(
        { cases, pairwiseJudgments: [] },
        metadata(),
      )).toThrow('INVALID_EVIDENCE_ATTESTATION');
    }
  });

  it('rejects hostile direct evidence containers without invoking accessors', () => {
    let accessorReads = 0;
    const accessorEvidence = { pairwiseJudgments: [] } as Record<string, unknown>;
    Object.defineProperty(accessorEvidence, 'cases', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return [];
      },
    });
    const extraEvidence = { cases: [], pairwiseJudgments: [], extra: true };
    const customPrototypeEvidence = Object.assign(
      Object.create({ inherited: true }),
      { cases: [], pairwiseJudgments: [] },
    );

    for (const candidate of [accessorEvidence, extraEvidence, customPrototypeEvidence]) {
      expect(() => computeContentQualityV3EvidenceArtifactSha256(
        candidate as unknown as ContentQualityV3CanonicalEvidence,
        metadata(),
      )).toThrow('INVALID_EVIDENCE_ATTESTATION');
    }
    expect(accessorReads).toBe(0);
  });

  it('does not accept environment, config-shaped, or extra-argument approval overrides', () => {
    const value = evidence();
    const fabricated = attestation(value);
    const envKey = 'CONTENT_QUALITY_V3_APPROVED_ARTIFACT_SHA256';
    const previous = process.env[envKey];
    process.env[envKey] = fabricated.artifactSha256;
    const invokeWithOverride = evaluateContentQualityV3EvidenceAttestation as unknown as (
      attestationValue: unknown,
      evidenceValue: ContentQualityV3CanonicalEvidence,
      expectedRunId: string,
      ignoredApprovalOverride: unknown,
    ) => ReturnType<typeof evaluateContentQualityV3EvidenceAttestation>;

    try {
      expect(invokeWithOverride(
        fabricated,
        value,
        'run-1',
        { approvedArtifactSha256: [fabricated.artifactSha256] },
      )).toEqual({ status: 'UNAPPROVED' });
    } finally {
      if (previous === undefined) delete process.env[envKey];
      else process.env[envKey] = previous;
    }
  });
});
