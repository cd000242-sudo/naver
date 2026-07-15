import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROLLOUT_GATE_POLICY,
  KOREAN_PAIRWISE_EVIDENCE_PROTOCOL,
  evaluateContentQualityV3Rollout,
  type KoreanPairwiseJudgment,
  type RolloutCaseMetrics,
  type RolloutGateInput,
} from '../contentQualityV3/rolloutGate.js';
import { CONTENT_QUALITY_V3_RELEASE_CORPUS } from '../contentQualityV3/evalCorpus.js';
import type { ContentQualityV3EvalCase } from '../contentQualityV3/evalCorpusTypes.js';
import {
  buildContentQualityV3ExpectedRequestBytes,
  deriveContentQualityV3CandidateEvidence,
} from '../contentQualityV3/evaluationEvidenceContract.js';
import {
  APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256,
  CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
  CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
  CONTENT_QUALITY_V3_EVIDENCE_MODEL,
  CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
  computeContentQualityV3EvidenceArtifactSha256,
  type ContentQualityV3EvidenceAttestationMetadata,
} from '../contentQualityV3/evidenceAttestation.js';
import { getCurrentContentQualityV3EvidenceBindings } from '../contentQualityV3/currentEvidenceBindings.js';
import { computeContentQualityV3OrderedPairSha256 } from '../contentQualityV3/pairwiseEvidence.js';
import {
  buildContentQualityV3RawEvidencePackage,
  type ContentQualityV3RawEvidenceBytesInput,
  type ContentQualityV3RawEvidencePackage,
} from '../contentQualityV3/rawEvidencePackage.js';
import { resolveContentQualityV3TitleContract } from '../contentQualityV3/titleContract.js';

const DEFAULT_STRATA = ['seo', 'homefeed', 'affiliate', 'business', 'mate'] as const;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function makeCase(
  index: number,
  overrides: Partial<RolloutCaseMetrics> = {},
): RolloutCaseMetrics {
  const stratum = DEFAULT_STRATA[index % DEFAULT_STRATA.length];
  return {
    caseId: `case-${index}`,
    stratum,
    disposition: 'PASS',
    schemaValid: true,
    publishable: true,
    criticalHallucinationCount: 0,
    fakeFirstPersonCount: 0,
    unsupportedCurrentNumberCount: 0,
    candidateQualityScore: 91,
    legacyQualityScore: 90,
    costRatio: 0.8,
    latencyRatio: 0.9,
    candidateOutputSha256: sha256(`candidate-output:${index}`),
    legacyOutputSha256: sha256(`legacy-output:${index}`),
    requestSha256: sha256(`request:${index}`),
    providerResponseSha256: sha256(`provider-response:${index}`),
    ...overrides,
  } as RolloutCaseMetrics;
}

function makeBalancedCases(): RolloutCaseMetrics[] {
  return CONTENT_QUALITY_V3_RELEASE_CORPUS.map((item, index) => makeCase(index, {
    caseId: item.caseId,
    stratum: item.stratum,
  }));
}

function makeProviderOutput(evalCase: ContentQualityV3EvalCase) {
  const titleContract = resolveContentQualityV3TitleContract(evalCase.source);
  const selectedTitle = titleContract?.expectedTitle
    ?? `${evalCase.primaryKeyword}: 판단 기준`;
  const businessInfo = evalCase.source.businessInfo;
  const businessValues = businessInfo && typeof businessInfo === 'object'
    ? Object.values(businessInfo).filter((value): value is string => typeof value === 'string')
    : [];
  const requiredEvidence = [
    ...evalCase.expectations.requiredExactLiterals,
    ...(evalCase.stratum === 'business' ? businessValues : []),
  ].join(' | ');
  const reviewAttribution = Array.isArray(evalCase.source.productReviews)
    && evalCase.source.productReviews.length > 0
    ? '구매자 후기에서 확인되는 의견은 구매자 경험으로만 구분합니다. '
    : '';
  const safeSentence = `${reviewAttribution}제공된 자료의 조건을 기준으로 선택 범위를 설명합니다. 다만 맞지 않는 조건도 함께 확인해야 합니다. `;
  let bodyPlain = `${requiredEvidence} ${safeSentence}`.trim();
  while (bodyPlain.length < evalCase.minChars + 100) bodyPlain += ` ${safeSentence}`;
  const headingCount = evalCase.stratum === 'business' ? 5 : 3;

  return {
    status: 'success',
    generationTime: 'recorded',
    selectedTitle,
    titleAlternatives: [`${evalCase.primaryKeyword}: 근거 확인`],
    titleCandidates: [{ text: selectedTitle, score: 90, reasoning: 'source-backed' }],
    bodyHtml: '',
    bodyPlain,
    headings: Array.from({ length: headingCount }, (_, index) => ({
      title: index === headingCount - 1 && evalCase.stratum === 'business'
        ? '문의 전 확인할 조건'
        : `선택 기준 ${index + 1}`,
      content: '제공된 자료 범위의 설명',
      summary: '근거와 적용 범위를 확인합니다.',
      keywords: [evalCase.primaryKeyword],
      imagePrompt: '',
    })),
    hashtags: [`#${evalCase.primaryKeyword.replace(/\s+/gu, '')}`],
    images: [],
    metadata: {
      category: evalCase.stratum,
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: 'short',
      wordCount: bodyPlain.length,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: 'source-backed',
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      originalityScore: 90,
      readabilityScore: 90,
      warnings: [],
    },
  };
}

function makeJudgments(
  cases: readonly RolloutCaseMetrics[],
  count = 200,
  verdict: KoreanPairwiseJudgment['verdict'] = 'CANDIDATE_WIN',
): KoreanPairwiseJudgment[] {
  const passed = cases.filter(item => item.disposition === 'PASS');
  const activeStrata = DEFAULT_STRATA.filter(stratum => (
    passed.some(item => item.stratum === stratum)
  ));
  const occurrences = new Map<string, number>();

  return Array.from({ length: count }, (_, index) => {
    const stratum = activeStrata[index % activeStrata.length];
    const stratumCases = passed.filter(item => item.stratum === stratum);
    const occurrence = occurrences.get(stratum) ?? 0;
    occurrences.set(stratum, occurrence + 1);
    const caseIndex = occurrence % stratumCases.length;
    const round = Math.floor(occurrence / stratumCases.length);
    const basePosition = caseIndex % 2 === 0 ? 'A' as const : 'B' as const;
    const candidatePosition = round % 2 === 0
      ? basePosition
      : basePosition === 'A' ? 'B' as const : 'A' as const;

    const evalCase = stratumCases[caseIndex];
    return {
      judgmentId: `judgment-${index}`,
      caseId: evalCase.caseId,
      locale: 'ko-KR' as const,
      verdict,
      raterId: `rater-${index % 4}`,
      runId: 'release-run-1',
      blindAssignmentId: `blind-assignment-${index}`,
      blinded: true as const,
      candidatePosition,
      orderedPairSha256: computeContentQualityV3OrderedPairSha256({
        caseId: evalCase.caseId,
        candidateOutputSha256: evalCase.candidateOutputSha256,
        legacyOutputSha256: evalCase.legacyOutputSha256,
        requestSha256: evalCase.requestSha256,
        providerResponseSha256: evalCase.providerResponseSha256,
        candidatePosition,
      }),
      assignmentProvenance: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.assignmentProvenance,
      evaluatorProvenance: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.evaluatorProvenance,
    };
  });
}

function makeRawEvidencePackage(
  cases: readonly RolloutCaseMetrics[],
): ContentQualityV3RawEvidencePackage {
  const evalByCaseId = new Map(CONTENT_QUALITY_V3_RELEASE_CORPUS.map(item => (
    [item.caseId, item] as const
  )));
  return buildContentQualityV3RawEvidencePackage(cases.map((item, index) => {
    const evalCase = evalByCaseId.get(item.caseId);
    if (!evalCase) throw new Error(`missing eval case: ${item.caseId}`);
    const responseBytes = Buffer.from(JSON.stringify(makeProviderOutput(evalCase)), 'utf8');
    const derived = deriveContentQualityV3CandidateEvidence(evalCase, responseBytes);
    if (!derived.assessment.passed) {
      throw new Error(`unsafe fixture ${item.caseId}: ${derived.assessment.issueCodes.join(',')}`);
    }
    return {
      caseId: item.caseId,
      candidateRun: {
      calls: [{
        attempt: 0,
        reason: 'INITIAL',
        outcome: 'SUCCESS',
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        requestBytes: buildContentQualityV3ExpectedRequestBytes(evalCase),
        responseBytes,
        inputTokens: 8_000,
        outputTokens: 4_000,
        latencyMs: 90,
        backoffMsBefore: 0,
      }],
      finalOutputBytes: derived.candidateOutputBytes,
    },
    legacyRun: {
      calls: [{
        attempt: 0,
        reason: 'INITIAL',
        outcome: 'SUCCESS',
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        requestBytes: Buffer.from(`legacy-request:${index}`, 'utf8'),
        responseBytes: Buffer.from(`legacy-provider-response:${index}`, 'utf8'),
        inputTokens: 10_000,
        outputTokens: 5_000,
        latencyMs: 100,
        backoffMsBefore: 0,
      }],
      finalOutputBytes: Buffer.from(`legacy-output:${index}`, 'utf8'),
      },
    };
  }));
}

function makePassingInput(): RolloutGateInput {
  const baseCases = makeBalancedCases();
  const rawEvidencePackage = makeRawEvidencePackage(baseCases);
  const rawByCaseId = new Map(rawEvidencePackage.cases.map(item => [item.caseId, item]));
  const cases = baseCases.map(item => {
    const raw = rawByCaseId.get(item.caseId);
    if (!raw) throw new Error(`missing raw evidence: ${item.caseId}`);
    return {
      ...item,
      candidateOutputSha256: raw.candidateOutputSha256,
      legacyOutputSha256: raw.legacyOutputSha256,
      requestSha256: raw.requestSha256,
      providerResponseSha256: raw.providerResponseSha256,
      costRatio: raw.costRatio,
      latencyRatio: raw.latencyRatio,
    };
  });
  return {
    cases,
    pairwiseJudgments: makeJudgments(cases),
    rawEvidencePackage,
  };
}

function rebuildRawEvidencePackage(
  rawEvidencePackage: ContentQualityV3RawEvidencePackage,
  replace: (
    item: ContentQualityV3RawEvidenceBytesInput,
    index: number,
  ) => ContentQualityV3RawEvidenceBytesInput,
): ContentQualityV3RawEvidencePackage {
  const inputs = rawEvidencePackage.cases.map((item, index) => replace({
    caseId: item.caseId,
    candidateRun: {
      calls: item.candidateRun.calls.map(call => ({
        attempt: call.attempt,
        reason: call.reason,
        outcome: call.outcome,
        provider: call.provider,
        model: call.model,
        requestBytes: Buffer.from(call.requestBase64, 'base64'),
        responseBytes: Buffer.from(call.responseBase64, 'base64'),
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        latencyMs: call.latencyMs,
        backoffMsBefore: call.backoffMsBefore,
      })),
      finalOutputBytes: Buffer.from(item.candidateRun.finalOutputBase64, 'base64'),
    },
    legacyRun: {
      calls: item.legacyRun.calls.map(call => ({
        attempt: call.attempt,
        reason: call.reason,
        outcome: call.outcome,
        provider: call.provider,
        model: call.model,
        requestBytes: Buffer.from(call.requestBase64, 'base64'),
        responseBytes: Buffer.from(call.responseBase64, 'base64'),
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        latencyMs: call.latencyMs,
        backoffMsBefore: call.backoffMsBefore,
      })),
      finalOutputBytes: Buffer.from(item.legacyRun.finalOutputBase64, 'base64'),
    },
  }, index));
  return buildContentQualityV3RawEvidencePackage(inputs);
}

function bindInputToRawEvidence(
  input: RolloutGateInput,
  rawEvidencePackage: ContentQualityV3RawEvidencePackage,
): RolloutGateInput {
  const rawByCaseId = new Map(rawEvidencePackage.cases.map(item => [item.caseId, item] as const));
  const cases = input.cases.map(item => {
    const raw = rawByCaseId.get(item.caseId);
    if (!raw) throw new Error(`missing raw evidence: ${item.caseId}`);
    return {
      ...item,
      candidateOutputSha256: raw.candidateOutputSha256,
      legacyOutputSha256: raw.legacyOutputSha256,
      requestSha256: raw.requestSha256,
      providerResponseSha256: raw.providerResponseSha256,
      costRatio: raw.costRatio,
      latencyRatio: raw.latencyRatio,
    };
  });
  return {
    cases,
    pairwiseJudgments: makeJudgments(cases),
    rawEvidencePackage,
  };
}

function makeEvidenceMetadata(
  rawEvidencePackageSha256: string,
  overrides: Partial<ContentQualityV3EvidenceAttestationMetadata> = {},
): ContentQualityV3EvidenceAttestationMetadata {
  return {
    schemaVersion: CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
    provider: CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
    model: CONTENT_QUALITY_V3_EVIDENCE_MODEL,
    locale: CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
    runId: 'release-run-1',
    rawEvidencePackageSha256,
    ...getCurrentContentQualityV3EvidenceBindings(),
    ...overrides,
  };
}

function attestInput(
  input: RolloutGateInput,
  metadata = makeEvidenceMetadata(input.rawEvidencePackage?.manifestSha256 ?? '0'.repeat(64)),
): RolloutGateInput {
  return {
    ...input,
    evidenceAttestation: {
      ...metadata,
      artifactSha256: computeContentQualityV3EvidenceArtifactSha256({
        cases: input.cases,
        pairwiseJudgments: input.pairwiseJudgments,
      }, metadata),
    },
  };
}

function replaceCase(
  input: RolloutGateInput,
  index: number,
  overrides: Partial<RolloutCaseMetrics>,
): RolloutGateInput {
  const cases = input.cases.map((item, itemIndex) => (
    itemIndex === index ? { ...item, ...overrides } as RolloutCaseMetrics : item
  ));
  return {
    cases,
    pairwiseJudgments: makeJudgments(cases),
    rawEvidencePackage: input.rawEvidencePackage,
  };
}

function expectSanitized(result: ReturnType<typeof evaluateContentQualityV3Rollout>): void {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain('case-');
  expect(serialized).not.toContain('judgment-');
  expect(serialized).not.toContain('secret-output');
  expect(serialized).not.toContain('message');
  expect(serialized).not.toContain('error');
}

describe('Content Quality V3 rollout gate', () => {
  it('never promotes a perfect caller-supplied bundle without approved evidence', () => {
    const result = evaluateContentQualityV3Rollout(makePassingInput());

    expect(result.decision).toBe('INCOMPLETE');
    expect(result.reasonCodes).toEqual(['EVIDENCE_ATTESTATION_MISSING']);
    expect(result.aggregate.providerCases).toEqual({
      total: 120,
      completed: 120,
      pass: 120,
      productFail: 0,
      infraExternal: 0,
      notRun: 0,
      requiredCompleted: 120,
    });
    expect(result.aggregate.schemaPassRate).toBe(1);
    expect(result.aggregate.publishableRate).toBe(1);
    expect(result.aggregate.meanQualityDelta).toBe(1);
    expect(result.aggregate.medianCostRatio).toBe(0.8);
    expect(result.aggregate.p95LatencyRatio).toBe(0.9);
    expect(result.aggregate.koreanPairwise).toMatchObject({
      total: 200,
      required: 200,
      candidateWins: 200,
      ties: 0,
      legacyWins: 0,
      candidateWinRate: 1,
      tieRate: 0,
      winOrTieRate: 1,
      coveredCases: 120,
      requiredCases: 120,
      coveredStrata: 5,
      requiredStrata: 5,
      minimumJudgmentsPerCase: 1,
      maximumJudgmentsPerCase: 2,
      minimumJudgmentsPerStratum: 40,
      maximumJudgmentsPerStratum: 40,
      candidatePositionA: 100,
      candidatePositionB: 100,
      uniqueRaters: 4,
      uniqueRuns: 1,
      allBlinded: true,
      allocationBalanced: true,
      presentationOrderBalanced: true,
    });
    expect(result.aggregate.koreanPairwise.winOrTieWilsonLowerBound).toBeGreaterThan(0.98);
    expect(result.aggregate.strata).toEqual(DEFAULT_STRATA.map(stratum => ({
      stratum,
      completed: 24,
      requiredCompleted: 24,
    })));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.aggregate)).toBe(true);
    expect(Object.isFrozen(result.aggregate.providerCases)).toBe(true);
    expect(Object.isFrozen(result.aggregate.koreanPairwise)).toBe(true);
    expect(Object.isFrozen(result.aggregate.strata)).toBe(true);
    expect(Object.isFrozen(result.aggregate.strata[0])).toBe(true);
    expect(Object.isFrozen(result.reasonCodes)).toBe(true);
    expectSanitized(result);
  });

  it('requires the bounded raw evidence package before any pre-hashed case can promote', () => {
    const passing = makePassingInput();
    const { rawEvidencePackage: _rawEvidencePackage, ...withoutRawEvidence } = passing;
    const result = evaluateContentQualityV3Rollout(withoutRawEvidence);

    expect(result.decision).toBe('INCOMPLETE');
    expect(result.reasonCodes).toContain('RAW_EVIDENCE_PACKAGE_MISSING');
  });

  it.each([
    'candidateOutputBase64',
    'legacyOutputBase64',
    'requestBase64',
    'providerResponseBase64',
  ] as const)('blocks altered raw %s bytes before trusting caller hashes', field => {
    const passing = makePassingInput();
    const rawEvidencePackage = passing.rawEvidencePackage!;
    const result = evaluateContentQualityV3Rollout({
      ...passing,
      rawEvidencePackage: {
        ...rawEvidencePackage,
        cases: rawEvidencePackage.cases.map((item, index) => (
          index === 0
            ? { ...item, [field]: Buffer.from(`tampered:${field}`).toString('base64') }
            : item
        )),
      },
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('recomputes declared cost and latency ratios from both raw call ledgers', () => {
    const passing = makePassingInput();
    const result = evaluateContentQualityV3Rollout({
      ...passing,
      cases: passing.cases.map((item, index) => (
        index === 0
          ? { ...item, costRatio: 0.01, latencyRatio: 0.01 }
          : item
      )),
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('binds candidate evidence to the exact source-controlled request bytes', () => {
    const passing = makePassingInput();
    const rebuilt = rebuildRawEvidencePackage(
      passing.rawEvidencePackage!,
      (item, index) => index === 0
        ? {
            ...item,
            candidateRun: {
              ...item.candidateRun,
              calls: item.candidateRun.calls.map((call, callIndex) => callIndex === 0
                ? { ...call, requestBytes: Buffer.from('fabricated-request', 'utf8') }
                : call),
            },
          }
        : item,
    );

    const result = evaluateContentQualityV3Rollout(bindInputToRawEvidence(passing, rebuilt));

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('requires final candidate bytes to be derived from the recorded provider response', () => {
    const passing = makePassingInput();
    const rebuilt = rebuildRawEvidencePackage(
      passing.rawEvidencePackage!,
      (item, index) => {
        if (index !== 0) return item;
        const firstCall = item.candidateRun.calls[0];
        const providerOutput = JSON.parse(
          Buffer.from(firstCall.responseBytes).toString('utf8'),
        ) as ReturnType<typeof makeProviderOutput>;
        const alteredResponse = Buffer.from(JSON.stringify({
          ...providerOutput,
          metadata: {
            ...providerOutput.metadata,
            publishTimeRecommend: 'recorded-later',
          },
        }), 'utf8');
        return {
          ...item,
          candidateRun: {
            ...item.candidateRun,
            calls: item.candidateRun.calls.map((call, callIndex) => callIndex === 0
              ? { ...call, responseBytes: alteredResponse }
              : call),
          },
        };
      },
    );

    const result = evaluateContentQualityV3Rollout(bindInputToRawEvidence(passing, rebuilt));

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('rejects provider JSON that violates the native strict output schema', () => {
    const passing = makePassingInput();
    const rebuilt = rebuildRawEvidencePackage(
      passing.rawEvidencePackage!,
      (item, index) => {
        if (index !== 0) return item;
        const firstCall = item.candidateRun.calls[0];
        const providerOutput = JSON.parse(
          Buffer.from(firstCall.responseBytes).toString('utf8'),
        ) as ReturnType<typeof makeProviderOutput>;
        const strictInvalidResponse = Buffer.from(JSON.stringify({
          ...providerOutput,
          unexpectedProviderField: true,
        }), 'utf8');
        return {
          ...item,
          candidateRun: {
            ...item.candidateRun,
            calls: item.candidateRun.calls.map((call, callIndex) => callIndex === 0
              ? { ...call, responseBytes: strictInvalidResponse }
              : call),
          },
        };
      },
    );

    const result = evaluateContentQualityV3Rollout(bindInputToRawEvidence(passing, rebuilt));

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('rejects final candidate bytes that are not the canonical finalized output', () => {
    const passing = makePassingInput();
    const rebuilt = rebuildRawEvidencePackage(
      passing.rawEvidencePackage!,
      (item, index) => index === 0
        ? {
            ...item,
            candidateRun: {
              ...item.candidateRun,
              finalOutputBytes: Buffer.concat([
                Buffer.from(item.candidateRun.finalOutputBytes),
                Buffer.from('\n', 'utf8'),
              ]),
            },
          }
        : item,
    );

    const result = evaluateContentQualityV3Rollout(bindInputToRawEvidence(passing, rebuilt));

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('recomputes machine assessment fields instead of trusting declared PASS metrics', () => {
    const passing = makePassingInput();
    const result = evaluateContentQualityV3Rollout({
      ...passing,
      cases: passing.cases.map((item, index) => index === 0
        ? { ...item, criticalHallucinationCount: 1 }
        : item),
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
  });

  it('keeps a perfectly self-attested fabricated bundle incomplete until source review approves its digest', () => {
    const result = evaluateContentQualityV3Rollout(attestInput(makePassingInput()));

    expect(result.decision).toBe('INCOMPLETE');
    expect(result.reasonCodes).toEqual(['EVIDENCE_ARTIFACT_NOT_APPROVED']);
    expect(APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256).toEqual([]);
    expect(Object.isFrozen(APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256)).toBe(true);
  });

  it('blocks evidence tampering and rejects stale current-artifact pins', () => {
    const original = attestInput(makePassingInput());
    const metricTamper = {
      ...original,
      cases: original.cases.map((item, index) => (
        index === 0 ? { ...item, candidateQualityScore: 92 } : item
      )),
    };
    const verdictTamper = {
      ...original,
      pairwiseJudgments: original.pairwiseJudgments.map((item, index) => (
        index === 0 ? { ...item, verdict: 'TIE' as const } : item
      )),
    };
    const outputHashTamperCases = original.cases.map((item, index) => (
      index === 0 ? { ...item, candidateOutputSha256: sha256('tampered-output') } : item
    ));
    const outputHashTamperCase = outputHashTamperCases[0];
    const outputHashTamper = {
      ...original,
      cases: outputHashTamperCases,
      pairwiseJudgments: original.pairwiseJudgments.map(item => (
        item.caseId === outputHashTamperCase.caseId
          ? {
              ...item,
              orderedPairSha256: computeContentQualityV3OrderedPairSha256({
                caseId: outputHashTamperCase.caseId,
                candidateOutputSha256: outputHashTamperCase.candidateOutputSha256,
                legacyOutputSha256: outputHashTamperCase.legacyOutputSha256,
                requestSha256: outputHashTamperCase.requestSha256,
                providerResponseSha256: outputHashTamperCase.providerResponseSha256,
                candidatePosition: item.candidatePosition,
              }),
            }
          : item
      )),
    };
    const metadataTamper = {
      ...original,
      evidenceAttestation: {
        ...original.evidenceAttestation!,
        outputSchemaSha256: '5'.repeat(64),
      },
    };
    const runTamper = {
      ...original,
      pairwiseJudgments: original.pairwiseJudgments.map(item => ({
        ...item,
        runId: 'release-run-2',
      })),
      evidenceAttestation: {
        ...original.evidenceAttestation!,
        runId: 'release-run-2',
      },
    };

    for (const input of [metricTamper, verdictTamper, runTamper]) {
      const result = evaluateContentQualityV3Rollout(input);
      expect(result.decision).toBe('BLOCK');
      expect(result.reasonCodes).toContain('EVIDENCE_ARTIFACT_DIGEST_MISMATCH');
    }
    expect(evaluateContentQualityV3Rollout(outputHashTamper).reasonCodes)
      .toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);

    const stalePinResult = evaluateContentQualityV3Rollout(metadataTamper);
    expect(stalePinResult.decision).toBe('BLOCK');
    expect(stalePinResult.reasonCodes).toContain('INVALID_EVIDENCE_ATTESTATION');
  });

  it('blocks malformed attestation records without reading accessors', () => {
    const original = attestInput(makePassingInput());
    let accessorReads = 0;
    const accessor = { ...original.evidenceAttestation! };
    Object.defineProperty(accessor, 'artifactSha256', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return original.evidenceAttestation!.artifactSha256;
      },
    });
    const customPrototype = Object.assign(
      Object.create({ inherited: true }),
      original.evidenceAttestation,
    );
    const invalidAttestations: unknown[] = [
      { ...original.evidenceAttestation!, extra: true },
      accessor,
      customPrototype,
      { ...original.evidenceAttestation!, provider: 'openai' },
      { ...original.evidenceAttestation!, artifactSha256: '0'.repeat(63) },
    ];

    for (const evidenceAttestation of invalidAttestations) {
      const result = evaluateContentQualityV3Rollout({ ...original, evidenceAttestation });
      expect(result.decision).toBe('BLOCK');
      expect(result.reasonCodes).toContain('INVALID_EVIDENCE_ATTESTATION');
    }
    expect(accessorReads).toBe(0);
  });

  it('requires four strict lowercase SHA-256 provenance fields on every provider case', () => {
    const passing = makePassingInput();
    const provenanceKeys = [
      'candidateOutputSha256',
      'legacyOutputSha256',
      'requestSha256',
      'providerResponseSha256',
    ] as const;

    for (const key of provenanceKeys) {
      const missingCases = passing.cases.map((item, index) => {
        if (index !== 0) return item;
        const copy = { ...item } as Record<string, unknown>;
        delete copy[key];
        return copy;
      });
      const uppercaseCases = passing.cases.map((item, index) => (
        index === 0 ? { ...item, [key]: 'A'.repeat(64) } : item
      ));

      expect(evaluateContentQualityV3Rollout({
        cases: missingCases,
        pairwiseJudgments: passing.pairwiseJudgments,
      }).reasonCodes).toEqual(['INVALID_INPUT']);
      expect(evaluateContentQualityV3Rollout({
        cases: uppercaseCases,
        pairwiseJudgments: passing.pairwiseJudgments,
      }).reasonCodes).toEqual(['INVALID_INPUT']);
    }
  });

  it('recomputes every blinded ordered-pair hash from case provenance and candidate position', () => {
    const passing = makePassingInput();
    const firstCase = passing.cases[0];
    const driftedCaseHash = sha256('candidate-output:drifted');
    const caseHashTamper = {
      ...passing,
      cases: passing.cases.map((item, index) => (
        index === 0 ? { ...item, candidateOutputSha256: driftedCaseHash } : item
      )),
    };
    const positionTamper = {
      ...passing,
      pairwiseJudgments: passing.pairwiseJudgments.map((item, index) => (
        index === 0
          ? { ...item, candidatePosition: item.candidatePosition === 'A' ? 'B' as const : 'A' as const }
          : item
      )),
    };
    const orderedHashTamper = {
      ...passing,
      pairwiseJudgments: passing.pairwiseJudgments.map((item, index) => (
        index === 0 ? { ...item, orderedPairSha256: 'f'.repeat(64) } : item
      )),
    };
    const missingOrderedHash = {
      ...passing,
      pairwiseJudgments: passing.pairwiseJudgments.map((item, index) => {
        if (index !== 0) return item;
        const copy = { ...item } as Record<string, unknown>;
        delete copy.orderedPairSha256;
        return copy;
      }),
    };

    expect(firstCase.candidateOutputSha256).not.toBe(driftedCaseHash);
    expect(evaluateContentQualityV3Rollout(caseHashTamper).reasonCodes)
      .toEqual(['INVALID_RAW_EVIDENCE_PACKAGE']);
    for (const candidate of [positionTamper, orderedHashTamper, missingOrderedHash]) {
      expect(evaluateContentQualityV3Rollout(candidate).reasonCodes)
        .toEqual(['INVALID_KOREAN_PAIRWISE']);
    }
  });

  it('uses 120 completed cases and 200 Korean judgments as non-negotiable defaults', () => {
    const tooFewCases = makePassingInput();
    const cases119 = tooFewCases.cases.slice(0, 119);
    const caseResult = evaluateContentQualityV3Rollout({
      cases: cases119,
      pairwiseJudgments: makeJudgments(cases119),
    });

    expect(caseResult.decision).toBe('BLOCK');
    expect(caseResult.reasonCodes).toEqual(['RELEASE_CORPUS_MISMATCH']);

    const judgments199 = makePassingInput();
    const judgmentResult = evaluateContentQualityV3Rollout({
      ...judgments199,
      pairwiseJudgments: judgments199.pairwiseJudgments.slice(0, 199),
    });

    expect(judgmentResult.decision).toBe('INCOMPLETE');
    expect(judgmentResult.reasonCodes).toContain('INSUFFICIENT_KOREAN_PAIRWISE');
    expect(DEFAULT_ROLLOUT_GATE_POLICY.minimumCompletedCases).toBe(120);
    expect(DEFAULT_ROLLOUT_GATE_POLICY.minimumKoreanPairwiseJudgments).toBe(200);
    expect(Object.isFrozen(DEFAULT_ROLLOUT_GATE_POLICY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ROLLOUT_GATE_POLICY.requiredStrata)).toBe(true);
  });

  it('requires every default stratum and the per-stratum minimum', () => {
    const missing = makePassingInput();
    const withoutMate = missing.cases
      .filter(item => item.stratum !== 'mate')
      .concat(Array.from({ length: 24 }, (_, index) => makeCase(900 + index, { stratum: 'custom' })));
    const missingResult = evaluateContentQualityV3Rollout({
      cases: withoutMate,
      pairwiseJudgments: makeJudgments(withoutMate),
    });
    expect(missingResult.decision).toBe('BLOCK');
    expect(missingResult.reasonCodes).toEqual(['RELEASE_CORPUS_MISMATCH']);

    const short = makePassingInput();
    const oneMateMoved = short.cases.map((item, index) => (
      index === short.cases.length - 1 ? { ...item, stratum: 'custom' } : item
    ));
    const shortResult = evaluateContentQualityV3Rollout({
      cases: oneMateMoved,
      pairwiseJudgments: makeJudgments(oneMateMoved),
    });
    expect(shortResult.decision).toBe('BLOCK');
    expect(shortResult.reasonCodes).toEqual(['RELEASE_CORPUS_MISMATCH']);
  });

  it('binds promotion to the immutable release IDs and their exact strata', () => {
    const passing = makePassingInput();
    const fabricatedCases = passing.cases.map((item, index) => ({
      ...item,
      caseId: `fabricated-${index}`,
    }));
    const wrongStrata = passing.cases.map((item, index, cases) => {
      if (index === 0) return { ...item, stratum: cases[24].stratum };
      if (index === 24) return { ...item, stratum: cases[0].stratum };
      return item;
    });
    const extraCases = [
      ...passing.cases,
      makeCase(999, { caseId: 'seo:unexpected-release-case', stratum: 'seo' }),
    ];

    for (const cases of [fabricatedCases, wrongStrata, extraCases]) {
      const result = evaluateContentQualityV3Rollout({
        cases,
        pairwiseJudgments: makeJudgments(cases),
      });
      expect(result.decision).toBe('BLOCK');
      expect(result.reasonCodes).toEqual(['RELEASE_CORPUS_MISMATCH']);
    }
  });

  it.each([
    ['INFRA_EXTERNAL', 'INCOMPLETE', 'INFRA_EXTERNAL_PRESENT'],
    ['NOT_RUN', 'INCOMPLETE', 'NOT_RUN_PRESENT'],
  ] as const)('never counts %s as a successful provider case', (disposition, decision, reasonCode) => {
    const input = replaceCase(makePassingInput(), 0, { disposition } as Partial<RolloutCaseMetrics>);
    const result = evaluateContentQualityV3Rollout(input);

    expect(result.decision).toBe(decision);
    expect(result.reasonCodes).toContain(reasonCode);
    expect(result.aggregate.providerCases.pass).toBe(119);
    expect(result.aggregate.providerCases.completed).toBe(119);
  });

  it('blocks PRODUCT_FAIL even when incomplete infrastructure outcomes also exist', () => {
    const first = replaceCase(makePassingInput(), 0, { disposition: 'PRODUCT_FAIL' } as Partial<RolloutCaseMetrics>);
    const cases = first.cases.map((item, index) => (
      index === 1
        ? {
            caseId: item.caseId,
            stratum: item.stratum,
            disposition: 'INFRA_EXTERNAL' as const,
            candidateOutputSha256: item.candidateOutputSha256,
            legacyOutputSha256: item.legacyOutputSha256,
            requestSha256: item.requestSha256,
            providerResponseSha256: item.providerResponseSha256,
          }
        : item
    ));
    const result = evaluateContentQualityV3Rollout({ cases, pairwiseJudgments: makeJudgments(cases) });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toContain('PRODUCT_FAILURE_PRESENT');
    expect(result.reasonCodes).toContain('INFRA_EXTERNAL_PRESENT');
    expect(result.aggregate.providerCases).toMatchObject({
      completed: 119,
      pass: 118,
      productFail: 1,
      infraExternal: 1,
    });
  });

  it.each([
    ['schemaValid', false, 'SCHEMA_PASS_RATE_BELOW_100'],
    ['publishable', false, 'PUBLISHABLE_RATE_BELOW_100'],
    ['criticalHallucinationCount', 1, 'CRITICAL_HALLUCINATION_PRESENT'],
    ['fakeFirstPersonCount', 1, 'FAKE_FIRST_PERSON_PRESENT'],
    ['unsupportedCurrentNumberCount', 1, 'UNSUPPORTED_CURRENT_NUMBER_PRESENT'],
  ] as const)('blocks the zero-tolerance %s invariant', (key, value, reasonCode) => {
    const input = replaceCase(makePassingInput(), 0, { [key]: value });
    const result = evaluateContentQualityV3Rollout({
      cases: input.cases,
      pairwiseJudgments: input.pairwiseJudgments,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toContain(reasonCode);
  });

  it('requires non-degraded measured quality and human preference confidence', () => {
    const degraded = makePassingInput();
    const degradedCases = degraded.cases.map(item => ({
      ...item,
      candidateQualityScore: 89,
      legacyQualityScore: 90,
    }));
    const qualityResult = evaluateContentQualityV3Rollout({
      cases: degradedCases,
      pairwiseJudgments: makeJudgments(degradedCases),
    });
    expect(qualityResult.decision).toBe('BLOCK');
    expect(qualityResult.reasonCodes).toContain('QUALITY_DELTA_BELOW_MINIMUM');

    const human = makePassingInput();
    const splitJudgments = makeJudgments(human.cases).map((judgment, index) => ({
      ...judgment,
      verdict: index < 100 ? 'CANDIDATE_WIN' as const : 'LEGACY_WIN' as const,
    }));
    const humanResult = evaluateContentQualityV3Rollout({
      cases: human.cases,
      pairwiseJudgments: splitJudgments,
    });
    expect(humanResult.decision).toBe('BLOCK');
    expect(humanResult.aggregate.koreanPairwise.winOrTieRate).toBe(0.5);
    expect(humanResult.reasonCodes).not.toContain('HUMAN_WIN_OR_TIE_RATE_BELOW_MINIMUM');
    expect(humanResult.reasonCodes).toContain('HUMAN_WILSON_LOWER_BOUND_BELOW_MINIMUM');
  });

  it('strictly improves median cost and does not regress p95 latency', () => {
    const equalCost = makePassingInput();
    const equalCostCases = equalCost.cases.map(item => ({ ...item, costRatio: 1 }));
    const costResult = evaluateContentQualityV3Rollout({
      cases: equalCostCases,
      pairwiseJudgments: makeJudgments(equalCostCases),
    });
    expect(costResult.decision).toBe('BLOCK');
    expect(costResult.reasonCodes).toContain('MEDIAN_COST_RATIO_NOT_IMPROVED');

    const slow = makePassingInput();
    const slowCases = slow.cases.map(item => ({ ...item, latencyRatio: 1.001 }));
    const latencyResult = evaluateContentQualityV3Rollout({
      cases: slowCases,
      pairwiseJudgments: makeJudgments(slowCases),
    });
    expect(latencyResult.decision).toBe('BLOCK');
    expect(latencyResult.reasonCodes).toContain('P95_LATENCY_RATIO_ABOVE_MAXIMUM');
  });

  it('does not round away representable regressions or strict cost improvement', () => {
    const passing = makePassingInput();
    const tinyQualityRegression = passing.cases.map(item => ({
      ...item,
      candidateQualityScore: 90 - 1e-13,
      legacyQualityScore: 90,
    }));
    const qualityResult = evaluateContentQualityV3Rollout({
      cases: tinyQualityRegression,
      pairwiseJudgments: makeJudgments(tinyQualityRegression),
    });
    expect(qualityResult.decision).toBe('BLOCK');
    expect(qualityResult.reasonCodes).toContain('QUALITY_DELTA_BELOW_MINIMUM');

    const tinyCostImprovement = passing.cases.map(item => ({ ...item, costRatio: 1 - 1e-13 }));
    const costResult = evaluateContentQualityV3Rollout({
      cases: tinyCostImprovement,
      pairwiseJudgments: makeJudgments(tinyCostImprovement),
    });
    expect(costResult.decision).toBe('INCOMPLETE');
    expect(costResult.reasonCodes).toContain('EVIDENCE_ATTESTATION_MISSING');
    expect(costResult.aggregate.medianCostRatio).toBeLessThan(1);

    const tinyLatencyRegression = passing.cases.map(item => ({ ...item, latencyRatio: 1 + 1e-13 }));
    const latencyResult = evaluateContentQualityV3Rollout({
      cases: tinyLatencyRegression,
      pairwiseJudgments: makeJudgments(tinyLatencyRegression),
    });
    expect(latencyResult.decision).toBe('BLOCK');
    expect(latencyResult.reasonCodes).toContain('P95_LATENCY_RATIO_ABOVE_MAXIMUM');
  });

  it('calculates median and nearest-rank p95 from case metrics', () => {
    const passing = makePassingInput();
    const cases = passing.cases.map((item, index) => ({
      ...item,
      costRatio: index < 60 ? 0.6 : 0.8,
      latencyRatio: index < 113 ? 0.7 : index === 113 ? 0.95 : 1,
    }));
    const result = evaluateContentQualityV3Rollout({ cases, pairwiseJudgments: makeJudgments(cases) });

    expect(result.aggregate.medianCostRatio).toBe(0.7);
    expect(result.aggregate.p95LatencyRatio).toBe(0.95);
    expect(result.decision).toBe('INCOMPLETE');
    expect(result.reasonCodes).toContain('EVIDENCE_ATTESTATION_MISSING');
  });

  it('fails closed on duplicate case and judgment identifiers', () => {
    const duplicateCase = makePassingInput();
    const duplicateCases = duplicateCase.cases.map((item, index) => (
      index === 1 ? { ...item, caseId: duplicateCase.cases[0].caseId } : item
    ));
    const caseResult = evaluateContentQualityV3Rollout({
      cases: duplicateCases,
      pairwiseJudgments: duplicateCase.pairwiseJudgments,
    });
    expect(caseResult.decision).toBe('BLOCK');
    expect(caseResult.reasonCodes).toEqual(['DUPLICATE_CASE_ID']);
    expectSanitized(caseResult);

    const duplicateJudgment = makePassingInput();
    const duplicateJudgments = duplicateJudgment.pairwiseJudgments.map((item, index) => (
      index === 1 ? { ...item, judgmentId: duplicateJudgment.pairwiseJudgments[0].judgmentId } : item
    ));
    const judgmentResult = evaluateContentQualityV3Rollout({
      cases: duplicateJudgment.cases,
      pairwiseJudgments: duplicateJudgments,
    });
    expect(judgmentResult.decision).toBe('BLOCK');
    expect(judgmentResult.reasonCodes).toEqual(['DUPLICATE_JUDGMENT_ID']);
  });

  it('rejects custom array prototypes instead of dispatching attacker-controlled map methods', () => {
    const passing = makePassingInput();
    const forgedCases = passing.cases.map(item => ({
      ...item,
      criticalHallucinationCount: Number.NaN,
      fakeFirstPersonCount: Number.NaN,
      unsupportedCurrentNumberCount: Number.NaN,
      candidateQualityScore: Number.NaN,
      legacyQualityScore: Number.NaN,
      costRatio: Number.NaN,
      latencyRatio: Number.NaN,
    }));
    const cases = Array.from({ length: 120 }, () => null);
    Object.setPrototypeOf(cases, Object.assign(Object.create(Array.prototype), {
      map: () => forgedCases,
    }));

    const result = evaluateContentQualityV3Rollout({
      cases,
      pairwiseJudgments: passing.pairwiseJudgments,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toContain('INVALID_INPUT');
    expect(Number.isFinite(result.aggregate.meanQualityDelta ?? Number.NaN)).toBe(false);
  });

  it('fails closed on hostile proxies, accessors, sparse arrays, and extra array keys', () => {
    const passing = makePassingInput();
    let accessorReads = 0;
    const accessorCases = [...passing.cases];
    Object.defineProperty(accessorCases, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return passing.cases[0];
      },
    });
    const sparseCases = [...passing.cases];
    Reflect.deleteProperty(sparseCases, '0');
    const extraKeyCases = [...passing.cases] as RolloutCaseMetrics[] & { extra?: string };
    extraKeyCases.extra = 'not-an-index';
    const hostileProxyCases = new Proxy([...passing.cases], {
      ownKeys: () => {
        throw new Error('proxy trap must not escape');
      },
    });

    for (const cases of [accessorCases, sparseCases, extraKeyCases, hostileProxyCases]) {
      const result = evaluateContentQualityV3Rollout({
        cases,
        pairwiseJudgments: passing.pairwiseJudgments,
      });
      expect(result.decision).toBe('BLOCK');
      expect(result.reasonCodes).toEqual(['INVALID_INPUT']);
    }
    expect(accessorReads).toBe(0);
  });

  it('rejects 200 nominal judgments concentrated on one release case', () => {
    const passing = makePassingInput();
    const firstCase = passing.cases[0];
    const pairwiseJudgments = passing.pairwiseJudgments.map(item => ({
      ...item,
      caseId: firstCase.caseId,
      orderedPairSha256: computeContentQualityV3OrderedPairSha256({
        caseId: firstCase.caseId,
        candidateOutputSha256: firstCase.candidateOutputSha256,
        legacyOutputSha256: firstCase.legacyOutputSha256,
        requestSha256: firstCase.requestSha256,
        providerResponseSha256: firstCase.providerResponseSha256,
        candidatePosition: item.candidatePosition,
      }),
    }));

    const result = evaluateContentQualityV3Rollout({
      cases: passing.cases,
      pairwiseJudgments,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toContain('PAIRWISE_CASE_COVERAGE_MISMATCH');
  });

  it('requires blinded source-controlled pairwise assignment and evaluator provenance', () => {
    const passing = makePassingInput();
    const mutations = [
      { blinded: false },
      { candidatePosition: 'LEFT' },
      { assignmentProvenance: 'MANUAL_ORDER' },
      { evaluatorProvenance: 'MODEL_GRADER' },
      { raterId: '' },
      { runId: '' },
      { blindAssignmentId: '' },
    ];

    for (const mutation of mutations) {
      const pairwiseJudgments = passing.pairwiseJudgments.map((item, index) => (
        index === 0 ? { ...item, ...mutation } : item
      ));
      const result = evaluateContentQualityV3Rollout({
        cases: passing.cases,
        pairwiseJudgments,
      });
      expect(result.decision).toBe('BLOCK');
      expect(result.reasonCodes).toEqual(['INVALID_KOREAN_PAIRWISE']);
    }
  });

  it('rejects mixed runs, duplicate blind assignments, and presentation-order bias', () => {
    const passing = makePassingInput();
    const mixedRuns = passing.pairwiseJudgments.map((item, index) => (
      index === 0 ? { ...item, runId: 'release-run-2' } : item
    ));
    const duplicateAssignments = passing.pairwiseJudgments.map((item, index) => (
      index === 1
        ? { ...item, blindAssignmentId: passing.pairwiseJudgments[0].blindAssignmentId }
        : item
    ));
    const casesById = new Map(passing.cases.map(item => [item.caseId, item] as const));
    const biasedOrder = passing.pairwiseJudgments.map(item => {
      const evalCase = casesById.get(item.caseId)!;
      return {
        ...item,
        candidatePosition: 'A' as const,
        orderedPairSha256: computeContentQualityV3OrderedPairSha256({
          caseId: evalCase.caseId,
          candidateOutputSha256: evalCase.candidateOutputSha256,
          legacyOutputSha256: evalCase.legacyOutputSha256,
          requestSha256: evalCase.requestSha256,
          providerResponseSha256: evalCase.providerResponseSha256,
          candidatePosition: 'A',
        }),
      };
    });

    expect(evaluateContentQualityV3Rollout({
      cases: passing.cases,
      pairwiseJudgments: mixedRuns,
    }).reasonCodes).toEqual(['PAIRWISE_RUN_PROVENANCE_MISMATCH']);
    expect(evaluateContentQualityV3Rollout({
      cases: passing.cases,
      pairwiseJudgments: duplicateAssignments,
    }).reasonCodes).toEqual(['DUPLICATE_BLIND_ASSIGNMENT_ID']);
    const orderResult = evaluateContentQualityV3Rollout({
      cases: passing.cases,
      pairwiseJudgments: biasedOrder,
    });
    expect(orderResult.decision).toBe('BLOCK');
    expect(orderResult.reasonCodes).toContain('PAIRWISE_PRESENTATION_ORDER_IMBALANCED');
  });

  it.each([
    ['candidateQualityScore', Number.NaN],
    ['legacyQualityScore', Number.POSITIVE_INFINITY],
    ['costRatio', Number.NEGATIVE_INFINITY],
    ['latencyRatio', Number.NaN],
  ] as const)('fails closed on non-finite %s without echoing the input', (key, value) => {
    const input = replaceCase(makePassingInput(), 0, { [key]: value });
    const result = evaluateContentQualityV3Rollout(input);

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['NON_FINITE_METRIC']);
    expectSanitized(result);
  });

  it('rejects raw content, errors, messages, extra fields, and malformed records', () => {
    const passing = makePassingInput();
    const withRaw = {
      cases: passing.cases.map((item, index) => (
        index === 0 ? { ...item, raw: 'secret-output' } : item
      )),
      pairwiseJudgments: passing.pairwiseJudgments,
      message: 'secret-output',
    };
    const rawResult = evaluateContentQualityV3Rollout(withRaw);
    expect(rawResult.decision).toBe('BLOCK');
    expect(rawResult.reasonCodes).toEqual(['INVALID_INPUT']);
    expectSanitized(rawResult);

    const malformedResult = evaluateContentQualityV3Rollout(null);
    expect(malformedResult.decision).toBe('BLOCK');
    expect(malformedResult.reasonCodes).toEqual(['INVALID_INPUT']);
  });

  it('rejects invalid dispositions, metrics, pairwise references, and locales', () => {
    const passing = makePassingInput();
    const invalidDisposition = {
      cases: passing.cases.map((item, index) => (
        index === 0 ? { ...item, disposition: 'TIMEOUT' } : item
      )),
      pairwiseJudgments: passing.pairwiseJudgments,
    };
    expect(evaluateContentQualityV3Rollout(invalidDisposition).reasonCodes)
      .toEqual(['INVALID_DISPOSITION']);

    const invalidMetric = replaceCase(passing, 0, { candidateQualityScore: 101 });
    expect(evaluateContentQualityV3Rollout(invalidMetric).reasonCodes)
      .toEqual(['INVALID_METRIC']);

    const unknownReference = {
      ...passing,
      pairwiseJudgments: passing.pairwiseJudgments.map((item, index) => (
        index === 0 ? { ...item, caseId: 'case-unknown' } : item
      )),
    };
    expect(evaluateContentQualityV3Rollout(unknownReference).reasonCodes)
      .toEqual(['INVALID_PAIRWISE_REFERENCE']);

    const wrongLocale = {
      ...passing,
      pairwiseJudgments: passing.pairwiseJudgments.map((item, index) => (
        index === 0 ? { ...item, locale: 'en-US' } : item
      )),
    };
    expect(evaluateContentQualityV3Rollout(wrongLocale).reasonCodes)
      .toEqual(['INVALID_KOREAN_PAIRWISE']);
  });

  it('uses the fixed published policy even when JavaScript supplies extra arguments', () => {
    const cases = [makeCase(0, { stratum: 'seo' }), makeCase(1, { stratum: 'homefeed' })];
    const pairwiseJudgments = makeJudgments(cases, 8);
    const invokeWithExtraArguments = evaluateContentQualityV3Rollout as unknown as (
      input: unknown,
      ignoredPolicy: unknown,
    ) => ReturnType<typeof evaluateContentQualityV3Rollout>;
    const result = invokeWithExtraArguments(
      { cases, pairwiseJudgments },
      {
        minimumCompletedCases: 2,
        minimumKoreanPairwiseJudgments: 8,
        requiredStrata: [
          { stratum: 'seo', minimumCompletedCases: 1 },
          { stratum: 'homefeed', minimumCompletedCases: 1 },
        ],
        minimumMeanQualityDelta: 0,
        minimumHumanWinOrTieRate: 0.5,
        minimumHumanWilsonLowerBound: 0.5,
        maximumMedianCostRatio: 1,
        maximumP95LatencyRatio: 1,
      },
    );
    expect(evaluateContentQualityV3Rollout).toHaveLength(1);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toEqual(['RELEASE_CORPUS_MISMATCH']);
    expect(evaluateContentQualityV3Rollout(makePassingInput()).decision).toBe('INCOMPLETE');

    const selfAttested = attestInput(makePassingInput());
    const ignoredApproval = invokeWithExtraArguments(selfAttested, {
      approvedArtifactSha256: [selfAttested.evidenceAttestation!.artifactSha256],
    });
    expect(ignoredApproval.decision).toBe('INCOMPLETE');
    expect(ignoredApproval.reasonCodes).toEqual(['EVIDENCE_ARTIFACT_NOT_APPROVED']);
  });
});
