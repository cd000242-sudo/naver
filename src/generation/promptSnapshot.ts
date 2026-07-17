import { createHash } from 'node:crypto';

export const PROMPT_SNAPSHOT_VERSION = 'prompt-snapshot.v1' as const;
export const PROVIDER_PROMPT_ENVELOPE_VERSION = 'provider-prompt-envelope.v1' as const;

/**
 * A JSON-only value prevents executable objects, functions, and credentials
 * from crossing the prompt contract boundary unnoticed.
 */
export type PromptPrimitive =
  | string
  | number
  | boolean
  | null;

export interface PromptArray extends ReadonlyArray<PromptValue> {}

export interface PromptObject {
  readonly [key: string]: PromptValue;
}

export type PromptValue = PromptPrimitive | PromptArray | PromptObject;

export type PromptSemanticFields = PromptObject;

export interface PromptProvenanceInput {
  source: string;
  templateVersion?: string;
  inputIds?: readonly string[];
}

export interface PromptProvenance {
  readonly source: string;
  readonly templateVersion?: string;
  readonly inputIds: readonly string[];
}

export interface PromptSnapshotInput {
  promptVersion: string;
  provenance: PromptProvenanceInput;
  /**
   * Provider-neutral meaning of the request. Values are preserved verbatim;
   * adapters are not allowed to rewrite this object.
   */
  semantic: Record<string, unknown>;
  /**
   * Exact user-approved disclosure/compliance text. Whitespace is preserved
   * deliberately because these fragments are contractual copy, not advice.
   */
  lockedComplianceFragments: readonly string[];
}

export interface PromptSnapshot {
  readonly version: typeof PROMPT_SNAPSHOT_VERSION;
  readonly promptVersion: string;
  readonly provenance: PromptProvenance;
  readonly semantic: PromptSemanticFields;
  readonly lockedComplianceFragments: readonly string[];
  /** SHA-256 of the versioned provider-neutral payload; it contains no raw prompt text. */
  readonly hash: string;
}

export interface ProviderPromptAdapterInput {
  /** A connector/tool/model identifier. Credentials never belong in this field. */
  provider: string;
  /** Optional provider-specific response-shape request. */
  outputSchema?: PromptValue;
  /** Optional non-secret provider transport selector, such as protocol or tool name. */
  transport?: Record<string, unknown>;
}

export interface ProviderPromptEnvelope {
  readonly version: typeof PROVIDER_PROMPT_ENVELOPE_VERSION;
  readonly provider: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly provenance: PromptProvenance;
  readonly semantic: PromptSemanticFields;
  readonly lockedComplianceFragments: readonly string[];
  readonly outputSchema?: PromptValue;
  readonly transport?: PromptSemanticFields;
}

type MutablePromptPrimitive =
  | string
  | number
  | boolean
  | null;

interface MutablePromptArray extends Array<MutablePromptValue> {}

interface MutablePromptObject {
  [key: string]: MutablePromptValue;
}

type MutablePromptValue = MutablePromptPrimitive | MutablePromptArray | MutablePromptObject;

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ADAPTER_ALLOWED_FIELDS = new Set(['provider', 'outputSchema', 'transport']);
const ADAPTER_PROTECTED_FIELDS = new Map<string, string>([
  ['semantic', 'semantic'],
  ['lockedComplianceFragments', 'locked compliance fragments'],
  ['promptVersion', 'prompt version'],
  ['promptHash', 'prompt hash'],
  ['hash', 'prompt hash'],
  ['provenance', 'provenance'],
  ['version', 'version'],
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`${label} must be a plain object`);

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol properties`);
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`${label}.${key} is not allowed`);
    }
  }

  return value;
}

function requireMetadataString(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long`);
  return normalized;
}

function clonePromptValue(
  value: unknown,
  label: string,
  ancestors = new Set<object>(),
): MutablePromptValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must contain finite numbers`);
    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error(`${label} must not contain circular references`);
    ancestors.add(value);
    const copy = value.map((entry, index) => clonePromptValue(entry, `${label}[${index}]`, ancestors));
    ancestors.delete(value);
    return copy;
  }

  const record = requirePlainRecord(value, label);
  if (ancestors.has(record)) throw new Error(`${label} must not contain circular references`);
  ancestors.add(record);
  const copy: Record<string, MutablePromptValue> = {};
  for (const key of Object.keys(record)) {
    copy[key] = clonePromptValue(record[key], `${label}.${key}`, ancestors);
  }
  ancestors.delete(record);
  return copy;
}

function clonePromptRecord(value: unknown, label: string): Record<string, MutablePromptValue> {
  const copy = clonePromptValue(value, label);
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) {
    throw new Error(`${label} must be a plain object`);
  }
  return copy;
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeDeep(child);
  }
  return Object.freeze(value);
}

function cloneProvenance(value: unknown): PromptProvenance {
  const record = requirePlainRecord(value, 'provenance');
  const source = requireMetadataString(record.source, 'provenance.source');
  const templateVersion = record.templateVersion === undefined
    ? undefined
    : requireMetadataString(record.templateVersion, 'provenance.templateVersion');

  const rawInputIds = record.inputIds === undefined ? [] : record.inputIds;
  if (!Array.isArray(rawInputIds)) throw new Error('provenance.inputIds must be an array');
  if (rawInputIds.length > 128) throw new Error('provenance.inputIds has too many values');
  const inputIds = rawInputIds.map((inputId, index) => (
    requireMetadataString(inputId, `provenance.inputIds[${index}]`, 256)
  ));

  return {
    source,
    ...(templateVersion === undefined ? {} : { templateVersion }),
    inputIds,
  };
}

function cloneLockedComplianceFragments(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('locked compliance fragments must contain at least one fragment');
  }
  if (value.length > 64) throw new Error('locked compliance fragments has too many values');

  return value.map((fragment, index) => {
    if (typeof fragment !== 'string' || !fragment.trim()) {
      throw new Error(`locked compliance fragment ${index} must be a non-empty string`);
    }
    if (fragment.length > 20_000) {
      throw new Error(`locked compliance fragment ${index} is too long`);
    }
    return fragment;
  });
}

function stableSerialize(value: PromptValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const record = value as PromptObject;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function hashPromptPayload(payload: unknown): string {
  const canonicalPayload = clonePromptValue(payload, 'prompt hash payload') as PromptValue;
  return createHash('sha256').update(stableSerialize(canonicalPayload), 'utf8').digest('hex');
}

function buildSnapshot(input: unknown): PromptSnapshot {
  const record = requirePlainRecord(input, 'prompt snapshot input');
  const promptVersion = requireMetadataString(record.promptVersion, 'promptVersion');
  const provenance = cloneProvenance(record.provenance);
  const semantic = clonePromptRecord(record.semantic, 'semantic');
  if (Object.keys(semantic).length === 0) throw new Error('semantic must contain at least one field');
  const lockedComplianceFragments = cloneLockedComplianceFragments(record.lockedComplianceFragments);

  const payload = {
    version: PROMPT_SNAPSHOT_VERSION,
    promptVersion,
    provenance,
    semantic,
    lockedComplianceFragments,
  };
  const hash = hashPromptPayload(payload);

  return freezeDeep({ ...payload, hash }) as PromptSnapshot;
}

/**
 * Captures provider-neutral writing intent exactly once. The function never
 * logs prompts, metadata, or hashes; callers can persist only the returned
 * hash where audit correlation is needed.
 */
export function createPromptSnapshot(input: PromptSnapshotInput): PromptSnapshot {
  return buildSnapshot(input);
}

function rebuildAndVerifySnapshot(snapshot: PromptSnapshot): PromptSnapshot {
  const record = requirePlainRecord(snapshot, 'prompt snapshot');
  if (record.version !== PROMPT_SNAPSHOT_VERSION) {
    throw new Error('prompt snapshot version is invalid');
  }
  if (typeof record.hash !== 'string' || !/^[a-f0-9]{64}$/.test(record.hash)) {
    throw new Error('prompt snapshot hash is invalid');
  }

  const rebuilt = buildSnapshot({
    promptVersion: record.promptVersion,
    provenance: record.provenance,
    semantic: record.semantic,
    lockedComplianceFragments: record.lockedComplianceFragments,
  });
  if (rebuilt.hash !== record.hash) throw new Error('prompt snapshot integrity check failed');
  return rebuilt;
}

/** Throws when a snapshot has been changed after it was created. */
export function assertPromptSnapshotIntegrity(snapshot: PromptSnapshot): void {
  rebuildAndVerifySnapshot(snapshot);
}

function assertAdapterAddsOnlyAllowedFields(adapter: Record<string, unknown>): void {
  for (const field of Object.keys(adapter)) {
    if (ADAPTER_ALLOWED_FIELDS.has(field)) continue;
    const protectedLabel = ADAPTER_PROTECTED_FIELDS.get(field);
    if (protectedLabel) {
      throw new Error(`provider adapter must not override ${protectedLabel}`);
    }
    throw new Error('provider adapter may only add outputSchema and transport metadata');
  }
}

/**
 * Builds the provider-facing request without granting adapters access to the
 * fields that carry prompt meaning or locked compliance copy. An adapter may
 * add only output-shape and transport selectors.
 */
export function createProviderPromptEnvelope(
  snapshot: PromptSnapshot,
  input: ProviderPromptAdapterInput,
): ProviderPromptEnvelope {
  const verifiedSnapshot = rebuildAndVerifySnapshot(snapshot);
  const adapter = requirePlainRecord(input, 'provider adapter input');
  assertAdapterAddsOnlyAllowedFields(adapter);
  const provider = requireMetadataString(adapter.provider, 'provider');

  const hasOutputSchema = Object.prototype.hasOwnProperty.call(adapter, 'outputSchema');
  const hasTransport = Object.prototype.hasOwnProperty.call(adapter, 'transport');
  const outputSchema = hasOutputSchema
    ? clonePromptValue(adapter.outputSchema, 'outputSchema')
    : undefined;
  const transport = hasTransport
    ? clonePromptRecord(adapter.transport, 'transport')
    : undefined;

  const envelope: ProviderPromptEnvelope = {
    version: PROVIDER_PROMPT_ENVELOPE_VERSION,
    provider,
    promptVersion: verifiedSnapshot.promptVersion,
    promptHash: verifiedSnapshot.hash,
    provenance: cloneProvenance(verifiedSnapshot.provenance),
    semantic: clonePromptRecord(verifiedSnapshot.semantic, 'semantic'),
    lockedComplianceFragments: cloneLockedComplianceFragments(
      verifiedSnapshot.lockedComplianceFragments,
    ),
    ...(hasOutputSchema ? { outputSchema } : {}),
    ...(hasTransport ? { transport } : {}),
  };

  return freezeDeep(envelope);
}
