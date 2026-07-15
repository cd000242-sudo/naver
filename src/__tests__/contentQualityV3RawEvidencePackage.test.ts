import { describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_SCHEMA_VERSION,
  buildContentQualityV3RawEvidencePackage,
  validateContentQualityV3RawEvidencePackage,
  type ContentQualityV3RawEvidenceCallBytesInput,
} from '../contentQualityV3/rawEvidencePackage.js';

function bytes(value: string): Uint8Array {
  return Buffer.from(value, 'utf8');
}

function rawCall(
  label: string,
  overrides: Partial<ContentQualityV3RawEvidenceCallBytesInput> = {},
): ContentQualityV3RawEvidenceCallBytesInput {
  return Object.freeze({
    attempt: 0,
    reason: 'INITIAL',
    outcome: 'SUCCESS',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    requestBytes: bytes(`request:${label}`),
    responseBytes: bytes(`response:${label}`),
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 100,
    backoffMsBefore: 0,
    ...overrides,
  });
}

function rawRun(
  label: string,
  overrides: Readonly<{
    calls?: readonly ContentQualityV3RawEvidenceCallBytesInput[];
    finalOutputBytes?: Uint8Array;
  }> = {},
) {
  return Object.freeze({
    calls: overrides.calls ?? Object.freeze([rawCall(label)]),
    finalOutputBytes: overrides.finalOutputBytes ?? bytes(`final:${label}`),
  });
}

function rawCase(caseId: string) {
  return Object.freeze({
    caseId,
    candidateRun: rawRun(`candidate:${caseId}`),
    legacyRun: rawRun(`legacy:${caseId}`, {
      calls: Object.freeze([rawCall(`legacy:${caseId}`, {
        inputTokens: 200,
        outputTokens: 100,
        latencyMs: 200,
      })]),
    }),
  });
}

describe('Content Quality V3 raw evidence package', () => {
  it('builds immutable candidate/legacy ledgers and derives cost/latency ratios', () => {
    const result = buildContentQualityV3RawEvidencePackage([
      rawCase('case-b'),
      rawCase('case-a'),
    ]);

    expect(CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_SCHEMA_VERSION).toBe(2);
    expect(result.schemaVersion).toBe(2);
    expect(result.cases.map(item => item.caseId)).toEqual(['case-a', 'case-b']);
    expect(result.cases[0]).toMatchObject({
      costRatio: 0.5,
      latencyRatio: 0.5,
      candidateOutputSha256: result.cases[0].candidateRun.finalOutputSha256,
      legacyOutputSha256: result.cases[0].legacyRun.finalOutputSha256,
      requestSha256: result.cases[0].candidateRun.requestLedgerSha256,
      providerResponseSha256: result.cases[0].candidateRun.responseLedgerSha256,
    });
    expect(result.cases[0].candidateRun).toMatchObject({
      totalCostNanoUsd: 100 * 250 + 50 * 1_500,
      totalElapsedMs: 100,
    });
    expect(result.cases[0].candidateRun.calls[0]).toMatchObject({
      attempt: 0,
      reason: 'INITIAL',
      outcome: 'SUCCESS',
      costNanoUsd: 100 * 250 + 50 * 1_500,
    });
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cases)).toBe(true);
    expect(Object.isFrozen(result.cases[0])).toBe(true);
    expect(Object.isFrozen(result.cases[0].candidateRun)).toBe(true);
    expect(Object.isFrozen(result.cases[0].candidateRun.calls)).toBe(true);
    expect(Object.isFrozen(result.cases[0].candidateRun.calls[0])).toBe(true);
    expect(validateContentQualityV3RawEvidencePackage(result)).toEqual(result);
  });

  it('uses code-unit case ordering and remains stable across input order', () => {
    const first = buildContentQualityV3RawEvidencePackage([
      rawCase('case-a'),
      rawCase('case-A'),
    ]);
    const reordered = buildContentQualityV3RawEvidencePackage([
      rawCase('case-A'),
      rawCase('case-a'),
    ]);

    expect(first.cases.map(item => item.caseId)).toEqual(['case-A', 'case-a']);
    expect(reordered.manifestSha256).toBe(first.manifestSha256);
  });

  it.each([
    ['candidate request', 'candidateRun', 'requestBase64'],
    ['candidate response', 'candidateRun', 'responseBase64'],
    ['legacy request', 'legacyRun', 'requestBase64'],
    ['legacy response', 'legacyRun', 'responseBase64'],
  ] as const)('rejects altered %s bytes even when recorded hashes stay fixed', (
    _label,
    runField,
    byteField,
  ) => {
    const original = buildContentQualityV3RawEvidencePackage([rawCase('case-a')]);
    const evidenceCase = original.cases[0];
    const run = evidenceCase[runField];
    const tampered = {
      ...original,
      cases: [{
        ...evidenceCase,
        [runField]: {
          ...run,
          calls: [{
            ...run.calls[0],
            [byteField]: Buffer.from(`tampered:${byteField}`, 'utf8').toString('base64'),
          }],
        },
      }],
    };

    expect(() => validateContentQualityV3RawEvidencePackage(tampered))
      .toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');
  });

  it('rejects altered final output and stale derived ledger/package fields', () => {
    const original = buildContentQualityV3RawEvidencePackage([rawCase('case-a')]);
    const evidenceCase = original.cases[0];
    const candidates: unknown[] = [
      {
        ...original,
        cases: [{
          ...evidenceCase,
          candidateRun: {
            ...evidenceCase.candidateRun,
            finalOutputBase64: bytes('tampered').toString('base64'),
          },
        }],
      },
      {
        ...original,
        cases: [{ ...evidenceCase, costRatio: 0.1 }],
      },
      {
        ...original,
        cases: [{
          ...evidenceCase,
          candidateRun: { ...evidenceCase.candidateRun, totalElapsedMs: 999 },
        }],
      },
      { ...original, manifestSha256: 'f'.repeat(64) },
      { ...original, extra: true },
    ];

    for (const candidate of candidates) {
      expect(() => validateContentQualityV3RawEvidencePackage(candidate))
        .toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');
    }
  });

  it('requires one deterministic candidate call and a contiguous ordered legacy ledger', () => {
    const retry = rawCall('legacy-retry', {
      attempt: 1,
      reason: 'NETWORK_RETRY',
      backoffMsBefore: 250,
    });
    const validRetried = buildContentQualityV3RawEvidencePackage([{
      ...rawCase('case-a'),
      legacyRun: rawRun('legacy:case-a', {
        calls: Object.freeze([
          rawCall('legacy-initial', {
            outcome: 'INFRA_EXTERNAL',
            responseBytes: new Uint8Array(),
            inputTokens: 0,
            outputTokens: 0,
          }),
          retry,
        ]),
      }),
    }]);

    expect(validRetried.cases[0].legacyRun.calls).toHaveLength(2);
    expect(validRetried.cases[0].legacyRun.totalElapsedMs).toBe(450);
    expect(() => buildContentQualityV3RawEvidencePackage([{
      ...rawCase('case-a'),
      candidateRun: rawRun('candidate:case-a', {
        calls: Object.freeze([
          rawCall('candidate:case-a'),
          rawCall('candidate:retry', { attempt: 1, reason: 'NETWORK_RETRY' }),
        ]),
      }),
    }])).toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');
    expect(() => buildContentQualityV3RawEvidencePackage([{
      ...rawCase('case-a'),
      legacyRun: rawRun('legacy:case-a', {
        calls: Object.freeze([
          rawCall('legacy-initial', { outcome: 'PRODUCT_REJECTED' }),
          rawCall('legacy-retry', { attempt: 2, reason: 'QUALITY_RETRY' }),
        ]),
      }),
    }])).toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');
  });

  it('rejects empty final output, unbounded blobs, duplicate IDs, and accessors', () => {
    expect(() => buildContentQualityV3RawEvidencePackage([{
      ...rawCase('case-a'),
      candidateRun: rawRun('candidate:case-a', { finalOutputBytes: new Uint8Array() }),
    }])).toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');
    expect(() => buildContentQualityV3RawEvidencePackage([
      rawCase('case-a'),
      rawCase('case-a'),
    ])).toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');

    let accessorReads = 0;
    const original = buildContentQualityV3RawEvidencePackage([rawCase('case-a')]);
    const accessorCall = { ...original.cases[0].candidateRun.calls[0] };
    Object.defineProperty(accessorCall, 'requestBase64', {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return original.cases[0].candidateRun.calls[0].requestBase64;
      },
    });

    expect(() => validateContentQualityV3RawEvidencePackage({
      ...original,
      cases: [{
        ...original.cases[0],
        candidateRun: {
          ...original.cases[0].candidateRun,
          calls: [accessorCall],
        },
      }],
    })).toThrowError('INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE');
    expect(accessorReads).toBe(0);
  });
});
