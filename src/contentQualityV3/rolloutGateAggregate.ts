import {
  KOREAN_PAIRWISE_EVIDENCE_PROTOCOL,
  summarizeKoreanPairwiseEvidence,
} from './pairwiseEvidence.js';
import type {
  KoreanPairwiseAggregate,
  KoreanPairwiseJudgment,
  ProviderCaseAggregate,
  ProviderCaseDisposition,
  RolloutGateAggregate,
  RolloutGatePolicy,
  StratumAggregate,
} from './rolloutGate.js';

export interface ValidatedPassMetrics {
  readonly caseId: string;
  readonly stratum: string;
  readonly disposition: 'PASS';
  readonly schemaValid: boolean;
  readonly publishable: boolean;
  readonly criticalHallucinationCount: number;
  readonly fakeFirstPersonCount: number;
  readonly unsupportedCurrentNumberCount: number;
  readonly candidateQualityScore: number;
  readonly legacyQualityScore: number;
  readonly costRatio: number;
  readonly latencyRatio: number;
  readonly candidateOutputSha256: string;
  readonly legacyOutputSha256: string;
  readonly requestSha256: string;
  readonly providerResponseSha256: string;
}

export interface ValidatedNonPassMetrics {
  readonly caseId: string;
  readonly stratum: string;
  readonly disposition: Exclude<ProviderCaseDisposition, 'PASS'>;
  readonly candidateOutputSha256: string;
  readonly legacyOutputSha256: string;
  readonly requestSha256: string;
  readonly providerResponseSha256: string;
}

export type ValidatedCaseMetrics = ValidatedPassMetrics | ValidatedNonPassMetrics;

export interface ValidatedRolloutGateInput {
  readonly cases: readonly ValidatedCaseMetrics[];
  readonly pairwiseJudgments: readonly KoreanPairwiseJudgment[];
  readonly evidenceAttestation: unknown;
  readonly pairwiseRunId: string | undefined;
  readonly rawEvidencePackageSha256: string | undefined;
}

const WILSON_Z_95 = 1.959963984540054;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function nearestRankPercentile(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function wilsonLowerBound(successes: number, total: number): number | null {
  if (total === 0) return null;
  const proportion = successes / total;
  const zSquared = WILSON_Z_95 ** 2;
  const denominator = 1 + zSquared / total;
  const center = proportion + zSquared / (2 * total);
  const margin = WILSON_Z_95 * Math.sqrt(
    (proportion * (1 - proportion) + zSquared / (4 * total)) / total,
  );
  return (center - margin) / denominator;
}

function countDisposition(
  cases: readonly ValidatedCaseMetrics[],
  disposition: ProviderCaseDisposition,
): number {
  return cases.filter(item => item.disposition === disposition).length;
}

function createProviderAggregate(
  cases: readonly ValidatedCaseMetrics[],
  policy: RolloutGatePolicy,
): ProviderCaseAggregate {
  const pass = countDisposition(cases, 'PASS');
  const productFail = countDisposition(cases, 'PRODUCT_FAIL');
  return Object.freeze({
    total: cases.length,
    completed: pass + productFail,
    pass,
    productFail,
    infraExternal: countDisposition(cases, 'INFRA_EXTERNAL'),
    notRun: countDisposition(cases, 'NOT_RUN'),
    requiredCompleted: policy.minimumCompletedCases,
  });
}

function createStrataAggregate(
  cases: readonly ValidatedCaseMetrics[],
  policy: RolloutGatePolicy,
): readonly StratumAggregate[] {
  return Object.freeze(policy.requiredStrata.map(required => Object.freeze({
    stratum: required.stratum,
    completed: cases.filter(item => (
      item.stratum === required.stratum
      && (item.disposition === 'PASS' || item.disposition === 'PRODUCT_FAIL')
    )).length,
    requiredCompleted: required.minimumCompletedCases,
  })));
}

function createKoreanPairwiseAggregate(
  judgments: readonly KoreanPairwiseJudgment[],
  policy: RolloutGatePolicy,
): KoreanPairwiseAggregate {
  const total = judgments.length;
  const candidateWins = judgments.filter(item => item.verdict === 'CANDIDATE_WIN').length;
  const ties = judgments.filter(item => item.verdict === 'TIE').length;
  const legacyWins = judgments.filter(item => item.verdict === 'LEGACY_WIN').length;
  const winOrTie = candidateWins + ties;
  const evidence = summarizeKoreanPairwiseEvidence(judgments);

  return Object.freeze({
    total,
    required: policy.minimumKoreanPairwiseJudgments,
    candidateWins,
    ties,
    legacyWins,
    candidateWinRate: total === 0 ? null : candidateWins / total,
    tieRate: total === 0 ? null : ties / total,
    winOrTieRate: total === 0 ? null : winOrTie / total,
    winOrTieWilsonLowerBound: total === 0 ? null : wilsonLowerBound(winOrTie, total),
    coveredCases: evidence.coveredCases,
    requiredCases: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.requiredCaseCoverage,
    coveredStrata: evidence.coveredStrata,
    requiredStrata: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.requiredStratumCoverage,
    minimumJudgmentsPerCase: evidence.minimumJudgmentsPerCase,
    maximumJudgmentsPerCase: evidence.maximumJudgmentsPerCase,
    minimumJudgmentsPerStratum: evidence.minimumJudgmentsPerStratum,
    maximumJudgmentsPerStratum: evidence.maximumJudgmentsPerStratum,
    candidatePositionA: evidence.candidatePositionA,
    candidatePositionB: evidence.candidatePositionB,
    uniqueRaters: evidence.uniqueRaters,
    uniqueRuns: evidence.uniqueRuns,
    allBlinded: evidence.allBlinded,
    allocationBalanced: evidence.allocationBalanced,
    presentationOrderBalanced: evidence.presentationOrderBalanced,
  });
}

export function createRolloutGateAggregate(
  input: ValidatedRolloutGateInput,
  policy: RolloutGatePolicy,
): RolloutGateAggregate {
  const passCases = input.cases.filter(
    (item): item is ValidatedPassMetrics => item.disposition === 'PASS',
  );
  const candidateScores = passCases.map(item => item.candidateQualityScore);
  const legacyScores = passCases.map(item => item.legacyQualityScore);
  const candidateMean = mean(candidateScores);
  const legacyMean = mean(legacyScores);
  return Object.freeze({
    providerCases: createProviderAggregate(input.cases, policy),
    strata: createStrataAggregate(input.cases, policy),
    schemaPassRate: passCases.length === 0
      ? null
      : passCases.filter(item => item.schemaValid).length / passCases.length,
    publishableRate: passCases.length === 0
      ? null
      : passCases.filter(item => item.publishable).length / passCases.length,
    criticalHallucinationCount: passCases.reduce(
      (total, item) => total + item.criticalHallucinationCount,
      0,
    ),
    fakeFirstPersonCount: passCases.reduce(
      (total, item) => total + item.fakeFirstPersonCount,
      0,
    ),
    unsupportedCurrentNumberCount: passCases.reduce(
      (total, item) => total + item.unsupportedCurrentNumberCount,
      0,
    ),
    meanCandidateQualityScore: candidateMean,
    meanLegacyQualityScore: legacyMean,
    meanQualityDelta: candidateMean === null || legacyMean === null
      ? null
      : candidateMean - legacyMean,
    medianCostRatio: median(passCases.map(item => item.costRatio)),
    p95LatencyRatio: nearestRankPercentile(passCases.map(item => item.latencyRatio), 0.95),
    koreanPairwise: createKoreanPairwiseAggregate(input.pairwiseJudgments, policy),
  });
}

export function createEmptyRolloutGateAggregate(
  policy: RolloutGatePolicy,
): RolloutGateAggregate {
  return Object.freeze({
    providerCases: Object.freeze({
      total: 0,
      completed: 0,
      pass: 0,
      productFail: 0,
      infraExternal: 0,
      notRun: 0,
      requiredCompleted: policy.minimumCompletedCases,
    }),
    strata: Object.freeze(policy.requiredStrata.map(item => Object.freeze({
      stratum: item.stratum,
      completed: 0,
      requiredCompleted: item.minimumCompletedCases,
    }))),
    schemaPassRate: null,
    publishableRate: null,
    criticalHallucinationCount: 0,
    fakeFirstPersonCount: 0,
    unsupportedCurrentNumberCount: 0,
    meanCandidateQualityScore: null,
    meanLegacyQualityScore: null,
    meanQualityDelta: null,
    medianCostRatio: null,
    p95LatencyRatio: null,
    koreanPairwise: Object.freeze({
      total: 0,
      required: policy.minimumKoreanPairwiseJudgments,
      candidateWins: 0,
      ties: 0,
      legacyWins: 0,
      candidateWinRate: null,
      tieRate: null,
      winOrTieRate: null,
      winOrTieWilsonLowerBound: null,
      coveredCases: 0,
      requiredCases: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.requiredCaseCoverage,
      coveredStrata: 0,
      requiredStrata: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.requiredStratumCoverage,
      minimumJudgmentsPerCase: null,
      maximumJudgmentsPerCase: null,
      minimumJudgmentsPerStratum: null,
      maximumJudgmentsPerStratum: null,
      candidatePositionA: 0,
      candidatePositionB: 0,
      uniqueRaters: 0,
      uniqueRuns: 0,
      allBlinded: false,
      allocationBalanced: false,
      presentationOrderBalanced: false,
    }),
  });
}
