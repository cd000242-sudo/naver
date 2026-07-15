import { EVALUATED_V3_CONTENT_MODES } from '../contentPipeline/mode.js';
import { CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 } from './candidateRuntimeFingerprint.js';
import { APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256 } from './evidenceAttestation.js';
import { CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST } from './releaseActivationManifest.js';

export { CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST } from './releaseActivationManifest.js';

export const CONTENT_QUALITY_V3_RELEASE_ACTIVATION_SCHEMA_VERSION = 1 as const;

type EvaluatedContentMode = typeof EVALUATED_V3_CONTENT_MODES[number];

export interface ContentQualityV3ReleaseActivationManifest {
  readonly schemaVersion: typeof CONTENT_QUALITY_V3_RELEASE_ACTIVATION_SCHEMA_VERSION;
  readonly evidenceArtifactSha256: string | null;
  readonly candidateRuntimeSha256: string | null;
  readonly contentModes: readonly EvaluatedContentMode[];
}

export type ContentQualityV3ReleaseActivationStatus =
  | 'INACTIVE'
  | 'INVALID'
  | 'UNAPPROVED'
  | 'STALE_RUNTIME'
  | 'ACTIVE';

export interface ContentQualityV3ReleaseActivationResult {
  readonly status: ContentQualityV3ReleaseActivationStatus;
  readonly contentModes: readonly EvaluatedContentMode[];
}

export interface ProductionContentQualityV3Activation {
  readonly requestedMode: 'legacy' | 'v3';
  readonly v3Allowlist: readonly EvaluatedContentMode[];
}

const EMPTY_CONTENT_MODES: readonly EvaluatedContentMode[] = Object.freeze([]);
const MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'evidenceArtifactSha256',
  'candidateRuntimeSha256',
  'contentModes',
] as const);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

class InvalidReleaseActivationManifestError extends Error {}

function invalid(): never {
  throw new InvalidReleaseActivationManifestError('INVALID_RELEASE_ACTIVATION_MANIFEST');
}

function readStrictManifestRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== MANIFEST_KEYS.length
    || keys.some(key => typeof key !== 'string' || !MANIFEST_KEYS.includes(key as never))
  ) invalid();

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const record: Record<string, unknown> = {};
  for (const key of MANIFEST_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) invalid();
    record[key] = descriptor.value;
  }
  return Object.freeze(record);
}

function isEvaluatedContentMode(value: unknown): value is EvaluatedContentMode {
  return typeof value === 'string'
    && EVALUATED_V3_CONTENT_MODES.some(contentMode => contentMode === value);
}

function readContentModes(value: unknown): readonly EvaluatedContentMode[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
  const length = lengthDescriptor.value;
  if (
    typeof length !== 'number'
    || !Number.isSafeInteger(length)
    || length < 0
    || length > EVALUATED_V3_CONTENT_MODES.length
  ) invalid();

  const expectedKeys = new Set([
    'length',
    ...Array.from({ length }, (_, index) => String(index)),
  ]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.size
    || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
  ) invalid();

  const modes: EvaluatedContentMode[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || !isEvaluatedContentMode(descriptor.value)) {
      invalid();
    }
    if (modes.includes(descriptor.value)) invalid();
    modes.push(descriptor.value);
  }
  return Object.freeze(modes);
}

function readNullableSha256(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) invalid();
  return value;
}

function isApprovedEvidenceArtifact(digest: string): boolean {
  for (
    let index = 0;
    index < APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256.length;
    index += 1
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(
      APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256,
      String(index),
    );
    if (descriptor && 'value' in descriptor && descriptor.value === digest) return true;
  }
  return false;
}

function result(
  status: ContentQualityV3ReleaseActivationStatus,
  contentModes: readonly EvaluatedContentMode[] = EMPTY_CONTENT_MODES,
): ContentQualityV3ReleaseActivationResult {
  return Object.freeze({ status, contentModes });
}

export function evaluateContentQualityV3ReleaseActivation(
  value: unknown,
): ContentQualityV3ReleaseActivationResult {
  try {
    const record = readStrictManifestRecord(value);
    if (record.schemaVersion !== CONTENT_QUALITY_V3_RELEASE_ACTIVATION_SCHEMA_VERSION) {
      return result('INVALID');
    }

    const evidenceArtifactSha256 = readNullableSha256(record.evidenceArtifactSha256);
    const candidateRuntimeSha256 = readNullableSha256(record.candidateRuntimeSha256);
    const contentModes = readContentModes(record.contentModes);

    if (
      evidenceArtifactSha256 === null
      && candidateRuntimeSha256 === null
      && contentModes.length === 0
    ) return result('INACTIVE');
    if (evidenceArtifactSha256 === null || candidateRuntimeSha256 === null) {
      return result('INVALID');
    }
    if (contentModes.length === 0) return result('INACTIVE');
    if (!isApprovedEvidenceArtifact(evidenceArtifactSha256)) return result('UNAPPROVED');
    if (
      !SHA256_PATTERN.test(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256)
      || candidateRuntimeSha256 !== CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256
    ) return result('STALE_RUNTIME');

    return result('ACTIVE', contentModes);
  } catch {
    return result('INVALID');
  }
}

const CURRENT_RELEASE_ACTIVATION = evaluateContentQualityV3ReleaseActivation(
  CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST,
);

export function resolveProductionContentQualityV3Activation(
  contentMode: unknown,
  provider: unknown,
): ProductionContentQualityV3Activation {
  const isActivatedMode = CURRENT_RELEASE_ACTIVATION.status === 'ACTIVE'
    && provider === 'gemini'
    && isEvaluatedContentMode(contentMode)
    && CURRENT_RELEASE_ACTIVATION.contentModes.includes(contentMode);
  return Object.freeze({
    requestedMode: isActivatedMode ? 'v3' : 'legacy',
    v3Allowlist: isActivatedMode
      ? CURRENT_RELEASE_ACTIVATION.contentModes
      : EMPTY_CONTENT_MODES,
  });
}

export function resolveProductionContentQualityV3PipelineMode(
  contentMode: unknown,
  provider: unknown,
): 'legacy' | 'v3' {
  return resolveProductionContentQualityV3Activation(contentMode, provider).requestedMode;
}
