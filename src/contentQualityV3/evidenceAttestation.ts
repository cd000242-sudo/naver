import { createHash } from 'node:crypto';

import { CONTENT_QUALITY_V3_GEMINI_MODEL } from './providerPolicy.js';
import { getCurrentContentQualityV3EvidenceBindings } from './currentEvidenceBindings.js';
import { APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256 } from './approvedEvidenceArtifacts.js';

export { APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256 } from './approvedEvidenceArtifacts.js';

export const CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION = 2 as const;
export const CONTENT_QUALITY_V3_EVIDENCE_PROVIDER = 'gemini' as const;
export const CONTENT_QUALITY_V3_EVIDENCE_MODEL = CONTENT_QUALITY_V3_GEMINI_MODEL;
export const CONTENT_QUALITY_V3_EVIDENCE_LOCALE = 'ko-KR' as const;

export interface ContentQualityV3EvidenceAttestationMetadata {
  readonly schemaVersion: typeof CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION;
  readonly provider: typeof CONTENT_QUALITY_V3_EVIDENCE_PROVIDER;
  readonly model: typeof CONTENT_QUALITY_V3_EVIDENCE_MODEL;
  readonly locale: typeof CONTENT_QUALITY_V3_EVIDENCE_LOCALE;
  readonly runId: string;
  readonly promptBundleSha256: string;
  readonly outputSchemaSha256: string;
  readonly corpusSha256: string;
  readonly legacyBaselineSha256: string;
  readonly candidateRuntimeSha256: string;
  readonly rawEvidencePackageSha256: string;
}

export interface ContentQualityV3EvidenceAttestation
  extends ContentQualityV3EvidenceAttestationMetadata {
  readonly artifactSha256: string;
}

export interface ContentQualityV3CanonicalEvidence {
  readonly cases: readonly unknown[];
  readonly pairwiseJudgments: readonly unknown[];
}

export type ContentQualityV3EvidenceAttestationStatus =
  | 'MISSING'
  | 'INVALID'
  | 'DIGEST_MISMATCH'
  | 'UNAPPROVED'
  | 'APPROVED';

export interface ContentQualityV3EvidenceAttestationResult {
  readonly status: ContentQualityV3EvidenceAttestationStatus;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_CANONICAL_ARRAY_LENGTH = 50_000;
const MAX_CANONICAL_OBJECT_KEYS = 64;
const MAX_CANONICAL_STRING_CHARS = 4_096;
const MAX_CANONICAL_DEPTH = 16;
const MAX_CANONICAL_NODES = 1_000_000;
const MAX_CANONICAL_TOTAL_STRING_CHARS = 64 * 1024 * 1024;
const METADATA_KEYS = Object.freeze([
  'schemaVersion',
  'provider',
  'model',
  'locale',
  'runId',
  'promptBundleSha256',
  'outputSchemaSha256',
  'corpusSha256',
  'legacyBaselineSha256',
  'candidateRuntimeSha256',
  'rawEvidencePackageSha256',
] as const);
const ATTESTATION_KEYS = Object.freeze([...METADATA_KEYS, 'artifactSha256'] as const);
const EVIDENCE_KEYS = Object.freeze(['cases', 'pairwiseJudgments'] as const);

class EvidenceAttestationValidationError extends Error {}

function invalid(): never {
  throw new EvidenceAttestationValidationError('INVALID_EVIDENCE_ATTESTATION');
}

function readStrictRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();

  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) invalid();

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) invalid();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function readSha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) invalid();
  return value;
}

function readMetadata(value: unknown): ContentQualityV3EvidenceAttestationMetadata {
  const record = readStrictRecord(value, METADATA_KEYS);
  if (
    record.schemaVersion !== CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION
    || record.provider !== CONTENT_QUALITY_V3_EVIDENCE_PROVIDER
    || record.model !== CONTENT_QUALITY_V3_EVIDENCE_MODEL
    || record.locale !== CONTENT_QUALITY_V3_EVIDENCE_LOCALE
    || typeof record.runId !== 'string'
    || !RUN_ID_PATTERN.test(record.runId)
  ) invalid();

  return Object.freeze({
    schemaVersion: CONTENT_QUALITY_V3_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
    provider: CONTENT_QUALITY_V3_EVIDENCE_PROVIDER,
    model: CONTENT_QUALITY_V3_EVIDENCE_MODEL,
    locale: CONTENT_QUALITY_V3_EVIDENCE_LOCALE,
    runId: record.runId,
    promptBundleSha256: readSha256(record.promptBundleSha256),
    outputSchemaSha256: readSha256(record.outputSchemaSha256),
    corpusSha256: readSha256(record.corpusSha256),
    legacyBaselineSha256: readSha256(record.legacyBaselineSha256),
    candidateRuntimeSha256: readSha256(record.candidateRuntimeSha256),
    rawEvidencePackageSha256: readSha256(record.rawEvidencePackageSha256),
  });
}

function readAttestation(value: unknown): ContentQualityV3EvidenceAttestation {
  const record = readStrictRecord(value, ATTESTATION_KEYS);
  const metadata = readMetadata(Object.fromEntries(
    METADATA_KEYS.map(key => [key, record[key]]),
  ));
  return Object.freeze({
    ...metadata,
    artifactSha256: readSha256(record.artifactSha256),
  });
}

interface CanonicalBudget {
  remainingNodes: number;
  remainingStringChars: number;
}

function canonicalize(
  value: unknown,
  ancestors: WeakSet<object>,
  budget: CanonicalBudget,
  depth = 0,
): string {
  budget.remainingNodes -= 1;
  if (budget.remainingNodes < 0 || depth > MAX_CANONICAL_DEPTH) invalid();
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.length > MAX_CANONICAL_STRING_CHARS) invalid();
    budget.remainingStringChars -= value.length;
    if (budget.remainingStringChars < 0) invalid();
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid();
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') invalid();
  if (ancestors.has(value)) invalid();
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
      const rawLength = lengthDescriptor.value;
      if (
        typeof rawLength !== 'number'
        || !Number.isSafeInteger(rawLength)
        || rawLength < 0
        || rawLength > MAX_CANONICAL_ARRAY_LENGTH
      ) invalid();
      const length = rawLength;
      const expectedKeys = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
      const keys = Reflect.ownKeys(value);
      if (keys.length !== expectedKeys.size || keys.some(key => (
        typeof key !== 'string' || !expectedKeys.has(key)
      ))) invalid();
      const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
        string,
        PropertyDescriptor
      >;
      return `[${Array.from({ length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) invalid();
        return canonicalize(descriptor.value, ancestors, budget, depth + 1);
      }).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > MAX_CANONICAL_OBJECT_KEYS
      || keys.some(key => typeof key !== 'string')
    ) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return `{${(keys as string[]).sort().map(key => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) invalid();
      return `${JSON.stringify(key)}:${canonicalize(
        descriptor.value,
        ancestors,
        budget,
        depth + 1,
      )}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function computeContentQualityV3EvidenceArtifactSha256(
  evidence: ContentQualityV3CanonicalEvidence,
  metadata: ContentQualityV3EvidenceAttestationMetadata,
): string {
  const validatedEvidence = readStrictRecord(evidence, EVIDENCE_KEYS);
  const validatedMetadata = readMetadata(metadata);
  const payload = Object.freeze({
    cases: validatedEvidence.cases,
    metadata: validatedMetadata,
    pairwiseJudgments: validatedEvidence.pairwiseJudgments,
  });
  return createHash('sha256').update(canonicalize(
    payload,
    new WeakSet(),
    {
      remainingNodes: MAX_CANONICAL_NODES,
      remainingStringChars: MAX_CANONICAL_TOTAL_STRING_CHARS,
    },
  ), 'utf8').digest('hex');
}

function result(
  status: ContentQualityV3EvidenceAttestationStatus,
): ContentQualityV3EvidenceAttestationResult {
  return Object.freeze({ status });
}

function isApprovedArtifactSha256(digest: string): boolean {
  // This source-review boundary is integrity approval, not a signature or proof
  // that a particular person performed the recorded judgments.
  for (let index = 0; index < APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256,
      String(index),
    );
    if (descriptor && 'value' in descriptor && descriptor.value === digest) return true;
  }
  return false;
}

function pinsCurrentArtifacts(attestation: ContentQualityV3EvidenceAttestation): boolean {
  const current = getCurrentContentQualityV3EvidenceBindings();
  return attestation.promptBundleSha256 === current.promptBundleSha256
    && attestation.outputSchemaSha256 === current.outputSchemaSha256
    && attestation.corpusSha256 === current.corpusSha256
    && attestation.legacyBaselineSha256 === current.legacyBaselineSha256
    && attestation.candidateRuntimeSha256 === current.candidateRuntimeSha256;
}

export function evaluateContentQualityV3EvidenceAttestation(
  value: unknown,
  evidence: ContentQualityV3CanonicalEvidence,
  expectedRunId: string | undefined,
  expectedRawEvidencePackageSha256: string | undefined,
): ContentQualityV3EvidenceAttestationResult {
  if (value === undefined) return result('MISSING');

  try {
    const attestation = readAttestation(value);
    if (expectedRunId === undefined || attestation.runId !== expectedRunId) {
      return result('INVALID');
    }
    if (!pinsCurrentArtifacts(attestation)) return result('INVALID');
    if (
      expectedRawEvidencePackageSha256 === undefined
      || !SHA256_PATTERN.test(expectedRawEvidencePackageSha256)
      || attestation.rawEvidencePackageSha256 !== expectedRawEvidencePackageSha256
    ) return result('INVALID');
    const {
      artifactSha256: _artifactSha256,
      ...metadata
    } = attestation;
    const actualArtifactSha256 = computeContentQualityV3EvidenceArtifactSha256(
      evidence,
      metadata,
    );
    if (attestation.artifactSha256 !== actualArtifactSha256) {
      return result('DIGEST_MISMATCH');
    }
    const approved = isApprovedArtifactSha256(actualArtifactSha256);
    return result(approved ? 'APPROVED' : 'UNAPPROVED');
  } catch {
    return result('INVALID');
  }
}
