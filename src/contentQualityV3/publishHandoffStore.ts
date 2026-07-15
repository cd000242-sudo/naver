import { createHash, randomBytes } from 'node:crypto';
import type { StructuredContent } from '../contentGenerator.js';
import {
  enforceContentQualityV3PublicationBoundary,
  forkContentQualityV3PublicationTicket,
  type ContentQualityV3PublicationUserSupplement,
  type ContentQualityV3PublicationTicket,
} from './publicationBoundary.js';
import {
  ContentQualityV3DurableProvenanceRegistry,
  type ContentQualityV3ProvenanceInspection,
} from './durableProvenanceRegistry.js';

export const CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD = '_contentQualityV3PublishHandoff' as const;
export const CONTENT_QUALITY_V3_REQUIRED_FIELD = '_contentQualityV3Required' as const;
export const CONTENT_QUALITY_V3_POST_ID_FIELD = '_contentQualityV3PostId' as const;
export const CONTENT_QUALITY_V3_PUBLISH_HANDOFF_ERROR_PREFIX =
  '[content-quality-v3-publish-handoff]' as const;

export type ContentQualityV3PublishHandoffIssueCode =
  | 'missing_handoff'
  | 'untrusted_handoff'
  | 'owner_mismatch'
  | 'identity_mismatch'
  | 'replayed_handoff'
  | 'expired_handoff'
  | 'superseded_handoff'
  | 'cancelled_handoff'
  | 'app_schedule_unsupported'
  | 'invalid_handoff_state';

export class ContentQualityV3PublishHandoffError extends Error {
  readonly issueCode: ContentQualityV3PublishHandoffIssueCode;

  constructor(issueCode: ContentQualityV3PublishHandoffIssueCode) {
    super(`${CONTENT_QUALITY_V3_PUBLISH_HANDOFF_ERROR_PREFIX} ${issueCode}`);
    this.name = 'ContentQualityV3PublishHandoffError';
    this.issueCode = issueCode;
    Object.freeze(this);
  }
}

export interface ContentQualityV3PublishHandoff {
  readonly handle: string;
  readonly publicationIdentity: string;
  readonly originalContentSha256: string;
}

export interface ContentQualityV3PublishHandoffStoreOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly maxActiveRecords?: number;
  readonly maxTombstones?: number;
  readonly maxOwnerStates?: number;
  readonly provenanceRegistry?: ContentQualityV3DurableProvenanceRegistry;
}

export interface ContentQualityV3PublishHandoffIssuance {
  readonly postId: string;
  readonly handoff: ContentQualityV3PublishHandoff;
}

export interface EnforceContentQualityV3PublishHandoffInput<T> {
  readonly ownerKey: string;
  readonly postId?: unknown;
  readonly required?: boolean;
  readonly handoff?: unknown;
  readonly candidate: T;
  readonly publishMode?: unknown;
  readonly scheduleType?: unknown;
  readonly userSupplements?: readonly ContentQualityV3PublicationUserSupplement[];
  readonly inspectionTexts?: readonly string[];
}

export interface EnforceContentQualityV3PublishPayloadOptions {
  readonly consume?: boolean;
  readonly userSupplements?: readonly ContentQualityV3PublicationUserSupplement[];
  readonly inspectionTexts?: readonly string[];
}

export interface ContentQualityV3PublishPayload {
  readonly title?: unknown;
  readonly content?: unknown;
  readonly lines?: unknown;
  readonly structuredContent?: unknown;
  readonly publishMode?: unknown;
  readonly scheduleType?: unknown;
  readonly _contentQualityV3PublishOwnerKey?: unknown;
  readonly _contentQualityV3PublishHandoff?: unknown;
  readonly _contentQualityV3Required?: unknown;
  readonly _contentQualityV3PostId?: unknown;
  readonly [key: string]: unknown;
}

interface ActiveHandoffRecord {
  readonly postId: string;
  readonly descriptor: ContentQualityV3PublishHandoff;
  readonly ownerKey: string;
  readonly ticket: ContentQualityV3PublicationTicket;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

type HandoffTombstoneReason = 'replayed' | 'expired' | 'superseded' | 'cancelled';

interface HandoffTombstone {
  readonly ownerKey: string;
  readonly publicationIdentity: string;
  readonly reason: HandoffTombstoneReason;
  readonly recordedAt: number;
}

interface OwnerRequirement {
  readonly activeHandle?: string;
  readonly touchedAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_ACTIVE_RECORDS = 256;
const DEFAULT_MAX_TOMBSTONES = 1_024;
const DEFAULT_MAX_OWNER_STATES = 512;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HANDLE_PATTERN = /^v3h_[A-Za-z0-9_-]{32,128}$/;
const IDENTITY_PATTERN = /^v3p_[A-Za-z0-9_-]{32,128}$/;
const HANDOFF_KEYS = Object.freeze([
  'handle',
  'publicationIdentity',
  'originalContentSha256',
] as const);

function fail(issueCode: ContentQualityV3PublishHandoffIssueCode): never {
  throw new ContentQualityV3PublishHandoffError(issueCode);
}

function positiveBoundedInteger(value: unknown, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) return fallback;
  return Math.min(value as number, maximum);
}

function readOwnerKey(value: unknown): string {
  if (typeof value !== 'string') fail('invalid_handoff_state');
  const ownerKey = value.trim();
  if (!ownerKey || ownerKey.length > 512) fail('invalid_handoff_state');
  return ownerKey;
}

function createOpaqueId(prefix: 'v3h_' | 'v3p_'): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function hashInitialContent(content: unknown): string {
  try {
    const bytes = JSON.stringify(content);
    if (typeof bytes !== 'string' || bytes.length === 0) fail('invalid_handoff_state');
    return createHash('sha256').update(bytes, 'utf8').digest('hex');
  } catch (error) {
    if (error instanceof ContentQualityV3PublishHandoffError) throw error;
    return fail('invalid_handoff_state');
  }
}

function readHandoff(value: unknown): ContentQualityV3PublishHandoff | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) fail('untrusted_handoff');
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('untrusted_handoff');
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== HANDOFF_KEYS.length
      || keys.some(key => typeof key !== 'string' || !HANDOFF_KEYS.includes(key as never))
    ) fail('untrusted_handoff');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const values: Record<string, unknown> = {};
    for (const key of HANDOFF_KEYS) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) fail('untrusted_handoff');
      values[key] = descriptor.value;
    }
    if (
      typeof values.handle !== 'string'
      || !HANDLE_PATTERN.test(values.handle)
      || typeof values.publicationIdentity !== 'string'
      || !IDENTITY_PATTERN.test(values.publicationIdentity)
      || typeof values.originalContentSha256 !== 'string'
      || !SHA256_PATTERN.test(values.originalContentSha256)
    ) fail('untrusted_handoff');
    return Object.freeze({
      handle: values.handle,
      publicationIdentity: values.publicationIdentity,
      originalContentSha256: values.originalContentSha256,
    });
  } catch (error) {
    if (error instanceof ContentQualityV3PublishHandoffError) throw error;
    return fail('untrusted_handoff');
  }
}

function tombstoneIssue(reason: HandoffTombstoneReason): ContentQualityV3PublishHandoffIssueCode {
  switch (reason) {
    case 'replayed': return 'replayed_handoff';
    case 'expired': return 'expired_handoff';
    case 'superseded': return 'superseded_handoff';
    case 'cancelled': return 'cancelled_handoff';
  }
}

function readCandidateTitleBody(candidate: unknown): Readonly<{ title: string; body: string }> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail('untrusted_handoff');
  }
  try {
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const titleDescriptor = descriptors.selectedTitle ?? descriptors.title;
    const bodyDescriptor = descriptors.bodyPlain ?? descriptors.content;
    if (
      !titleDescriptor
      || !('value' in titleDescriptor)
      || typeof titleDescriptor.value !== 'string'
      || !bodyDescriptor
      || !('value' in bodyDescriptor)
      || typeof bodyDescriptor.value !== 'string'
    ) fail('untrusted_handoff');
    return Object.freeze({ title: titleDescriptor.value, body: bodyDescriptor.value });
  } catch (error) {
    if (error instanceof ContentQualityV3PublishHandoffError) throw error;
    return fail('untrusted_handoff');
  }
}

export class ContentQualityV3PublishHandoffStore {
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxActiveRecords: number;
  private readonly maxTombstones: number;
  private readonly maxOwnerStates: number;
  private provenanceRegistry: ContentQualityV3DurableProvenanceRegistry | undefined;
  private readonly activeRecords = new Map<string, ActiveHandoffRecord>();
  private readonly tombstones = new Map<string, HandoffTombstone>();
  private readonly ownerRequirements = new Map<string, OwnerRequirement>();
  private operationTail: Promise<void> = Promise.resolve();

  constructor(options: ContentQualityV3PublishHandoffStoreOptions = {}) {
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.ttlMs = positiveBoundedInteger(options.ttlMs, DEFAULT_TTL_MS, 24 * 60 * 60 * 1_000);
    this.maxActiveRecords = positiveBoundedInteger(
      options.maxActiveRecords,
      DEFAULT_MAX_ACTIVE_RECORDS,
      4_096,
    );
    this.maxTombstones = positiveBoundedInteger(
      options.maxTombstones,
      DEFAULT_MAX_TOMBSTONES,
      16_384,
    );
    this.maxOwnerStates = positiveBoundedInteger(
      options.maxOwnerStates,
      DEFAULT_MAX_OWNER_STATES,
      8_192,
    );
    this.provenanceRegistry = options.provenanceRegistry;
  }

  configureProvenanceRegistry(registry: ContentQualityV3DurableProvenanceRegistry): void {
    if (!(registry instanceof ContentQualityV3DurableProvenanceRegistry)) {
      fail('invalid_handoff_state');
    }
    if (this.provenanceRegistry && this.provenanceRegistry !== registry) {
      fail('invalid_handoff_state');
    }
    this.provenanceRegistry = registry;
  }

  issue(
    ownerKeyValue: string,
    initialContent: StructuredContent,
    ticket: ContentQualityV3PublicationTicket,
  ): Promise<ContentQualityV3PublishHandoffIssuance> {
    return this.enqueue(() => this.issueResolved(ownerKeyValue, initialContent, ticket));
  }

  private async issueResolved(
    ownerKeyValue: string,
    initialContent: StructuredContent,
    ticket: ContentQualityV3PublicationTicket,
  ): Promise<ContentQualityV3PublishHandoffIssuance> {
    const ownerKey = readOwnerKey(ownerKeyValue);
    const now = this.readNow();
    await this.expireRecords(now);
    if (!this.ownerRequirements.has(ownerKey) && this.ownerRequirements.size >= this.maxOwnerStates) {
      fail('invalid_handoff_state');
    }

    const previous = this.ownerRequirements.get(ownerKey)?.activeHandle;
    const previousRecord = previous ? this.activeRecords.get(previous) : undefined;
    if (previous && !previousRecord) fail('invalid_handoff_state');
    const nextActiveSize = this.activeRecords.size + (previous ? 0 : 1);
    if (nextActiveSize > this.maxActiveRecords) fail('invalid_handoff_state');
    const registry = this.provenanceRegistry;
    if (!registry) fail('invalid_handoff_state');

    const descriptor = Object.freeze({
      handle: createOpaqueId('v3h_'),
      publicationIdentity: createOpaqueId('v3p_'),
      originalContentSha256: hashInitialContent(initialContent),
    });
    const registration = {
      handoff: descriptor,
      content: {
        selectedTitle: initialContent.selectedTitle,
        bodyPlain: initialContent.bodyPlain,
      },
    } as const;
    const registered = previousRecord
      ? await registry.replaceIssued({
        ...registration,
        supersedePostId: previousRecord.postId,
      })
      : await registry.registerIssued(registration);
    if (previous) this.moveToTombstone(previous, 'superseded', now);
    this.activeRecords.set(descriptor.handle, Object.freeze({
      postId: registered.postId,
      descriptor,
      ownerKey,
      ticket,
      issuedAt: now,
      expiresAt: now + this.ttlMs,
    }));
    this.touchOwner(ownerKey, descriptor.handle, now);
    return Object.freeze({ postId: registered.postId, handoff: descriptor });
  }

  private requireRegistry(): ContentQualityV3DurableProvenanceRegistry {
    if (!this.provenanceRegistry) fail('invalid_handoff_state');
    return this.provenanceRegistry;
  }

  private inspectDurableProvenance<T>(input: Readonly<{
    postId?: unknown;
    required: boolean;
    handoff?: ContentQualityV3PublishHandoff;
    candidate: T;
  }>): Promise<ContentQualityV3ProvenanceInspection> {
    const registry = this.provenanceRegistry;
    if (!registry) {
      if (input.required || input.postId !== undefined || input.handoff !== undefined) {
        fail('invalid_handoff_state');
      }
      return Promise.resolve(Object.freeze({
        kind: 'legacy' as const,
        content: readCandidateTitleBody(input.candidate),
      }));
    }
    return registry.inspectPublish({
      postId: input.postId,
      required: input.required,
      handoff: input.handoff,
      content: readCandidateTitleBody(input.candidate),
    });
  }

  enforceAtPublish<T>(
    input: EnforceContentQualityV3PublishHandoffInput<T>,
  ): Promise<T | StructuredContent> {
    return this.enqueue(() => this.enforceResolvedAtPublish(input, true));
  }

  previewAtPublish<T>(
    input: EnforceContentQualityV3PublishHandoffInput<T>,
  ): Promise<T | StructuredContent> {
    return this.enqueue(() => this.enforceResolvedAtPublish(input, false));
  }

  private async enforceResolvedAtPublish<T>(
    input: EnforceContentQualityV3PublishHandoffInput<T>,
    consume: boolean,
  ): Promise<T | StructuredContent> {
    const ownerKey = readOwnerKey(input.ownerKey);
    const now = this.readNow();
    await this.expireRecords(now);
    const descriptor = readHandoff(input.handoff);
    const required = input.required === true || descriptor !== undefined || input.postId !== undefined;
    if (descriptor && !this.activeRecords.has(descriptor.handle)) {
      const tombstone = this.tombstones.get(descriptor.handle);
      if (tombstone && tombstone.reason !== 'replayed') {
        fail(tombstoneIssue(tombstone.reason));
      }
    }
    const registryInspection = await this.inspectDurableProvenance({
      postId: input.postId,
      required,
      handoff: descriptor,
      candidate: input.candidate,
    });
    if (!descriptor) {
      if (this.ownerRequirements.has(ownerKey)) fail('missing_handoff');
      return input.candidate;
    }

    const record = this.activeRecords.get(descriptor.handle);
    if (!record) {
      fail('untrusted_handoff');
    }
    if (record.ownerKey !== ownerKey) fail('owner_mismatch');
    if (
      record.postId !== input.postId
      ||
      record.descriptor.publicationIdentity !== descriptor.publicationIdentity
      || record.descriptor.originalContentSha256 !== descriptor.originalContentSha256
    ) fail('identity_mismatch');
    if (input.publishMode === 'schedule' && input.scheduleType === 'app-schedule') {
      fail('app_schedule_unsupported');
    }

    const validationTicket = forkContentQualityV3PublicationTicket(record.ticket);
    if (!validationTicket) fail('invalid_handoff_state');
    const validated = enforceContentQualityV3PublicationBoundary(
      input.candidate,
      validationTicket,
      {
        userSupplements: input.userSupplements,
        inspectionTexts: input.inspectionTexts,
      },
    ) as T | StructuredContent;
    if (registryInspection.kind !== 'permit') fail('invalid_handoff_state');
    if (consume) {
      await this.requireRegistry().approveRevision(registryInspection);
      await this.requireRegistry().beginPublish(registryInspection);
      this.moveToTombstone(descriptor.handle, 'replayed', now);
      this.touchOwner(ownerKey, undefined, now);
      return enforceContentQualityV3PublicationBoundary(
        input.candidate,
        record.ticket,
        {
          userSupplements: input.userSupplements,
          inspectionTexts: input.inspectionTexts,
        },
      );
    }
    return validated;
  }

  releaseOwner(ownerKeyValue: string): Promise<void> {
    return this.enqueue(async () => {
    const ownerKey = readOwnerKey(ownerKeyValue);
    const now = this.readNow();
    await this.expireRecords(now);
    const activeHandle = this.ownerRequirements.get(ownerKey)?.activeHandle;
    if (activeHandle) {
      const record = this.activeRecords.get(activeHandle);
      if (!record) fail('invalid_handoff_state');
      await this.requireRegistry().cancelIssued(record.postId);
      this.moveToTombstone(activeHandle, 'cancelled', now);
    }
    this.ownerRequirements.delete(ownerKey);
    });
  }

  private readNow(): number {
    const value = this.now();
    if (!Number.isFinite(value) || value < 0) fail('invalid_handoff_state');
    return Math.floor(value);
  }

  private async expireRecords(now: number): Promise<void> {
    for (const [handle, record] of this.activeRecords) {
      if (record.expiresAt >= now) continue;
      await this.requireRegistry().expireIssued(record.postId);
      this.moveToTombstone(handle, 'expired', now);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private moveToTombstone(
    handle: string,
    reason: HandoffTombstoneReason,
    now: number,
  ): void {
    const record = this.activeRecords.get(handle);
    if (!record) return;
    this.activeRecords.delete(handle);
    const currentOwner = this.ownerRequirements.get(record.ownerKey);
    if (currentOwner?.activeHandle === handle) this.touchOwner(record.ownerKey, undefined, now);
    this.tombstones.set(handle, Object.freeze({
      ownerKey: record.ownerKey,
      publicationIdentity: record.descriptor.publicationIdentity,
      reason,
      recordedAt: now,
    }));
    while (this.tombstones.size > this.maxTombstones) {
      const oldest = this.tombstones.keys().next().value as string | undefined;
      if (!oldest) break;
      this.tombstones.delete(oldest);
    }
  }

  private touchOwner(ownerKey: string, activeHandle: string | undefined, now: number): void {
    if (!this.ownerRequirements.has(ownerKey) && this.ownerRequirements.size >= this.maxOwnerStates) {
      fail('invalid_handoff_state');
    }
    this.ownerRequirements.delete(ownerKey);
    this.ownerRequirements.set(ownerKey, Object.freeze({ activeHandle, touchedAt: now }));
  }
}

export const contentQualityV3PublishHandoffStore = new ContentQualityV3PublishHandoffStore();

function ownPayloadValue(payload: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(payload, key);
    if (!descriptor) return undefined;
    if (!('value' in descriptor)) fail('untrusted_handoff');
    return descriptor.value;
  } catch (error) {
    if (error instanceof ContentQualityV3PublishHandoffError) throw error;
    return fail('untrusted_handoff');
  }
}

function nestedStructuredContentValue(payload: object, key: string): unknown {
  const structuredContent = ownPayloadValue(payload, 'structuredContent');
  if (
    typeof structuredContent !== 'object'
    || structuredContent === null
    || Array.isArray(structuredContent)
  ) return undefined;
  return ownPayloadValue(structuredContent, key);
}

function readRequiredMarker(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (value === true) return true;
  fail('untrusted_handoff');
}

/**
 * Detects a V3 provenance signal without trusting the renderer's removable
 * `required` marker. Callers use this only after the handoff store has accepted
 * the payload; malformed or forged descriptors still fail in the store.
 */
export function hasContentQualityV3ProvenanceSignal(payload: object): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('invalid_handoff_state');
  }
  const topRequired = readRequiredMarker(
    ownPayloadValue(payload, CONTENT_QUALITY_V3_REQUIRED_FIELD),
  );
  const nestedRequired = readRequiredMarker(
    nestedStructuredContentValue(payload, CONTENT_QUALITY_V3_REQUIRED_FIELD),
  );
  const handoff = ownPayloadValue(payload, CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD)
    ?? nestedStructuredContentValue(payload, CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD);
  const postId = ownPayloadValue(payload, CONTENT_QUALITY_V3_POST_ID_FIELD)
    ?? nestedStructuredContentValue(payload, CONTENT_QUALITY_V3_POST_ID_FIELD);
  return topRequired || nestedRequired || handoff !== undefined || postId !== undefined;
}

interface SafeCloneBudget {
  nodes: number;
}

function cloneSafeData(
  value: unknown,
  seen = new WeakSet<object>(),
  budget: SafeCloneBudget = { nodes: 0 },
  depth = 0,
): unknown {
  if (
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) return value;
  if (typeof value !== 'object' || depth > 32 || budget.nodes >= 100_000) {
    fail('untrusted_handoff');
  }
  if (seen.has(value)) fail('untrusted_handoff');
  seen.add(value);
  budget.nodes += 1;
  try {
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (isArray ? Array.prototype : Object.prototype) && prototype !== null) {
      fail('untrusted_handoff');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 10_000 || keys.some(key => typeof key !== 'string')) {
      fail('untrusted_handoff');
    }
    const clone: Record<string, unknown> | unknown[] = isArray ? [] : {};
    for (const key of keys) {
      if (isArray && key === 'length') continue;
      const descriptor = descriptors[key as string];
      if (!descriptor || !('value' in descriptor)) fail('untrusted_handoff');
      (clone as Record<string, unknown>)[key as string] = cloneSafeData(
        descriptor.value,
        seen,
        budget,
        depth + 1,
      );
    }
    return clone;
  } finally {
    seen.delete(value);
  }
}

function buildFinalCandidate(payload: object): unknown {
  const structuredContent = ownPayloadValue(payload, 'structuredContent');
  if (structuredContent === undefined || structuredContent === null) {
    const title = ownPayloadValue(payload, 'title');
    const content = ownPayloadValue(payload, 'content');
    if (typeof title !== 'string' || typeof content !== 'string') return structuredContent;
    return {
      selectedTitle: title,
      bodyPlain: content,
      content,
    };
  }
  if (typeof structuredContent !== 'object' || Array.isArray(structuredContent)) {
    fail('untrusted_handoff');
  }
  const safeStructuredContent = cloneSafeData(structuredContent) as Record<string, unknown>;
  const title = ownPayloadValue(payload, 'title');
  const content = ownPayloadValue(payload, 'content');
  return {
    ...safeStructuredContent,
    selectedTitle: typeof title === 'string' ? title : safeStructuredContent.selectedTitle,
    bodyPlain: typeof content === 'string' ? content : safeStructuredContent.bodyPlain,
    content: typeof content === 'string' ? content : safeStructuredContent.content,
  };
}

const MAX_FTC_DISCLOSURE_CHARS = 4_000;
const UNSAFE_FTC_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

function readPreservableFtcDisclosure(payload: object): string | undefined {
  const structuredContent = ownPayloadValue(payload, 'structuredContent');
  if (
    typeof structuredContent !== 'object'
    || structuredContent === null
    || Array.isArray(structuredContent)
  ) return undefined;
  const disclosure = ownPayloadValue(structuredContent, 'ftcDisclosure');
  if (disclosure === undefined) return undefined;
  if (
    typeof disclosure !== 'string'
    || disclosure.length > MAX_FTC_DISCLOSURE_CHARS
    || UNSAFE_FTC_CONTROL_CHARS.test(disclosure)
  ) fail('untrusted_handoff');
  return disclosure;
}

/**
 * Reconciles all renderer-controlled duplicate body/title fields before the
 * trusted V3 gate. `consume: false` is a retry-safe preview; the final call is
 * made by the main-only hook immediately before an irreversible publish or
 * schedule confirmation click. Draft saves intentionally remain active.
 */
export async function enforceContentQualityV3PublishPayload<T extends object>(
  store: ContentQualityV3PublishHandoffStore,
  payload: T,
  options: EnforceContentQualityV3PublishPayloadOptions = {},
): Promise<T> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    fail('invalid_handoff_state');
  }
  const ownerKeyValue = ownPayloadValue(payload, '_contentQualityV3PublishOwnerKey');
  const topLevelHandoff = ownPayloadValue(payload, CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD);
  const nestedHandoff = nestedStructuredContentValue(
    payload,
    CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD,
  );
  const handoff = topLevelHandoff ?? nestedHandoff;
  const topLevelPostId = ownPayloadValue(payload, CONTENT_QUALITY_V3_POST_ID_FIELD);
  const nestedPostId = nestedStructuredContentValue(payload, CONTENT_QUALITY_V3_POST_ID_FIELD);
  const postId = topLevelPostId ?? nestedPostId;
  const required = readRequiredMarker(ownPayloadValue(payload, CONTENT_QUALITY_V3_REQUIRED_FIELD))
    || readRequiredMarker(nestedStructuredContentValue(payload, CONTENT_QUALITY_V3_REQUIRED_FIELD));
  if (typeof ownerKeyValue !== 'string') {
    if (handoff !== undefined || postId !== undefined || required) fail('untrusted_handoff');
    return payload;
  }
  const safePayload = cloneSafeData(payload) as ContentQualityV3PublishPayload;
  const ftcDisclosure = readPreservableFtcDisclosure(safePayload);
  const candidate = buildFinalCandidate(safePayload);
  const input = {
    ownerKey: ownerKeyValue,
    postId,
    required,
    handoff,
    candidate,
    publishMode: ownPayloadValue(safePayload, 'publishMode'),
    scheduleType: ownPayloadValue(safePayload, 'scheduleType'),
    userSupplements: options.userSupplements,
    inspectionTexts: options.inspectionTexts,
  };
  const canonical = await (options.consume === false
    ? store.previewAtPublish(input)
    : store.enforceAtPublish(input));
  if (canonical === candidate) return payload;
  const structured = canonical as StructuredContent;
  const structuredWithFtc = ftcDisclosure === undefined
    ? structured
    : Object.freeze({ ...structured, ftcDisclosure });
  return {
    ...safePayload,
    title: structuredWithFtc.selectedTitle,
    content: structuredWithFtc.bodyPlain,
    lines: structuredWithFtc.bodyPlain.split('\n'),
    structuredContent: structuredWithFtc,
  } as unknown as T;
}
