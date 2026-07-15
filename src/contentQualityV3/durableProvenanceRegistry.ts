import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const CONTENT_QUALITY_V3_PROVENANCE_FILENAME =
  'content-quality-v3-provenance.v1.json' as const;
export const CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME =
  'content-quality-v3-provenance.v1.backup.json' as const;
export const CONTENT_QUALITY_V3_PROVENANCE_ERROR_PREFIX =
  '[content-quality-v3-durable-provenance]' as const;

export type ContentQualityV3DurableProvenanceIssueCode =
  | 'invalid_registry'
  | 'registry_io_failure'
  | 'registry_capacity'
  | 'invalid_provenance'
  | 'missing_provenance'
  | 'provenance_mismatch'
  | 'ambiguous_provenance'
  | 'replayed_provenance'
  | 'expired_provenance'
  | 'superseded_provenance'
  | 'cancelled_provenance';

export class ContentQualityV3DurableProvenanceError extends Error {
  readonly issueCode: ContentQualityV3DurableProvenanceIssueCode;

  constructor(issueCode: ContentQualityV3DurableProvenanceIssueCode) {
    super(`${CONTENT_QUALITY_V3_PROVENANCE_ERROR_PREFIX} ${issueCode}`);
    this.name = 'ContentQualityV3DurableProvenanceError';
    this.issueCode = issueCode;
    Object.freeze(this);
  }
}

export interface ContentQualityV3DurableHandoff {
  readonly handle: string;
  readonly publicationIdentity: string;
  readonly originalContentSha256: string;
}

export interface ContentQualityV3CanonicalTitleBody {
  readonly title: string;
  readonly body: string;
}

export interface RegisterContentQualityV3IssuedInput {
  readonly handoff: ContentQualityV3DurableHandoff;
  readonly content: Readonly<{
    selectedTitle: string;
    bodyPlain: string;
  }>;
}

export interface ReplaceContentQualityV3IssuedInput
  extends RegisterContentQualityV3IssuedInput {
  readonly supersedePostId: string;
}

export interface InspectContentQualityV3PublishInput {
  readonly postId?: unknown;
  readonly required: boolean;
  readonly handoff?: unknown;
  readonly content: ContentQualityV3CanonicalTitleBody;
}

export interface ContentQualityV3LegacyInspection {
  readonly kind: 'legacy';
  readonly content: ContentQualityV3CanonicalTitleBody;
}

export interface ContentQualityV3ProvenancePermit {
  readonly kind: 'permit';
}

export type ContentQualityV3ProvenanceInspection =
  | ContentQualityV3LegacyInspection
  | ContentQualityV3ProvenancePermit;

export interface ContentQualityV3DurableProvenanceRegistryOptions {
  readonly userDataPath: string;
  readonly now?: () => number;
  readonly maxActiveEntries?: number;
  readonly maxConsumedEntries?: number;
  readonly activeTtlMs?: number;
  readonly consumedTtlMs?: number;
  readonly maxFileBytes?: number;
}

type ProvenanceState = 'active' | 'consumed' | 'expired' | 'superseded' | 'cancelled';

interface ProvenanceEntry {
  readonly postId: string;
  readonly publicationIdentity: string;
  readonly originalContentSha256: string;
  readonly canonicalTitleBodySha256: string;
  readonly state: ProvenanceState;
  readonly revision: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

interface RegistryState {
  readonly version: 1;
  readonly sequence: number;
  readonly entries: readonly ProvenanceEntry[];
}

interface PermitState {
  readonly postId: string;
  readonly observedContentSha256: string;
  readonly recordRevision: number;
  readonly registrySequence: number;
}

const POST_ID_PATTERN = /^v3d_[A-Za-z0-9_-]{43}$/;
const HANDLE_PATTERN = /^v3h_[A-Za-z0-9_-]{32,128}$/;
const IDENTITY_PATTERN = /^v3p_[A-Za-z0-9_-]{32,128}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REGISTRY_KEYS = Object.freeze(['version', 'sequence', 'entries'] as const);
const ENTRY_KEYS = Object.freeze([
  'postId',
  'publicationIdentity',
  'originalContentSha256',
  'canonicalTitleBodySha256',
  'state',
  'revision',
  'createdAtMs',
  'updatedAtMs',
] as const);
const HANDOFF_KEYS = Object.freeze([
  'handle',
  'publicationIdentity',
  'originalContentSha256',
] as const);
const DEFAULT_MAX_ACTIVE_ENTRIES = 512;
/**
 * Signal-free reverse-hash replay detection is deliberately bounded to the
 * newest 4,096 inactive records and 30 days. Older entries are compacted
 * deterministically so publishing cannot be locked by an exhausted tombstone
 * budget. A payload that retains postId/handoff/required metadata still fails
 * closed with provenance_mismatch after its hash-only record is compacted.
 */
export const CONTENT_QUALITY_V3_DEFAULT_REVERSE_HASH_RETENTION_ENTRIES = 4_096;
export const CONTENT_QUALITY_V3_DEFAULT_REVERSE_HASH_RETENTION_MS =
  30 * 24 * 60 * 60 * 1_000;
export const CONTENT_QUALITY_V3_DEFAULT_ACTIVE_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_CONSUMED_ENTRIES =
  CONTENT_QUALITY_V3_DEFAULT_REVERSE_HASH_RETENTION_ENTRIES;
const DEFAULT_ACTIVE_TTL_MS = CONTENT_QUALITY_V3_DEFAULT_ACTIVE_TTL_MS;
const DEFAULT_CONSUMED_TTL_MS = CONTENT_QUALITY_V3_DEFAULT_REVERSE_HASH_RETENTION_MS;
const DEFAULT_MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TITLE_BYTES = 64 * 1024;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function fail(issueCode: ContentQualityV3DurableProvenanceIssueCode): never {
  throw new ContentQualityV3DurableProvenanceError(issueCode);
}

function boundedPositiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) return fallback;
  return Math.min(value as number, maximum);
}

function safeIncrement(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    fail('registry_capacity');
  }
  return value + 1;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index]);
}

function normalizeCanonicalText(value: string): string {
  return value.replace(/\r\n/g, '\n').normalize('NFC');
}

function appendLengthPrefixed(hash: ReturnType<typeof createHash>, value: string, maximum: number): void {
  const bytes = Buffer.from(normalizeCanonicalText(value), 'utf8');
  if (bytes.length > maximum) fail('invalid_provenance');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length, 0);
  hash.update(length);
  hash.update(bytes);
}

export function hashContentQualityV3CanonicalTitleBody(
  content: ContentQualityV3CanonicalTitleBody,
): string {
  if (!content || typeof content.title !== 'string' || typeof content.body !== 'string') {
    return fail('invalid_provenance');
  }
  const hash = createHash('sha256');
  appendLengthPrefixed(hash, content.title, MAX_TITLE_BYTES);
  appendLengthPrefixed(hash, content.body, MAX_BODY_BYTES);
  return hash.digest('hex');
}

function readHandoff(value: unknown): ContentQualityV3DurableHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('invalid_provenance');
  }
  try {
    if (!exactKeys(value, HANDOFF_KEYS)) fail('invalid_provenance');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const values: Record<string, unknown> = {};
    for (const key of HANDOFF_KEYS) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) fail('invalid_provenance');
      values[key] = descriptor.value;
    }
    if (
      typeof values.handle !== 'string'
      || !HANDLE_PATTERN.test(values.handle)
      || typeof values.publicationIdentity !== 'string'
      || !IDENTITY_PATTERN.test(values.publicationIdentity)
      || typeof values.originalContentSha256 !== 'string'
      || !SHA256_PATTERN.test(values.originalContentSha256)
    ) fail('invalid_provenance');
    return Object.freeze({
      handle: values.handle,
      publicationIdentity: values.publicationIdentity,
      originalContentSha256: values.originalContentSha256,
    }) as ContentQualityV3DurableHandoff;
  } catch (error) {
    if (error instanceof ContentQualityV3DurableProvenanceError) throw error;
    return fail('invalid_provenance');
  }
}

function freezeEntry(entry: ProvenanceEntry): ProvenanceEntry {
  return Object.freeze({ ...entry });
}

function freezeState(state: RegistryState): RegistryState {
  return Object.freeze({
    version: 1,
    sequence: state.sequence,
    entries: Object.freeze(state.entries.map(freezeEntry)),
  });
}

function emptyState(): RegistryState {
  return freezeState({ version: 1, sequence: 0, entries: [] });
}

function serializeState(state: RegistryState): string {
  return JSON.stringify(state);
}

function readSafeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function parseStrictState(raw: string, maxFileBytes: number): RegistryState | undefined {
  if (Buffer.byteLength(raw, 'utf8') > maxFileBytes) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    if (!exactKeys(parsed, REGISTRY_KEYS)) return undefined;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || readSafeInteger(record.sequence) === undefined) return undefined;
    if (!Array.isArray(record.entries)) return undefined;
    const postIds = new Set<string>();
    const identities = new Set<string>();
    const entries: ProvenanceEntry[] = [];
    for (const value of record.entries) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      if (!exactKeys(value, ENTRY_KEYS)) return undefined;
      const item = value as Record<string, unknown>;
      const createdAtMs = readSafeInteger(item.createdAtMs);
      const updatedAtMs = readSafeInteger(item.updatedAtMs);
      const revision = readSafeInteger(item.revision);
      if (
        typeof item.postId !== 'string'
        || !POST_ID_PATTERN.test(item.postId)
        || typeof item.publicationIdentity !== 'string'
        || !IDENTITY_PATTERN.test(item.publicationIdentity)
        || typeof item.originalContentSha256 !== 'string'
        || !SHA256_PATTERN.test(item.originalContentSha256)
        || typeof item.canonicalTitleBodySha256 !== 'string'
        || !SHA256_PATTERN.test(item.canonicalTitleBodySha256)
        || !['active', 'consumed', 'expired', 'superseded', 'cancelled'].includes(String(item.state))
        || revision === undefined
        || revision < 1
        || createdAtMs === undefined
        || updatedAtMs === undefined
        || updatedAtMs < createdAtMs
        || postIds.has(item.postId)
        || identities.has(item.publicationIdentity)
      ) return undefined;
      postIds.add(item.postId);
      identities.add(item.publicationIdentity);
      entries.push(freezeEntry({
        postId: item.postId,
        publicationIdentity: item.publicationIdentity,
        originalContentSha256: item.originalContentSha256,
        canonicalTitleBodySha256: item.canonicalTitleBodySha256,
        state: item.state as ProvenanceState,
        revision,
        createdAtMs,
        updatedAtMs,
      }));
    }
    const state = freezeState({
      version: 1,
      sequence: record.sequence as number,
      entries,
    });
    return raw === serializeState(state) ? state : undefined;
  } catch {
    return undefined;
  }
}

function createPostId(existing: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const postId = `v3d_${randomBytes(32).toString('base64url')}`;
    if (!existing.has(postId)) return postId;
  }
  return fail('invalid_provenance');
}

function fileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function failForInactiveState(state: Exclude<ProvenanceState, 'active'>): never {
  switch (state) {
    case 'consumed': return fail('replayed_provenance');
    case 'expired': return fail('expired_provenance');
    case 'superseded': return fail('superseded_provenance');
    case 'cancelled': return fail('cancelled_provenance');
  }
}

function newestInactiveFirst(left: ProvenanceEntry, right: ProvenanceEntry): number {
  if (left.updatedAtMs !== right.updatedAtMs) return left.updatedAtMs > right.updatedAtMs ? -1 : 1;
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs > right.createdAtMs ? -1 : 1;
  if (left.revision !== right.revision) return left.revision > right.revision ? -1 : 1;
  if (left.postId === right.postId) return 0;
  return left.postId < right.postId ? 1 : -1;
}

function compactInactiveEntries(
  entries: readonly ProvenanceEntry[],
  maximumInactive: number,
  protectedPostIds: ReadonlySet<string> = new Set<string>(),
): readonly ProvenanceEntry[] {
  const inactive = entries.filter(entry => entry.state !== 'active');
  if (inactive.length <= maximumInactive) return entries;
  const protectedInactive = inactive
    .filter(entry => protectedPostIds.has(entry.postId))
    .sort(newestInactiveFirst);
  const unprotectedInactive = inactive
    .filter(entry => !protectedPostIds.has(entry.postId))
    .sort(newestInactiveFirst);
  const retainedPostIds = new Set(
    [...protectedInactive, ...unprotectedInactive]
      .slice(0, maximumInactive)
      .map(entry => entry.postId),
  );
  return entries.filter(entry => entry.state === 'active' || retainedPostIds.has(entry.postId));
}

export class ContentQualityV3DurableProvenanceRegistry {
  private readonly userDataPath: string;
  private readonly primaryPath: string;
  private readonly backupPath: string;
  private readonly now: () => number;
  private readonly maxActiveEntries: number;
  private readonly maxConsumedEntries: number;
  private readonly activeTtlMs: number;
  private readonly consumedTtlMs: number;
  private readonly maxFileBytes: number;
  private state: RegistryState | undefined;
  private initialSessionLoad = true;
  private degradedIssue: ContentQualityV3DurableProvenanceIssueCode | undefined;
  private operationTail: Promise<void> = Promise.resolve();
  private readonly permits = new WeakMap<object, PermitState>();

  constructor(options: ContentQualityV3DurableProvenanceRegistryOptions) {
    if (!options || typeof options.userDataPath !== 'string' || !options.userDataPath.trim()) {
      fail('invalid_provenance');
    }
    this.userDataPath = path.resolve(options.userDataPath);
    this.primaryPath = path.join(this.userDataPath, CONTENT_QUALITY_V3_PROVENANCE_FILENAME);
    this.backupPath = path.join(this.userDataPath, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME);
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.maxActiveEntries = boundedPositiveInteger(
      options.maxActiveEntries,
      DEFAULT_MAX_ACTIVE_ENTRIES,
      DEFAULT_MAX_ACTIVE_ENTRIES,
    );
    this.maxConsumedEntries = boundedPositiveInteger(
      options.maxConsumedEntries,
      DEFAULT_MAX_CONSUMED_ENTRIES,
      DEFAULT_MAX_CONSUMED_ENTRIES,
    );
    this.activeTtlMs = boundedPositiveInteger(
      options.activeTtlMs,
      DEFAULT_ACTIVE_TTL_MS,
      DEFAULT_ACTIVE_TTL_MS,
    );
    this.consumedTtlMs = boundedPositiveInteger(
      options.consumedTtlMs,
      DEFAULT_CONSUMED_TTL_MS,
      DEFAULT_CONSUMED_TTL_MS,
    );
    this.maxFileBytes = boundedPositiveInteger(
      options.maxFileBytes,
      DEFAULT_MAX_FILE_BYTES,
      DEFAULT_MAX_FILE_BYTES,
    );
  }

  beginSession(): Promise<void> {
    return this.enqueue(async () => {
      await this.loadCurrentState();
    });
  }

  registerIssued(input: RegisterContentQualityV3IssuedInput): Promise<Readonly<{ postId: string }>> {
    return this.enqueue(() => this.registerResolved(input));
  }

  replaceIssued(input: ReplaceContentQualityV3IssuedInput): Promise<Readonly<{ postId: string }>> {
    return this.enqueue(() => this.registerResolved(input, input?.supersedePostId));
  }

  cancelIssued(postId: string): Promise<void> {
    return this.enqueue(() => this.transitionActive(postId, 'cancelled'));
  }

  expireIssued(postId: string): Promise<void> {
    return this.enqueue(() => this.transitionActive(postId, 'expired'));
  }

  inspectPublish(input: InspectContentQualityV3PublishInput): Promise<ContentQualityV3ProvenanceInspection> {
    return this.enqueue(async () => {
      const state = await this.loadCurrentState();
      if (typeof input.required !== 'boolean') fail('invalid_provenance');
      const contentHash = hashContentQualityV3CanonicalTitleBody(input.content);
      const hasPostId = input.postId !== undefined && input.postId !== null;
      const hasHandoff = input.handoff !== undefined && input.handoff !== null;
      const postId = hasPostId && typeof input.postId === 'string' && POST_ID_PATTERN.test(input.postId)
        ? input.postId
        : undefined;
      if (hasPostId && !postId) fail('provenance_mismatch');
      const handoff = hasHandoff ? readHandoff(input.handoff) : undefined;
      const matches = new Map<string, ProvenanceEntry>();
      const add = (entry: ProvenanceEntry | undefined) => {
        if (entry) matches.set(entry.postId, entry);
      };
      if (postId) add(state.entries.find(entry => entry.postId === postId));
      if (handoff) {
        add(state.entries.find(entry => entry.publicationIdentity === handoff.publicationIdentity));
      }
      if (!postId && !handoff) {
        state.entries
          .filter(entry => entry.canonicalTitleBodySha256 === contentHash)
          .forEach(add);
      }

      if (matches.size === 0) {
        if (hasPostId || hasHandoff || input.required) fail('provenance_mismatch');
        return Object.freeze({ kind: 'legacy', content: input.content });
      }
      if (matches.size !== 1) fail('ambiguous_provenance');
      const entry = matches.values().next().value as ProvenanceEntry;
      if (entry.state !== 'active') failForInactiveState(entry.state);
      if (!input.required || !postId || !handoff) fail('missing_provenance');
      if (
        postId !== entry.postId
        || handoff.publicationIdentity !== entry.publicationIdentity
        || handoff.originalContentSha256 !== entry.originalContentSha256
      ) fail('provenance_mismatch');
      const permit = Object.freeze({ kind: 'permit' as const });
      this.permits.set(permit, Object.freeze({
        postId: entry.postId,
        observedContentSha256: contentHash,
        recordRevision: entry.revision,
        registrySequence: state.sequence,
      }));
      return permit;
    });
  }

  approveRevision(permit: ContentQualityV3ProvenancePermit): Promise<void> {
    return this.enqueue(async () => {
      const permitState = this.readPermit(permit);
      const state = await this.loadCurrentState();
      const index = state.entries.findIndex(entry => entry.postId === permitState.postId);
      const entry = state.entries[index];
      if (!entry) fail('provenance_mismatch');
      if (entry.state !== 'active') failForInactiveState(entry.state);
      if (entry.revision !== permitState.recordRevision) fail('provenance_mismatch');
      if (entry.canonicalTitleBodySha256 === permitState.observedContentSha256) return;
      const nextEntry = freezeEntry({
        ...entry,
        canonicalTitleBodySha256: permitState.observedContentSha256,
        revision: safeIncrement(entry.revision),
        updatedAtMs: this.nextMutationTimestamp(state),
      });
      const entries = [...state.entries];
      entries[index] = nextEntry;
      const nextState = freezeState({
        version: 1,
        sequence: safeIncrement(state.sequence),
        entries,
      });
      await this.commit(nextState);
      this.permits.set(permit, Object.freeze({
        ...permitState,
        recordRevision: nextEntry.revision,
        registrySequence: nextState.sequence,
      }));
    });
  }

  beginPublish(permit: ContentQualityV3ProvenancePermit): Promise<void> {
    return this.enqueue(async () => {
      const permitState = this.readPermit(permit);
      const state = await this.loadCurrentState();
      const index = state.entries.findIndex(entry => entry.postId === permitState.postId);
      const entry = state.entries[index];
      if (!entry) fail('provenance_mismatch');
      if (entry.state !== 'active') failForInactiveState(entry.state);
      if (
        entry.revision !== permitState.recordRevision
        || entry.canonicalTitleBodySha256 !== permitState.observedContentSha256
      ) fail('provenance_mismatch');
      const now = this.nextMutationTimestamp(state);
      const nextEntry = freezeEntry({
        ...entry,
        state: 'consumed',
        revision: safeIncrement(entry.revision),
        updatedAtMs: now,
      });
      const entries = [...state.entries];
      entries[index] = nextEntry;
      await this.commit(freezeState({
        version: 1,
        sequence: safeIncrement(state.sequence),
        entries: compactInactiveEntries(
          entries,
          this.maxConsumedEntries,
          new Set([entry.postId]),
        ),
      }));
      this.permits.delete(permit);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async registerResolved(
    input: RegisterContentQualityV3IssuedInput,
    supersedePostId?: string,
  ): Promise<Readonly<{ postId: string }>> {
    const state = await this.loadCurrentState();
    const handoff = readHandoff(input?.handoff);
    if (
      !input?.content
      || typeof input.content.selectedTitle !== 'string'
      || typeof input.content.bodyPlain !== 'string'
    ) fail('invalid_provenance');
    if (state.entries.some(entry => entry.publicationIdentity === handoff.publicationIdentity)) {
      fail('provenance_mismatch');
    }

    let supersedeIndex = -1;
    if (supersedePostId !== undefined) {
      if (typeof supersedePostId !== 'string' || !POST_ID_PATTERN.test(supersedePostId)) {
        fail('invalid_provenance');
      }
      supersedeIndex = state.entries.findIndex(entry => entry.postId === supersedePostId);
      const superseded = state.entries[supersedeIndex];
      if (!superseded) fail('provenance_mismatch');
      if (superseded.state !== 'active') failForInactiveState(superseded.state);
    }

    const activeCount = state.entries.filter(entry => entry.state === 'active').length;
    const replacingActive = supersedeIndex >= 0 ? 1 : 0;
    if (activeCount - replacingActive + 1 > this.maxActiveEntries) fail('registry_capacity');

    const now = this.nextMutationTimestamp(state);
    const postId = createPostId(new Set(state.entries.map(entry => entry.postId)));
    const entry = freezeEntry({
      postId,
      publicationIdentity: handoff.publicationIdentity,
      originalContentSha256: handoff.originalContentSha256,
      canonicalTitleBodySha256: hashContentQualityV3CanonicalTitleBody({
        title: input.content.selectedTitle,
        body: input.content.bodyPlain,
      }),
      state: 'active',
      revision: 1,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const entries = [...state.entries];
    if (supersedeIndex >= 0) {
      const previous = entries[supersedeIndex];
      entries[supersedeIndex] = freezeEntry({
        ...previous,
        state: 'superseded',
        revision: safeIncrement(previous.revision),
        updatedAtMs: now,
      });
    }
    entries.push(entry);
    await this.commit(freezeState({
      version: 1,
      sequence: safeIncrement(state.sequence),
      entries: compactInactiveEntries(
        entries,
        this.maxConsumedEntries,
        supersedeIndex >= 0 ? new Set([supersedePostId as string]) : undefined,
      ),
    }));
    return Object.freeze({ postId });
  }

  private async transitionActive(
    postId: string,
    nextState: 'cancelled' | 'expired',
  ): Promise<void> {
    if (typeof postId !== 'string' || !POST_ID_PATTERN.test(postId)) fail('invalid_provenance');
    const state = await this.loadCurrentState();
    const index = state.entries.findIndex(entry => entry.postId === postId);
    const entry = state.entries[index];
    if (!entry) fail('provenance_mismatch');
    if (entry.state !== 'active') return;
    const entries = [...state.entries];
    entries[index] = freezeEntry({
      ...entry,
      state: nextState,
      revision: safeIncrement(entry.revision),
      updatedAtMs: this.nextMutationTimestamp(state),
    });
    await this.commit(freezeState({
      version: 1,
      sequence: safeIncrement(state.sequence),
      entries: compactInactiveEntries(
        entries,
        this.maxConsumedEntries,
        new Set([entry.postId]),
      ),
    }));
  }

  private readPermit(permit: ContentQualityV3ProvenancePermit): PermitState {
    if (!permit || typeof permit !== 'object') return fail('invalid_provenance');
    const state = this.permits.get(permit);
    if (!state) return fail('replayed_provenance');
    return state;
  }

  private readNow(): number {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) return fail('invalid_provenance');
    return now;
  }

  private nextMutationTimestamp(state: RegistryState, observedNow = this.readNow()): number {
    let latestTimestamp = -1;
    for (const entry of state.entries) {
      latestTimestamp = Math.max(latestTimestamp, entry.createdAtMs, entry.updatedAtMs);
    }
    if (observedNow > latestTimestamp) return observedNow;
    if (latestTimestamp < Number.MAX_SAFE_INTEGER) return latestTimestamp + 1;
    return latestTimestamp;
  }

  private async loadCurrentState(): Promise<RegistryState> {
    const state = await this.loadState();
    const now = this.readNow();
    const retirePriorSessionActive = this.initialSessionLoad;
    const retained = state.entries.filter(entry => (
      entry.state === 'active' || now - entry.updatedAtMs <= this.consumedTtlMs
    ));
    let changed = retained.length !== state.entries.length;
    const expiringPostIds = new Set(retained
      .filter(entry => (
        entry.state === 'active'
        && (retirePriorSessionActive || now - entry.updatedAtMs > this.activeTtlMs)
      ))
      .map(entry => entry.postId));
    const transitionTimestamp = expiringPostIds.size > 0
      ? this.nextMutationTimestamp(state, now)
      : now;
    const entries = retained.map((entry) => {
      if (!expiringPostIds.has(entry.postId)) return entry;
      changed = true;
      return freezeEntry({
        ...entry,
        state: 'expired',
        revision: safeIncrement(entry.revision),
        updatedAtMs: transitionTimestamp,
      });
    });
    const compactedEntries = compactInactiveEntries(
      entries,
      this.maxConsumedEntries,
      expiringPostIds,
    );
    if (compactedEntries.length !== entries.length) changed = true;
    if (!changed) {
      this.initialSessionLoad = false;
      return state;
    }
    const nextState = freezeState({
      version: 1,
      sequence: safeIncrement(state.sequence),
      entries: compactedEntries,
    });
    await this.commit(nextState);
    this.initialSessionLoad = false;
    return nextState;
  }

  private async loadState(): Promise<RegistryState> {
    if (this.degradedIssue) fail(this.degradedIssue);
    if (this.state) return this.state;
    try {
      await fs.mkdir(this.userDataPath, { recursive: true });
      await this.cleanupTemps();
      const [primary, backup] = await Promise.all([
        this.readStateFile(this.primaryPath),
        this.readStateFile(this.backupPath),
      ]);
      const existing = [primary, backup].filter(
        (item): item is Readonly<{ state: RegistryState; raw: string }> => Boolean(item?.state),
      );
      if (existing.length === 0) {
        const anyExisting = primary !== undefined || backup !== undefined;
        if (anyExisting) return fail('invalid_registry');
        this.state = emptyState();
        return this.state;
      }
      if (
        primary?.state
        && backup?.state
        && primary.state.sequence === backup.state.sequence
        && primary.raw !== backup.raw
      ) return fail('invalid_registry');
      const selected = existing.sort((left, right) => right.state.sequence - left.state.sequence)[0];
      const active = selected.state.entries.filter(entry => entry.state === 'active').length;
      const inactive = selected.state.entries.length - active;
      if (
        active > this.maxActiveEntries
        || inactive > this.maxConsumedEntries
        || selected.state.entries.length > this.maxActiveEntries + this.maxConsumedEntries
      ) {
        return fail('invalid_registry');
      }
      this.state = selected.state;
      if (primary?.raw !== selected.raw || backup?.raw !== selected.raw) {
        await this.persistRaw(selected.raw);
      }
      return this.state;
    } catch (error) {
      if (error instanceof ContentQualityV3DurableProvenanceError) {
        this.degradedIssue = error.issueCode;
        throw error;
      }
      this.degradedIssue = 'registry_io_failure';
      return fail('registry_io_failure');
    }
  }

  private async readStateFile(
    filePath: string,
  ): Promise<Readonly<{ state?: RegistryState; raw: string }> | undefined> {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > this.maxFileBytes) return { raw: '' };
      const raw = await fs.readFile(filePath, 'utf8');
      return { raw, state: parseStrictState(raw, this.maxFileBytes) };
    } catch (error) {
      if (fileNotFound(error)) return undefined;
      throw error;
    }
  }

  private async cleanupTemps(): Promise<void> {
    const names = await fs.readdir(this.userDataPath);
    const prefixes = [
      `${CONTENT_QUALITY_V3_PROVENANCE_FILENAME}.`,
      `${CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME}.`,
    ];
    await Promise.all(names
      .filter(name => name.endsWith('.tmp') && prefixes.some(prefix => name.startsWith(prefix)))
      .map(name => fs.rm(path.join(this.userDataPath, name), { force: true })));
  }

  private async commit(nextState: RegistryState): Promise<void> {
    if (this.degradedIssue) fail(this.degradedIssue);
    const raw = serializeState(nextState);
    if (Buffer.byteLength(raw, 'utf8') > this.maxFileBytes) fail('registry_capacity');
    try {
      await this.persistRaw(raw);
      this.state = nextState;
    } catch (error) {
      this.degradedIssue = 'registry_io_failure';
      if (error instanceof ContentQualityV3DurableProvenanceError) throw error;
      return fail('registry_io_failure');
    }
  }

  private async persistRaw(raw: string): Promise<void> {
    await fs.mkdir(this.userDataPath, { recursive: true });
    await this.atomicReplace(this.backupPath, raw);
    await this.atomicReplace(this.primaryPath, raw);
  }

  private async atomicReplace(targetPath: string, raw: string): Promise<void> {
    const temporaryPath = `${targetPath}.${randomBytes(12).toString('hex')}.tmp`;
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      handle = await fs.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(raw, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      try {
        await fs.rename(temporaryPath, targetPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (!['EEXIST', 'EPERM', 'EACCES'].includes(String(code))) throw error;
        await fs.rm(targetPath, { force: true });
        await fs.rename(temporaryPath, targetPath);
      }
    } finally {
      await handle?.close().catch(() => undefined);
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
