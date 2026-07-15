import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST,
} from './evalCaseManifest.js';
import { CONTENT_QUALITY_V3_RELEASE_CORPUS } from './evalCorpus.js';
import {
  buildContentQualityV3Prompt,
  createContentQualityV3InitialPromptOptions,
} from './prompt.js';
import { CONTENT_QUALITY_V3_OUTPUT_SCHEMA } from './schema.js';
import { CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 } from './candidateRuntimeFingerprint.js';

export const CONTENT_QUALITY_V3_LEGACY_BASELINE_RELATIVE_PATH =
  '../../docs/content-quality-v3/legacy-baseline.json' as const;

export interface CurrentContentQualityV3EvidenceBindings {
  readonly promptBundleSha256: string;
  readonly outputSchemaSha256: string;
  readonly corpusSha256: string;
  readonly legacyBaselineSha256: string;
  readonly candidateRuntimeSha256: string;
}

class CurrentEvidenceBindingsError extends Error {
  readonly code = 'CURRENT_EVIDENCE_BINDINGS_UNAVAILABLE' as const;

  constructor() {
    super('CURRENT_EVIDENCE_BINDINGS_UNAVAILABLE');
    this.name = 'CurrentEvidenceBindingsError';
  }
}

let cachedBindings: CurrentContentQualityV3EvidenceBindings | undefined;

function invalidCurrentArtifact(): never {
  throw new CurrentEvidenceBindingsError();
}

function canonicalizeCurrentArtifact(value: unknown, ancestors: WeakSet<object>): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidCurrentArtifact();
    return JSON.stringify(value);
  }
  if (typeof value !== 'object' || ancestors.has(value)) invalidCurrentArtifact();
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) invalidCurrentArtifact();
      const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
        string,
        PropertyDescriptor
      >;
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !('value' in lengthDescriptor)) invalidCurrentArtifact();
      const rawLength = lengthDescriptor.value;
      if (typeof rawLength !== 'number' || !Number.isSafeInteger(rawLength) || rawLength < 0) {
        invalidCurrentArtifact();
      }
      const expectedKeys = new Set([
        'length',
        ...Array.from({ length: rawLength }, (_, index) => String(index)),
      ]);
      const keys = Reflect.ownKeys(value);
      if (
        keys.length !== expectedKeys.size
        || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
      ) invalidCurrentArtifact();
      return `[${Array.from({ length: rawLength }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) invalidCurrentArtifact();
        return canonicalizeCurrentArtifact(descriptor.value, ancestors);
      }).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalidCurrentArtifact();
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) invalidCurrentArtifact();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return `{${(keys as string[]).sort().map(key => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) invalidCurrentArtifact();
      return `${JSON.stringify(key)}:${canonicalizeCurrentArtifact(
        descriptor.value,
        ancestors,
      )}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function hashCanonicalCurrentArtifact(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeCurrentArtifact(value, new WeakSet()), 'utf8')
    .digest('hex');
}

function buildCurrentPromptBundle(): readonly Readonly<Record<string, unknown>>[] {
  return Object.freeze(CONTENT_QUALITY_V3_RELEASE_CORPUS.map(evalCase => {
    const options = createContentQualityV3InitialPromptOptions({
      mode: evalCase.stratum,
      source: evalCase.source,
      minChars: evalCase.minChars,
    });
    return Object.freeze({
      caseId: evalCase.caseId,
      options,
      prompt: buildContentQualityV3Prompt(options),
    });
  }));
}

function hashLegacyBaseline(): string {
  try {
    const baselinePath = resolve(
      __dirname,
      CONTENT_QUALITY_V3_LEGACY_BASELINE_RELATIVE_PATH,
    );
    return createHash('sha256').update(readFileSync(baselinePath)).digest('hex');
  } catch {
    return invalidCurrentArtifact();
  }
}

function deriveCurrentBindings(): CurrentContentQualityV3EvidenceBindings {
  return Object.freeze({
    promptBundleSha256: hashCanonicalCurrentArtifact(buildCurrentPromptBundle()),
    outputSchemaSha256: hashCanonicalCurrentArtifact(CONTENT_QUALITY_V3_OUTPUT_SCHEMA),
    corpusSha256: hashCanonicalCurrentArtifact(Object.freeze({
      releaseCorpus: CONTENT_QUALITY_V3_RELEASE_CORPUS,
      releaseManifest: CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST,
    })),
    legacyBaselineSha256: hashLegacyBaseline(),
    candidateRuntimeSha256: CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256,
  });
}

export function getCurrentContentQualityV3EvidenceBindings():
  CurrentContentQualityV3EvidenceBindings {
  if (cachedBindings === undefined) cachedBindings = deriveCurrentBindings();
  return cachedBindings;
}
