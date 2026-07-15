import { CONTENT_QUALITY_V3_STRATA } from './evalCorpusTypes.js';
import { CONTENT_QUALITY_V3_RELEASE_CORPUS } from './evalCorpus.js';
import {
  CONTENT_QUALITY_V3_RELEASE_CASE_COUNT,
  CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST,
  CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM,
} from './evalCaseManifest.js';
import {
  computeContentQualityV3OrderedPairSha256,
  KOREAN_PAIRWISE_EVIDENCE_PROTOCOL,
  type KoreanPairwiseCandidatePosition,
} from './pairwiseEvidence.js';
import { hasOnlyFiniteRolloutGateNumbers } from './rolloutGateFinite.js';
import {
  evaluateContentQualityV3EvidenceAttestation,
  type ContentQualityV3EvidenceAttestation,
} from './evidenceAttestation.js';
import {
  createEmptyRolloutGateAggregate as createEmptyAggregate,
  createRolloutGateAggregate as createAggregate,
  type ValidatedCaseMetrics,
  type ValidatedRolloutGateInput as ValidatedInput,
} from './rolloutGateAggregate.js';
import {
  validateContentQualityV3RawEvidencePackage,
  type ContentQualityV3RawEvidencePackageCase,
  type ContentQualityV3RawEvidencePackage,
} from './rawEvidencePackage.js';
import {
  buildContentQualityV3ExpectedRequestBytes,
  deriveContentQualityV3CandidateEvidence,
} from './evaluationEvidenceContract.js';

export { KOREAN_PAIRWISE_EVIDENCE_PROTOCOL } from './pairwiseEvidence.js';
export type { KoreanPairwiseCandidatePosition } from './pairwiseEvidence.js';

export const PROVIDER_CASE_DISPOSITIONS = Object.freeze([
  'PASS',
  'PRODUCT_FAIL',
  'INFRA_EXTERNAL',
  'NOT_RUN',
] as const);

export type ProviderCaseDisposition = typeof PROVIDER_CASE_DISPOSITIONS[number];
export type KoreanPairwiseVerdict = 'CANDIDATE_WIN' | 'TIE' | 'LEGACY_WIN';
export type RolloutGateDecision = 'PROMOTE' | 'BLOCK' | 'INCOMPLETE';

export type RolloutGateReasonCode =
  | 'ALL_PROMOTION_GATES_PASSED'
  | 'INVALID_INPUT'
  | 'INVALID_DISPOSITION'
  | 'INVALID_METRIC'
  | 'NON_FINITE_METRIC'
  | 'DUPLICATE_CASE_ID'
  | 'DUPLICATE_JUDGMENT_ID'
  | 'DUPLICATE_BLIND_ASSIGNMENT_ID'
  | 'RELEASE_CORPUS_MISMATCH'
  | 'INVALID_KOREAN_PAIRWISE'
  | 'INVALID_PAIRWISE_REFERENCE'
  | 'PAIRWISE_RUN_PROVENANCE_MISMATCH'
  | 'PAIRWISE_CASE_COVERAGE_MISMATCH'
  | 'PAIRWISE_STRATUM_COVERAGE_MISMATCH'
  | 'PAIRWISE_CASE_ALLOCATION_IMBALANCED'
  | 'PAIRWISE_STRATUM_ALLOCATION_IMBALANCED'
  | 'PAIRWISE_PRESENTATION_ORDER_IMBALANCED'
  | 'PRODUCT_FAILURE_PRESENT'
  | 'INFRA_EXTERNAL_PRESENT'
  | 'NOT_RUN_PRESENT'
  | 'INSUFFICIENT_COMPLETED_CASES'
  | 'REQUIRED_STRATUM_MISSING'
  | 'INSUFFICIENT_STRATUM_CASES'
  | 'INSUFFICIENT_KOREAN_PAIRWISE'
  | 'SCHEMA_PASS_RATE_BELOW_100'
  | 'PUBLISHABLE_RATE_BELOW_100'
  | 'CRITICAL_HALLUCINATION_PRESENT'
  | 'FAKE_FIRST_PERSON_PRESENT'
  | 'UNSUPPORTED_CURRENT_NUMBER_PRESENT'
  | 'QUALITY_DELTA_BELOW_MINIMUM'
  | 'HUMAN_WIN_OR_TIE_RATE_BELOW_MINIMUM'
  | 'HUMAN_WILSON_LOWER_BOUND_BELOW_MINIMUM'
  | 'MEDIAN_COST_RATIO_NOT_IMPROVED'
  | 'P95_LATENCY_RATIO_ABOVE_MAXIMUM'
  | 'EVIDENCE_ATTESTATION_MISSING'
  | 'EVIDENCE_ARTIFACT_NOT_APPROVED'
  | 'INVALID_EVIDENCE_ATTESTATION'
  | 'EVIDENCE_ARTIFACT_DIGEST_MISMATCH'
  | 'RAW_EVIDENCE_PACKAGE_MISSING'
  | 'INVALID_RAW_EVIDENCE_PACKAGE';

export interface RolloutCaseMetrics {
  readonly caseId: string;
  readonly stratum: string;
  readonly disposition: ProviderCaseDisposition;
  readonly schemaValid?: boolean;
  readonly publishable?: boolean;
  readonly criticalHallucinationCount?: number;
  readonly fakeFirstPersonCount?: number;
  readonly unsupportedCurrentNumberCount?: number;
  readonly candidateQualityScore?: number;
  readonly legacyQualityScore?: number;
  readonly costRatio?: number;
  readonly latencyRatio?: number;
  readonly candidateOutputSha256: string;
  readonly legacyOutputSha256: string;
  readonly requestSha256: string;
  readonly providerResponseSha256: string;
}

export interface KoreanPairwiseJudgment {
  readonly judgmentId: string;
  readonly caseId: string;
  readonly locale: 'ko-KR';
  readonly verdict: KoreanPairwiseVerdict;
  readonly raterId: string;
  readonly runId: string;
  readonly blindAssignmentId: string;
  readonly blinded: true;
  readonly candidatePosition: KoreanPairwiseCandidatePosition;
  readonly orderedPairSha256: string;
  readonly assignmentProvenance:
    typeof KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.assignmentProvenance;
  readonly evaluatorProvenance:
    typeof KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.evaluatorProvenance;
}

export interface RolloutGateInput {
  readonly cases: readonly RolloutCaseMetrics[];
  readonly pairwiseJudgments: readonly KoreanPairwiseJudgment[];
  readonly rawEvidencePackage?: ContentQualityV3RawEvidencePackage;
  readonly evidenceAttestation?: ContentQualityV3EvidenceAttestation;
}

export interface RequiredRolloutStratum {
  readonly stratum: string;
  readonly minimumCompletedCases: number;
}

export interface RolloutGatePolicy {
  readonly minimumCompletedCases: number;
  readonly minimumKoreanPairwiseJudgments: number;
  readonly requiredStrata: readonly RequiredRolloutStratum[];
  readonly minimumMeanQualityDelta: number;
  readonly minimumHumanWinOrTieRate: number;
  readonly minimumHumanWilsonLowerBound: number;
  readonly maximumMedianCostRatio: number;
  readonly maximumP95LatencyRatio: number;
}

export interface ProviderCaseAggregate {
  readonly total: number;
  readonly completed: number;
  readonly pass: number;
  readonly productFail: number;
  readonly infraExternal: number;
  readonly notRun: number;
  readonly requiredCompleted: number;
}

export interface StratumAggregate {
  readonly stratum: string;
  readonly completed: number;
  readonly requiredCompleted: number;
}

export interface KoreanPairwiseAggregate {
  readonly total: number;
  readonly required: number;
  readonly candidateWins: number;
  readonly ties: number;
  readonly legacyWins: number;
  readonly candidateWinRate: number | null;
  readonly tieRate: number | null;
  readonly winOrTieRate: number | null;
  readonly winOrTieWilsonLowerBound: number | null;
  readonly coveredCases: number;
  readonly requiredCases: number;
  readonly coveredStrata: number;
  readonly requiredStrata: number;
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

export interface RolloutGateAggregate {
  readonly providerCases: ProviderCaseAggregate;
  readonly strata: readonly StratumAggregate[];
  readonly schemaPassRate: number | null;
  readonly publishableRate: number | null;
  readonly criticalHallucinationCount: number;
  readonly fakeFirstPersonCount: number;
  readonly unsupportedCurrentNumberCount: number;
  readonly meanCandidateQualityScore: number | null;
  readonly meanLegacyQualityScore: number | null;
  readonly meanQualityDelta: number | null;
  readonly medianCostRatio: number | null;
  readonly p95LatencyRatio: number | null;
  readonly koreanPairwise: KoreanPairwiseAggregate;
}

export interface RolloutGateResult {
  readonly schemaVersion: 1;
  readonly decision: RolloutGateDecision;
  readonly reasonCodes: readonly RolloutGateReasonCode[];
  readonly aggregate: RolloutGateAggregate;
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STRATUM_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CASES = 10_000;
const MAX_JUDGMENTS = 50_000;
const MAX_RATIO = 1_000_000;

const INPUT_KEYS = Object.freeze([
  'cases',
  'pairwiseJudgments',
  'rawEvidencePackage',
  'evidenceAttestation',
] as const);
const CASE_KEYS = Object.freeze([
  'caseId',
  'stratum',
  'disposition',
  'schemaValid',
  'publishable',
  'criticalHallucinationCount',
  'fakeFirstPersonCount',
  'unsupportedCurrentNumberCount',
  'candidateQualityScore',
  'legacyQualityScore',
  'costRatio',
  'latencyRatio',
  'candidateOutputSha256',
  'legacyOutputSha256',
  'requestSha256',
  'providerResponseSha256',
] as const);
const JUDGMENT_KEYS = Object.freeze([
  'judgmentId',
  'caseId',
  'locale',
  'verdict',
  'raterId',
  'runId',
  'blindAssignmentId',
  'blinded',
  'candidatePosition',
  'orderedPairSha256',
  'assignmentProvenance',
  'evaluatorProvenance',
] as const);
const DEFAULT_REQUIRED_STRATA = Object.freeze(CONTENT_QUALITY_V3_STRATA.map(stratum => (
  Object.freeze({
    stratum,
    minimumCompletedCases: CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM,
  })
)));

export const DEFAULT_ROLLOUT_GATE_POLICY: RolloutGatePolicy = Object.freeze({
  minimumCompletedCases: CONTENT_QUALITY_V3_RELEASE_CASE_COUNT,
  minimumKoreanPairwiseJudgments: 200,
  requiredStrata: DEFAULT_REQUIRED_STRATA,
  minimumMeanQualityDelta: 0,
  minimumHumanWinOrTieRate: 0.5,
  minimumHumanWilsonLowerBound: 0.5,
  maximumMedianCostRatio: 1,
  maximumP95LatencyRatio: 1,
});

class GateValidationError extends Error {
  readonly code: RolloutGateReasonCode;

  constructor(code: RolloutGateReasonCode) {
    super(code);
    this.name = 'GateValidationError';
    this.code = code;
  }
}

function fail(code: RolloutGateReasonCode): never {
  throw new GateValidationError(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readStrictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  code: RolloutGateReasonCode,
): Record<string, unknown> {
  if (!isPlainRecord(value)) fail(code);

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string' || !allowedKeys.includes(key))) fail(code);

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) fail(code);
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}

function readDenseArray(
  value: unknown,
  maximumLength: number,
  code: RolloutGateReasonCode,
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(code);

  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor
  >;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !('value' in lengthDescriptor)) fail(code);
  const rawLength = lengthDescriptor.value;
  if (
    typeof rawLength !== 'number'
    || !Number.isSafeInteger(rawLength)
    || rawLength < 0
    || rawLength > maximumLength
  ) fail(code);
  const length = rawLength;

  const expectedKeys = new Set<string>([
    'length',
    ...Array.from({ length }, (_, index) => String(index)),
  ]);
  if (
    keys.length !== expectedKeys.size
    || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
  ) {
    fail(code);
  }

  return Object.freeze(Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor)) fail(code);
    return descriptor.value;
  }));
}

function readIdentifier(value: unknown, code: RolloutGateReasonCode): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) fail(code);
  return value;
}

function readStratum(value: unknown, code: RolloutGateReasonCode): string {
  if (typeof value !== 'string' || !STRATUM_PATTERN.test(value)) fail(code);
  return value;
}

function readSha256(value: unknown, code: RolloutGateReasonCode): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code);
  return value;
}

function readBoundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number') fail('INVALID_METRIC');
  if (!Number.isFinite(value)) fail('NON_FINITE_METRIC');
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail('INVALID_METRIC');
  return value;
}

function readBoundedMetric(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number') fail('INVALID_METRIC');
  if (!Number.isFinite(value)) fail('NON_FINITE_METRIC');
  if (value < minimum || value > maximum) fail('INVALID_METRIC');
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('INVALID_METRIC');
  return value;
}

function readDisposition(value: unknown): ProviderCaseDisposition {
  if (typeof value !== 'string' || !PROVIDER_CASE_DISPOSITIONS.includes(value as ProviderCaseDisposition)) {
    fail('INVALID_DISPOSITION');
  }
  return value as ProviderCaseDisposition;
}

function validateOptionalNonPassMetrics(record: Record<string, unknown>): void {
  if (record.schemaValid !== undefined) readBoolean(record.schemaValid);
  if (record.publishable !== undefined) readBoolean(record.publishable);
  if (record.criticalHallucinationCount !== undefined) {
    readBoundedInteger(record.criticalHallucinationCount, 0, MAX_CASES);
  }
  if (record.fakeFirstPersonCount !== undefined) {
    readBoundedInteger(record.fakeFirstPersonCount, 0, MAX_CASES);
  }
  if (record.unsupportedCurrentNumberCount !== undefined) {
    readBoundedInteger(record.unsupportedCurrentNumberCount, 0, MAX_CASES);
  }
  if (record.candidateQualityScore !== undefined) {
    readBoundedMetric(record.candidateQualityScore, 0, 100);
  }
  if (record.legacyQualityScore !== undefined) readBoundedMetric(record.legacyQualityScore, 0, 100);
  if (record.costRatio !== undefined) readBoundedMetric(record.costRatio, 0, MAX_RATIO);
  if (record.latencyRatio !== undefined) readBoundedMetric(record.latencyRatio, 0, MAX_RATIO);
}

function validateCase(value: unknown): ValidatedCaseMetrics {
  const record = readStrictRecord(value, CASE_KEYS, 'INVALID_INPUT');
  const caseId = readIdentifier(record.caseId, 'INVALID_INPUT');
  const stratum = readStratum(record.stratum, 'INVALID_INPUT');
  const disposition = readDisposition(record.disposition);
  const provenance = Object.freeze({
    candidateOutputSha256: readSha256(record.candidateOutputSha256, 'INVALID_INPUT'),
    legacyOutputSha256: readSha256(record.legacyOutputSha256, 'INVALID_INPUT'),
    requestSha256: readSha256(record.requestSha256, 'INVALID_INPUT'),
    providerResponseSha256: readSha256(record.providerResponseSha256, 'INVALID_INPUT'),
  });

  if (disposition !== 'PASS') {
    validateOptionalNonPassMetrics(record);
    return Object.freeze({ caseId, stratum, disposition, ...provenance });
  }

  return Object.freeze({
    caseId,
    stratum,
    disposition,
    ...provenance,
    schemaValid: readBoolean(record.schemaValid),
    publishable: readBoolean(record.publishable),
    criticalHallucinationCount: readBoundedInteger(record.criticalHallucinationCount, 0, MAX_CASES),
    fakeFirstPersonCount: readBoundedInteger(record.fakeFirstPersonCount, 0, MAX_CASES),
    unsupportedCurrentNumberCount: readBoundedInteger(record.unsupportedCurrentNumberCount, 0, MAX_CASES),
    candidateQualityScore: readBoundedMetric(record.candidateQualityScore, 0, 100),
    legacyQualityScore: readBoundedMetric(record.legacyQualityScore, 0, 100),
    costRatio: readBoundedMetric(record.costRatio, 0, MAX_RATIO),
    latencyRatio: readBoundedMetric(record.latencyRatio, 0, MAX_RATIO),
  });
}

function validateJudgment(
  value: unknown,
  passCases: ReadonlyMap<string, ValidatedCaseMetrics>,
): KoreanPairwiseJudgment {
  const record = readStrictRecord(value, JUDGMENT_KEYS, 'INVALID_KOREAN_PAIRWISE');
  const judgmentId = readIdentifier(record.judgmentId, 'INVALID_KOREAN_PAIRWISE');
  const caseId = readIdentifier(record.caseId, 'INVALID_KOREAN_PAIRWISE');
  const raterId = readIdentifier(record.raterId, 'INVALID_KOREAN_PAIRWISE');
  const runId = readIdentifier(record.runId, 'INVALID_KOREAN_PAIRWISE');
  const blindAssignmentId = readIdentifier(
    record.blindAssignmentId,
    'INVALID_KOREAN_PAIRWISE',
  );
  const orderedPairSha256 = readSha256(record.orderedPairSha256, 'INVALID_KOREAN_PAIRWISE');

  if (record.locale !== 'ko-KR') fail('INVALID_KOREAN_PAIRWISE');
  if (!['CANDIDATE_WIN', 'TIE', 'LEGACY_WIN'].includes(record.verdict as string)) {
    fail('INVALID_KOREAN_PAIRWISE');
  }
  if (record.blinded !== true) fail('INVALID_KOREAN_PAIRWISE');
  if (record.candidatePosition !== 'A' && record.candidatePosition !== 'B') {
    fail('INVALID_KOREAN_PAIRWISE');
  }
  if (record.assignmentProvenance !== KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.assignmentProvenance) {
    fail('INVALID_KOREAN_PAIRWISE');
  }
  if (record.evaluatorProvenance !== KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.evaluatorProvenance) {
    fail('INVALID_KOREAN_PAIRWISE');
  }
  const evalCase = passCases.get(caseId);
  if (!evalCase) fail('INVALID_PAIRWISE_REFERENCE');
  const expectedOrderedPairSha256 = computeContentQualityV3OrderedPairSha256({
    caseId,
    candidateOutputSha256: evalCase.candidateOutputSha256,
    legacyOutputSha256: evalCase.legacyOutputSha256,
    requestSha256: evalCase.requestSha256,
    providerResponseSha256: evalCase.providerResponseSha256,
    candidatePosition: record.candidatePosition as KoreanPairwiseCandidatePosition,
  });
  if (orderedPairSha256 !== expectedOrderedPairSha256) fail('INVALID_KOREAN_PAIRWISE');

  return Object.freeze({
    judgmentId,
    caseId,
    locale: 'ko-KR',
    verdict: record.verdict as KoreanPairwiseVerdict,
    raterId,
    runId,
    blindAssignmentId,
    blinded: true,
    candidatePosition: record.candidatePosition as KoreanPairwiseCandidatePosition,
    orderedPairSha256,
    assignmentProvenance: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.assignmentProvenance,
    evaluatorProvenance: KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.evaluatorProvenance,
  });
}

function validateReleaseCorpus(cases: readonly ValidatedCaseMetrics[]): void {
  if (cases.length !== CONTENT_QUALITY_V3_RELEASE_CASE_COUNT) {
    fail('RELEASE_CORPUS_MISMATCH');
  }

  for (const item of cases) {
    const expected = CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.find(entry => (
      entry.caseId === item.caseId
    ));
    if (expected === undefined || item.stratum !== expected.stratum) {
      fail('RELEASE_CORPUS_MISMATCH');
    }
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function matchesDerivedCandidateEvidence(
  item: ValidatedCaseMetrics,
  raw: ContentQualityV3RawEvidencePackageCase,
): boolean {
  const evalCase = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(candidate => (
    candidate.caseId === item.caseId
  ));
  if (!evalCase) return false;

  try {
    const candidateCall = raw.candidateRun.calls[0];
    const actualRequestBytes = Buffer.from(candidateCall.requestBase64, 'base64');
    const expectedRequestBytes = buildContentQualityV3ExpectedRequestBytes(evalCase);
    if (!equalBytes(actualRequestBytes, expectedRequestBytes)) return false;

    const providerResponseBytes = Buffer.from(candidateCall.responseBase64, 'base64');
    const derived = deriveContentQualityV3CandidateEvidence(evalCase, providerResponseBytes);
    const recordedCandidateBytes = Buffer.from(raw.candidateRun.finalOutputBase64, 'base64');
    if (!equalBytes(recordedCandidateBytes, derived.candidateOutputBytes)) return false;

    if (item.disposition !== 'PASS') return true;
    const assessment = derived.assessment;
    return assessment.passed
      && assessment.schemaValid === item.schemaValid
      && assessment.publishable === item.publishable
      && assessment.criticalHallucinationCount === item.criticalHallucinationCount
      && assessment.fakeFirstPersonCount === item.fakeFirstPersonCount
      && assessment.unsupportedCurrentNumberCount === item.unsupportedCurrentNumberCount;
  } catch {
    return false;
  }
}

function validateRawEvidencePackage(
  value: unknown,
  cases: readonly ValidatedCaseMetrics[],
): string | undefined {
  if (value === undefined) return undefined;
  let rawPackage: ContentQualityV3RawEvidencePackage;
  try {
    rawPackage = validateContentQualityV3RawEvidencePackage(value);
  } catch {
    return fail('INVALID_RAW_EVIDENCE_PACKAGE');
  }
  if (rawPackage.cases.length !== cases.length) fail('INVALID_RAW_EVIDENCE_PACKAGE');
  const rawByCaseId = new Map(rawPackage.cases.map(item => [item.caseId, item] as const));
  if (rawByCaseId.size !== cases.length) fail('INVALID_RAW_EVIDENCE_PACKAGE');
  for (const item of cases) {
    const raw = rawByCaseId.get(item.caseId);
    if (
      raw === undefined
      || raw.candidateOutputSha256 !== item.candidateOutputSha256
      || raw.legacyOutputSha256 !== item.legacyOutputSha256
      || raw.requestSha256 !== item.requestSha256
      || raw.providerResponseSha256 !== item.providerResponseSha256
      || (
        item.disposition === 'PASS'
        && (raw.costRatio !== item.costRatio || raw.latencyRatio !== item.latencyRatio)
      )
      || !matchesDerivedCandidateEvidence(item, raw)
    ) fail('INVALID_RAW_EVIDENCE_PACKAGE');
  }
  return rawPackage.manifestSha256;
}

function validateInput(value: unknown): ValidatedInput {
  const record = readStrictRecord(value, INPUT_KEYS, 'INVALID_INPUT');
  const rawCases = readDenseArray(record.cases, MAX_CASES, 'INVALID_INPUT');
  const cases = rawCases.map(validateCase);
  const caseIds = new Set<string>();

  for (const item of cases) {
    if (caseIds.has(item.caseId)) fail('DUPLICATE_CASE_ID');
    caseIds.add(item.caseId);
  }

  validateReleaseCorpus(cases);
  const rawEvidencePackageSha256 = validateRawEvidencePackage(
    record.rawEvidencePackage,
    cases,
  );

  const passCases = new Map(cases
    .filter(item => item.disposition === 'PASS')
    .map(item => [item.caseId, item] as const));
  const rawJudgments = readDenseArray(record.pairwiseJudgments, MAX_JUDGMENTS, 'INVALID_INPUT');
  const pairwiseJudgments = rawJudgments.map(item => validateJudgment(item, passCases));
  const judgmentIds = new Set<string>();
  const blindAssignmentIds = new Set<string>();
  const runIds = new Set<string>();

  for (const item of pairwiseJudgments) {
    if (judgmentIds.has(item.judgmentId)) fail('DUPLICATE_JUDGMENT_ID');
    if (blindAssignmentIds.has(item.blindAssignmentId)) {
      fail('DUPLICATE_BLIND_ASSIGNMENT_ID');
    }
    judgmentIds.add(item.judgmentId);
    blindAssignmentIds.add(item.blindAssignmentId);
    runIds.add(item.runId);
  }
  if (runIds.size > 1) fail('PAIRWISE_RUN_PROVENANCE_MISMATCH');

  return Object.freeze({
    cases: Object.freeze(cases),
    pairwiseJudgments: Object.freeze(pairwiseJudgments),
    evidenceAttestation: record.evidenceAttestation,
    pairwiseRunId: pairwiseJudgments[0]?.runId,
    rawEvidencePackageSha256,
  });
}

function buildBlockReasons(
  aggregate: RolloutGateAggregate,
  policy: RolloutGatePolicy,
): RolloutGateReasonCode[] {
  const reasons: RolloutGateReasonCode[] = [];
  if (aggregate.providerCases.productFail > 0) reasons.push('PRODUCT_FAILURE_PRESENT');
  if (aggregate.schemaPassRate !== null && aggregate.schemaPassRate !== 1) {
    reasons.push('SCHEMA_PASS_RATE_BELOW_100');
  }
  if (aggregate.publishableRate !== null && aggregate.publishableRate !== 1) {
    reasons.push('PUBLISHABLE_RATE_BELOW_100');
  }
  if (aggregate.criticalHallucinationCount > 0) reasons.push('CRITICAL_HALLUCINATION_PRESENT');
  if (aggregate.fakeFirstPersonCount > 0) reasons.push('FAKE_FIRST_PERSON_PRESENT');
  if (aggregate.unsupportedCurrentNumberCount > 0) reasons.push('UNSUPPORTED_CURRENT_NUMBER_PRESENT');
  if (aggregate.meanQualityDelta !== null && aggregate.meanQualityDelta < policy.minimumMeanQualityDelta) {
    reasons.push('QUALITY_DELTA_BELOW_MINIMUM');
  }
  if (
    aggregate.koreanPairwise.winOrTieRate !== null
    && aggregate.koreanPairwise.winOrTieRate < policy.minimumHumanWinOrTieRate
  ) {
    reasons.push('HUMAN_WIN_OR_TIE_RATE_BELOW_MINIMUM');
  }
  if (
    aggregate.koreanPairwise.winOrTieWilsonLowerBound !== null
    && aggregate.koreanPairwise.winOrTieWilsonLowerBound < policy.minimumHumanWilsonLowerBound
  ) {
    reasons.push('HUMAN_WILSON_LOWER_BOUND_BELOW_MINIMUM');
  }
  if (
    aggregate.medianCostRatio !== null
    && aggregate.medianCostRatio >= policy.maximumMedianCostRatio
  ) {
    reasons.push('MEDIAN_COST_RATIO_NOT_IMPROVED');
  }
  if (
    aggregate.p95LatencyRatio !== null
    && aggregate.p95LatencyRatio > policy.maximumP95LatencyRatio
  ) {
    reasons.push('P95_LATENCY_RATIO_ABOVE_MAXIMUM');
  }
  const pairwiseEvidenceComplete = aggregate.providerCases.pass
      === KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.requiredCaseCoverage
    && aggregate.koreanPairwise.total >= aggregate.koreanPairwise.required;
  if (pairwiseEvidenceComplete) {
    if (aggregate.koreanPairwise.coveredCases !== aggregate.koreanPairwise.requiredCases) {
      reasons.push('PAIRWISE_CASE_COVERAGE_MISMATCH');
    }
    if (aggregate.koreanPairwise.coveredStrata !== aggregate.koreanPairwise.requiredStrata) {
      reasons.push('PAIRWISE_STRATUM_COVERAGE_MISMATCH');
    }
    if (
      aggregate.koreanPairwise.minimumJudgmentsPerCase === null
      || aggregate.koreanPairwise.maximumJudgmentsPerCase === null
      || aggregate.koreanPairwise.maximumJudgmentsPerCase
        - aggregate.koreanPairwise.minimumJudgmentsPerCase
        > KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.maximumAllocationSpread
    ) {
      reasons.push('PAIRWISE_CASE_ALLOCATION_IMBALANCED');
    }
    if (
      aggregate.koreanPairwise.minimumJudgmentsPerStratum === null
      || aggregate.koreanPairwise.maximumJudgmentsPerStratum === null
      || aggregate.koreanPairwise.maximumJudgmentsPerStratum
        - aggregate.koreanPairwise.minimumJudgmentsPerStratum
        > KOREAN_PAIRWISE_EVIDENCE_PROTOCOL.maximumAllocationSpread
    ) {
      reasons.push('PAIRWISE_STRATUM_ALLOCATION_IMBALANCED');
    }
    if (!aggregate.koreanPairwise.presentationOrderBalanced) {
      reasons.push('PAIRWISE_PRESENTATION_ORDER_IMBALANCED');
    }
  }
  return reasons;
}

function buildIncompleteReasons(
  input: ValidatedInput,
  aggregate: RolloutGateAggregate,
): RolloutGateReasonCode[] {
  const reasons: RolloutGateReasonCode[] = [];
  if (aggregate.providerCases.infraExternal > 0) reasons.push('INFRA_EXTERNAL_PRESENT');
  if (aggregate.providerCases.notRun > 0) reasons.push('NOT_RUN_PRESENT');
  if (aggregate.providerCases.completed < aggregate.providerCases.requiredCompleted) {
    reasons.push('INSUFFICIENT_COMPLETED_CASES');
  }

  const presentStrata = new Set(input.cases.map(item => item.stratum));
  if (aggregate.strata.some(item => !presentStrata.has(item.stratum))) {
    reasons.push('REQUIRED_STRATUM_MISSING');
  }
  if (aggregate.strata.some(item => item.completed > 0 && item.completed < item.requiredCompleted)) {
    reasons.push('INSUFFICIENT_STRATUM_CASES');
  }
  if (aggregate.koreanPairwise.total < aggregate.koreanPairwise.required) {
    reasons.push('INSUFFICIENT_KOREAN_PAIRWISE');
  }
  if (input.rawEvidencePackageSha256 === undefined) {
    reasons.push('RAW_EVIDENCE_PACKAGE_MISSING');
  }
  return reasons;
}

function createResult(
  decision: RolloutGateDecision,
  reasonCodes: readonly RolloutGateReasonCode[],
  aggregate: RolloutGateAggregate,
): RolloutGateResult {
  return Object.freeze({
    schemaVersion: 1,
    decision,
    reasonCodes: Object.freeze([...reasonCodes]),
    aggregate,
  });
}

function validationFailureResult(
  code: RolloutGateReasonCode,
  policy: RolloutGatePolicy,
): RolloutGateResult {
  return createResult('BLOCK', [code], createEmptyAggregate(policy));
}

export function evaluateContentQualityV3Rollout(
  input: unknown,
): RolloutGateResult {
  const policy = DEFAULT_ROLLOUT_GATE_POLICY;

  try {
    const validated = validateInput(input);
    const aggregate = createAggregate(validated, policy);
    if (!hasOnlyFiniteRolloutGateNumbers(aggregate)) fail('NON_FINITE_METRIC');
    const blockReasons = buildBlockReasons(aggregate, policy);
    const incompleteReasons = buildIncompleteReasons(validated, aggregate);
    const attestation = evaluateContentQualityV3EvidenceAttestation(
      validated.evidenceAttestation,
      {
        cases: validated.cases,
        pairwiseJudgments: validated.pairwiseJudgments,
      },
      validated.pairwiseRunId,
      validated.rawEvidencePackageSha256,
    );
    if (attestation.status === 'INVALID') {
      blockReasons.push('INVALID_EVIDENCE_ATTESTATION');
    } else if (attestation.status === 'DIGEST_MISMATCH') {
      blockReasons.push('EVIDENCE_ARTIFACT_DIGEST_MISMATCH');
    } else if (attestation.status === 'MISSING') {
      incompleteReasons.push('EVIDENCE_ATTESTATION_MISSING');
    } else if (attestation.status === 'UNAPPROVED') {
      incompleteReasons.push('EVIDENCE_ARTIFACT_NOT_APPROVED');
    }

    if (blockReasons.length > 0) {
      return createResult('BLOCK', [...blockReasons, ...incompleteReasons], aggregate);
    }
    if (incompleteReasons.length > 0) {
      return createResult('INCOMPLETE', incompleteReasons, aggregate);
    }
    return createResult('PROMOTE', ['ALL_PROMOTION_GATES_PASSED'], aggregate);
  } catch (error) {
    const code = error instanceof GateValidationError ? error.code : 'INVALID_INPUT';
    return validationFailureResult(code, policy);
  }
}
