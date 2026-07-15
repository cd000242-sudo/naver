import { createHash, type Hash } from 'node:crypto';
import {
  CONTENT_QUALITY_V3_RELEASE_CASE_COUNT,
  CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST,
} from './evalCaseManifest.js';
import { CONTENT_QUALITY_V3_STRATA } from './evalCorpusTypes.js';

export type KoreanPairwiseCandidatePosition = 'A' | 'B';

export interface ContentQualityV3OrderedPairHashInput {
  readonly caseId: string;
  readonly candidateOutputSha256: string;
  readonly legacyOutputSha256: string;
  readonly requestSha256: string;
  readonly providerResponseSha256: string;
  readonly candidatePosition: KoreanPairwiseCandidatePosition;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ORDERED_PAIR_HASH_DOMAIN = Buffer.from('CONTENT_QUALITY_V3_ORDERED_PAIR_V1', 'utf8');

function updateLengthPrefixed(hash: Hash, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

export function computeContentQualityV3OrderedPairSha256(
  input: ContentQualityV3OrderedPairHashInput,
): string {
  if (
    !input
    || typeof input !== 'object'
    || !CASE_ID_PATTERN.test(input.caseId)
    || !SHA256_PATTERN.test(input.candidateOutputSha256)
    || !SHA256_PATTERN.test(input.legacyOutputSha256)
    || !SHA256_PATTERN.test(input.requestSha256)
    || !SHA256_PATTERN.test(input.providerResponseSha256)
    || (input.candidatePosition !== 'A' && input.candidatePosition !== 'B')
  ) {
    throw new Error('INVALID_CONTENT_QUALITY_V3_ORDERED_PAIR_HASH_INPUT');
  }

  const firstOutputSha256 = input.candidatePosition === 'A'
    ? input.candidateOutputSha256
    : input.legacyOutputSha256;
  const secondOutputSha256 = input.candidatePosition === 'A'
    ? input.legacyOutputSha256
    : input.candidateOutputSha256;
  const hash = createHash('sha256');
  hash.update(ORDERED_PAIR_HASH_DOMAIN);
  for (const value of [
    input.caseId,
    input.candidatePosition,
    firstOutputSha256,
    secondOutputSha256,
    input.requestSha256,
    input.providerResponseSha256,
  ]) {
    updateLengthPrefixed(hash, value);
  }
  return hash.digest('hex');
}

export const KOREAN_PAIRWISE_EVIDENCE_PROTOCOL = Object.freeze({
  schemaVersion: 2 as const,
  evaluatorProvenance: 'HUMAN_BLIND_REVIEW_V1' as const,
  assignmentProvenance: 'BALANCED_RANDOMIZED_BLIND_V1' as const,
  maximumAllocationSpread: 1,
  maximumPresentationOrderImbalance: 1,
  requiredCaseCoverage: CONTENT_QUALITY_V3_RELEASE_CASE_COUNT,
  requiredStratumCoverage: CONTENT_QUALITY_V3_STRATA.length,
});

export interface KoreanPairwiseEvidenceObservation {
  readonly caseId: string;
  readonly raterId: string;
  readonly runId: string;
  readonly blinded: true;
  readonly candidatePosition: KoreanPairwiseCandidatePosition;
}

export interface KoreanPairwiseEvidenceSummary {
  readonly coveredCases: number;
  readonly coveredStrata: number;
  readonly minimumJudgmentsPerCase: number | null;
  readonly maximumJudgmentsPerCase: number | null;
  readonly minimumJudgmentsPerStratum: number | null;
  readonly maximumJudgmentsPerStratum: number | null;
  readonly candidatePositionA: number;
  readonly candidatePositionB: number;
  readonly uniqueRaters: number;
  readonly uniqueRuns: number;
  readonly allBlinded: boolean;
  readonly allocationBalanced: boolean;
  readonly presentationOrderBalanced: boolean;
}

function countsForReleaseCases(
  judgments: readonly KoreanPairwiseEvidenceObservation[],
): readonly number[] {
  return Object.freeze(CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.map(entry => (
    judgments.filter(item => item.caseId === entry.caseId).length
  )));
}

function isJudgmentInStratum(
  judgment: KoreanPairwiseEvidenceObservation,
  stratum: string,
): boolean {
  return CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.some(entry => (
    entry.caseId === judgment.caseId && entry.stratum === stratum
  ));
}

function countsForReleaseStrata(
  judgments: readonly KoreanPairwiseEvidenceObservation[],
): readonly number[] {
  return Object.freeze(CONTENT_QUALITY_V3_STRATA.map(stratum => (
    judgments.filter(item => isJudgmentInStratum(item, stratum)).length
  )));
}

function minimum(counts: readonly number[], total: number): number | null {
  return total === 0 ? null : Math.min(...counts);
}

function maximum(counts: readonly number[], total: number): number | null {
  return total === 0 ? null : Math.max(...counts);
}

function isPositionOrderBalanced(
  judgments: readonly KoreanPairwiseEvidenceObservation[],
): boolean {
  const positionA = judgments.filter(item => item.candidatePosition === 'A').length;
  const positionB = judgments.length - positionA;
  return Math.abs(positionA - positionB)
    <= KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.maximumPresentationOrderImbalance;
}

function isEveryCaseOrderBalanced(
  judgments: readonly KoreanPairwiseEvidenceObservation[],
): boolean {
  return CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.every(entry => (
    isPositionOrderBalanced(judgments.filter(item => item.caseId === entry.caseId))
  ));
}

function isEveryStratumOrderBalanced(
  judgments: readonly KoreanPairwiseEvidenceObservation[],
): boolean {
  return CONTENT_QUALITY_V3_STRATA.every(stratum => (
    isPositionOrderBalanced(judgments.filter(item => isJudgmentInStratum(item, stratum)))
  ));
}

function hasBalancedAllocation(
  total: number,
  minimumPerCase: number | null,
  maximumPerCase: number | null,
  minimumPerStratum: number | null,
  maximumPerStratum: number | null,
): boolean {
  if (
    total === 0
    || minimumPerCase === null
    || maximumPerCase === null
    || minimumPerStratum === null
    || maximumPerStratum === null
  ) return false;

  return maximumPerCase - minimumPerCase
      <= KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.maximumAllocationSpread
    && maximumPerStratum - minimumPerStratum
      <= KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.maximumAllocationSpread;
}

export function summarizeKoreanPairwiseEvidence(
  judgments: readonly KoreanPairwiseEvidenceObservation[],
): KoreanPairwiseEvidenceSummary {
  const total = judgments.length;
  const caseCounts = countsForReleaseCases(judgments);
  const stratumCounts = countsForReleaseStrata(judgments);
  const minimumJudgmentsPerCase = minimum(caseCounts, total);
  const maximumJudgmentsPerCase = maximum(caseCounts, total);
  const minimumJudgmentsPerStratum = minimum(stratumCounts, total);
  const maximumJudgmentsPerStratum = maximum(stratumCounts, total);
  const candidatePositionA = judgments.filter(item => item.candidatePosition === 'A').length;
  const candidatePositionB = total - candidatePositionA;

  return Object.freeze({
    coveredCases: caseCounts.filter(count => count > 0).length,
    coveredStrata: stratumCounts.filter(count => count > 0).length,
    minimumJudgmentsPerCase,
    maximumJudgmentsPerCase,
    minimumJudgmentsPerStratum,
    maximumJudgmentsPerStratum,
    candidatePositionA,
    candidatePositionB,
    uniqueRaters: new Set(judgments.map(item => item.raterId)).size,
    uniqueRuns: new Set(judgments.map(item => item.runId)).size,
    allBlinded: total > 0 && judgments.every(item => item.blinded),
    allocationBalanced: hasBalancedAllocation(
      total,
      minimumJudgmentsPerCase,
      maximumJudgmentsPerCase,
      minimumJudgmentsPerStratum,
      maximumJudgmentsPerStratum,
    ),
    presentationOrderBalanced: total > 0
      && isPositionOrderBalanced(judgments)
      && isEveryCaseOrderBalanced(judgments)
      && isEveryStratumOrderBalanced(judgments),
  });
}
