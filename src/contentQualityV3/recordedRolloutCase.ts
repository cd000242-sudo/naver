import type { ContentQualityV3MachineAssessmentCase } from './evalAssessor.js';
import type { ProviderCaseDisposition, RolloutCaseMetrics } from './rolloutGate.js';

export interface ContentQualityV3MeasuredRolloutCaseBase {
  readonly caseId: string;
  readonly stratum: string;
  readonly candidateOutputSha256: string;
  readonly legacyOutputSha256: string;
  readonly requestSha256: string;
  readonly providerResponseSha256: string;
}

export interface ContentQualityV3MeasuredPassEvidence
  extends ContentQualityV3MeasuredRolloutCaseBase {
  readonly disposition: 'PASS';
  readonly candidateQualityScore: number;
  readonly legacyQualityScore: number;
  readonly costRatio: number;
  readonly latencyRatio: number;
}

export interface ContentQualityV3MeasuredNonPassEvidence
  extends ContentQualityV3MeasuredRolloutCaseBase {
  readonly disposition: Exclude<ProviderCaseDisposition, 'PASS'>;
}

export type ContentQualityV3MeasuredRolloutCaseEvidence =
  | ContentQualityV3MeasuredPassEvidence
  | ContentQualityV3MeasuredNonPassEvidence;

export type ContentQualityV3RecordedRolloutCase = Readonly<RolloutCaseMetrics>;

export const CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE_ERROR =
  'INVALID_CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE' as const;

export class ContentQualityV3RecordedRolloutCaseError extends Error {
  readonly code = CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE_ERROR;

  constructor() {
    super(CONTENT_QUALITY_V3_RECORDED_ROLLOUT_CASE_ERROR);
    this.name = 'ContentQualityV3RecordedRolloutCaseError';
  }
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const STRATUM_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_SAFETY_COUNT = 10_000;
const MAX_RATIO = 1_000_000;

const MACHINE_KEYS = Object.freeze([
  'caseId',
  'stratum',
  'disposition',
  'schemaValid',
  'publishable',
  'criticalHallucinationCount',
  'fakeFirstPersonCount',
  'unsupportedCurrentNumberCount',
] as const);

const MEASURED_BASE_KEYS = Object.freeze([
  'caseId',
  'stratum',
  'disposition',
  'candidateOutputSha256',
  'legacyOutputSha256',
  'requestSha256',
  'providerResponseSha256',
] as const);

const MEASURED_PASS_KEYS = Object.freeze([
  ...MEASURED_BASE_KEYS,
  'candidateQualityScore',
  'legacyQualityScore',
  'costRatio',
  'latencyRatio',
] as const);

function invalid(): never {
  throw new ContentQualityV3RecordedRolloutCaseError();
}

function readPlainDataRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();

  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string')) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) invalid();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => !expectedKeys.includes(key))
  ) invalid();
}

function readIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) invalid();
  return value;
}

function readStratum(value: unknown): string {
  if (typeof value !== 'string' || !STRATUM_PATTERN.test(value)) invalid();
  return value;
}

function readSha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) invalid();
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid();
  return value;
}

function readInteger(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_SAFETY_COUNT
  ) invalid();
  return value;
}

function readMetric(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > maximum
  ) invalid();
  return value;
}

function readMachineAssessment(value: unknown): ContentQualityV3MachineAssessmentCase {
  const record = readPlainDataRecord(value);
  requireExactKeys(record, MACHINE_KEYS);
  const disposition = record.disposition;
  if (disposition !== 'NOT_RUN' && disposition !== 'PRODUCT_FAIL') invalid();
  const assessment = Object.freeze({
    caseId: readIdentifier(record.caseId),
    stratum: readStratum(record.stratum),
    disposition,
    schemaValid: readBoolean(record.schemaValid),
    publishable: readBoolean(record.publishable),
    criticalHallucinationCount: readInteger(record.criticalHallucinationCount),
    fakeFirstPersonCount: readInteger(record.fakeFirstPersonCount),
    unsupportedCurrentNumberCount: readInteger(record.unsupportedCurrentNumberCount),
  });
  const safetyPassed = assessment.schemaValid
    && assessment.publishable
    && assessment.criticalHallucinationCount === 0
    && assessment.fakeFirstPersonCount === 0
    && assessment.unsupportedCurrentNumberCount === 0;
  if ((assessment.disposition === 'NOT_RUN') !== safetyPassed) invalid();
  return assessment;
}

function readMeasuredEvidence(value: unknown): ContentQualityV3MeasuredRolloutCaseEvidence {
  const record = readPlainDataRecord(value);
  const disposition = record.disposition;
  if (!['PASS', 'PRODUCT_FAIL', 'INFRA_EXTERNAL', 'NOT_RUN'].includes(disposition as string)) {
    invalid();
  }
  requireExactKeys(
    record,
    disposition === 'PASS' ? MEASURED_PASS_KEYS : MEASURED_BASE_KEYS,
  );
  const base = Object.freeze({
    caseId: readIdentifier(record.caseId),
    stratum: readStratum(record.stratum),
    disposition: disposition as ProviderCaseDisposition,
    candidateOutputSha256: readSha256(record.candidateOutputSha256),
    legacyOutputSha256: readSha256(record.legacyOutputSha256),
    requestSha256: readSha256(record.requestSha256),
    providerResponseSha256: readSha256(record.providerResponseSha256),
  });
  if (base.disposition !== 'PASS') {
    return base as ContentQualityV3MeasuredNonPassEvidence;
  }
  return Object.freeze({
    ...base,
    disposition: 'PASS' as const,
    candidateQualityScore: readMetric(record.candidateQualityScore, 100),
    legacyQualityScore: readMetric(record.legacyQualityScore, 100),
    costRatio: readMetric(record.costRatio, MAX_RATIO),
    latencyRatio: readMetric(record.latencyRatio, MAX_RATIO),
  });
}

function buildRecordedRolloutCase(
  machineAssessment: unknown,
  measuredEvidence: unknown,
): ContentQualityV3RecordedRolloutCase {
  const machine = readMachineAssessment(machineAssessment);
  const measured = readMeasuredEvidence(measuredEvidence);
  if (machine.caseId !== measured.caseId || machine.stratum !== measured.stratum) invalid();
  if (machine.disposition === 'PRODUCT_FAIL' && measured.disposition !== 'PRODUCT_FAIL') {
    invalid();
  }

  const provenance = Object.freeze({
    candidateOutputSha256: measured.candidateOutputSha256,
    legacyOutputSha256: measured.legacyOutputSha256,
    requestSha256: measured.requestSha256,
    providerResponseSha256: measured.providerResponseSha256,
  });
  if (measured.disposition !== 'PASS') {
    return Object.freeze({
      caseId: machine.caseId,
      stratum: machine.stratum,
      disposition: measured.disposition,
      ...provenance,
    });
  }
  return Object.freeze({
    caseId: machine.caseId,
    stratum: machine.stratum,
    disposition: 'PASS' as const,
    schemaValid: machine.schemaValid,
    publishable: machine.publishable,
    criticalHallucinationCount: machine.criticalHallucinationCount,
    fakeFirstPersonCount: machine.fakeFirstPersonCount,
    unsupportedCurrentNumberCount: machine.unsupportedCurrentNumberCount,
    candidateQualityScore: measured.candidateQualityScore,
    legacyQualityScore: measured.legacyQualityScore,
    costRatio: measured.costRatio,
    latencyRatio: measured.latencyRatio,
    ...provenance,
  });
}

/**
 * Combines source-controlled machine safety findings with independently
 * recorded performance/provenance. It never invents a hash or score.
 */
export function buildContentQualityV3RecordedRolloutCase(
  machineAssessment: ContentQualityV3MachineAssessmentCase,
  measuredEvidence: ContentQualityV3MeasuredRolloutCaseEvidence,
): ContentQualityV3RecordedRolloutCase {
  try {
    return buildRecordedRolloutCase(machineAssessment, measuredEvidence);
  } catch (error) {
    if (error instanceof ContentQualityV3RecordedRolloutCaseError) throw error;
    return invalid();
  }
}
