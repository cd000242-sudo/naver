export const CONTENT_QUALITY_V3_PUBLISH_COMMIT_ERROR_PREFIX =
  '[content-quality-v3-publish-commit]' as const;

export type EditorCommitUserSupplementKind = 'cta' | 'custom-ftc';

export interface EditorCommitUserSupplement {
  readonly kind: EditorCommitUserSupplementKind;
  readonly text: string;
}

export interface EditorCommitDeterministicAdornment {
  readonly kind: 'ftc-preset' | 'enhanced-cta' | 'previous-post-hook' | 'official-site-hook';
  readonly templateId: string;
}

export interface EditorCommitExternalLinkCard {
  readonly kind: 'cta' | 'enhanced-cta' | 'previous-post' | 'official-site';
  readonly label: string;
  readonly url: string;
  readonly cardReady: boolean;
}

export interface EditorCommitVisibleLinkCard {
  readonly text: string;
  readonly urls: readonly string[];
  readonly transformed: boolean;
}

export interface EditorCommitVisibleSnapshot {
  readonly title: string;
  readonly bodyText: string;
  readonly linkCards: readonly EditorCommitVisibleLinkCard[];
  readonly bareUrls: readonly string[];
  readonly externalAnchorUrls: readonly string[];
  readonly opaqueVisualCount: number;
}

export interface EditorCommitVisibleHeading {
  readonly title: string;
  readonly content: string;
}

export interface EditorCommitVisibleArticle {
  readonly title: string;
  readonly bodyPlain: string;
  readonly introduction: string;
  readonly headings: readonly EditorCommitVisibleHeading[];
  readonly conclusion: string;
  readonly hashtags: readonly string[];
}

export interface EditorCommitCandidate {
  readonly validatedArticle: EditorCommitVisibleArticle;
  /** Original structured heading labels before the editor strips presentation prefixes. */
  readonly sourceHeadingTitles: readonly string[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly userSupplements: readonly EditorCommitUserSupplement[];
  readonly deterministicAdornments: readonly EditorCommitDeterministicAdornment[];
  readonly externalLinkCards: readonly EditorCommitExternalLinkCard[];
  readonly visibleSnapshot?: EditorCommitVisibleSnapshot;
}

export type EditorCommitSemanticEvent =
  | Readonly<{ kind: 'title' | 'body-source' | 'introduction' | 'conclusion'; text: string }>
  | Readonly<{ kind: 'heading-title' | 'heading-body'; index: number; text: string }>
  | Readonly<{ kind: 'hashtags'; values: readonly string[] }>
  | Readonly<{
      kind: 'user-supplement';
      supplementKind: EditorCommitUserSupplementKind;
      text: string;
    }>
  | Readonly<{
      kind: 'deterministic-adornment';
      adornmentKind: EditorCommitDeterministicAdornment['kind'];
      templateId: string;
    }>
  | Readonly<{
      kind: 'external-link-card';
      surfaceKind: EditorCommitExternalLinkCard['kind'];
      label: string;
      url: string;
      cardReady: boolean;
    }>;

type PublishCommitHook = (candidate: EditorCommitCandidate) => Promise<void>;

interface HookState {
  readonly hook: PublishCommitHook;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly ledgerIdentity?: object;
  readonly candidate?: EditorCommitCandidate;
  readonly requiresVisibleSnapshot: boolean;
}

interface HeadingLedgerEntry {
  readonly index: number;
  readonly title?: string;
  readonly content?: string;
}

interface LedgerState {
  readonly runOptions: object;
  readonly structured: boolean;
  readonly status: 'recording' | 'bound';
  readonly title?: string;
  readonly bodyPlain?: string;
  readonly introduction?: string;
  readonly headings: readonly HeadingLedgerEntry[];
  readonly conclusion?: string;
  readonly hashtags?: readonly string[];
  readonly userSupplements: readonly EditorCommitUserSupplement[];
  readonly deterministicAdornments: readonly EditorCommitDeterministicAdornment[];
  readonly externalLinkCards: readonly EditorCommitExternalLinkCard[];
}

const hookStates = new WeakMap<object, HookState>();
const ledgerStates = new WeakMap<object, LedgerState>();

type PublishCommitFailureCode =
  | 'invalid_hook'
  | 'invalid_candidate'
  | 'candidate_missing'
  | 'candidate_reassigned'
  | 'hook_replayed'
  | 'visible_snapshot_missing'
  | 'opaque_raster_not_allowed'
  | 'unsupported_auto_tail'
  | 'unsupported_external_surface';

function fail(code: PublishCommitFailureCode): never {
  throw new Error(`${CONTENT_QUALITY_V3_PUBLISH_COMMIT_ERROR_PREFIX} ${code}`);
}

function boundedText(value: unknown, maximum: number, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.length === 0)) {
    fail('invalid_candidate');
  }
  return value;
}

function ownDataValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) fail('invalid_candidate');
  return descriptor.value;
}

function hasNonEmptyString(record: object, key: string): boolean {
  const value = ownDataValue(record, key);
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyArray(record: object, key: string): boolean {
  const value = ownDataValue(record, key);
  return Array.isArray(value) && value.length > 0;
}

function assertStrictRasterPolicy(resolvedOptions: object): void {
  const contentMode = ownDataValue(resolvedOptions, 'contentMode');
  const affiliateLink = ownDataValue(resolvedOptions, 'affiliateLink');
  const skipCta = ownDataValue(resolvedOptions, 'skipCta');
  const opaqueRaster = ownDataValue(resolvedOptions, 'skipImages') !== true
    || hasNonEmptyString(resolvedOptions, 'customBannerPath')
    || ownDataValue(resolvedOptions, 'useAiBanner') === true
    || ownDataValue(resolvedOptions, 'autoBannerGenerate') === true
    || ownDataValue(resolvedOptions, 'useAiTableImage') === true
    || hasNonEmptyArray(resolvedOptions, 'images')
    || hasNonEmptyArray(resolvedOptions, 'collectedImages')
    || hasNonEmptyString(resolvedOptions, 'thumbnailPath')
    || contentMode === 'affiliate'
    || (typeof affiliateLink === 'string' && affiliateLink.trim().length > 0);
  if (opaqueRaster) fail('opaque_raster_not_allowed');
  if (hasNonEmptyString(resolvedOptions, 'previousPostUrl')) fail('unsupported_auto_tail');
  if (
    skipCta !== true
    && (
      hasNonEmptyArray(resolvedOptions, 'ctas')
      || hasNonEmptyString(resolvedOptions, 'ctaLink')
      || hasNonEmptyString(resolvedOptions, 'affiliateLink')
    )
  ) fail('unsupported_external_surface');
}

/**
 * Enforces the main-process text-only activation contract before browser or
 * image work begins. The writer repeats this check on its resolved options.
 */
export function assertMainProcessEditorCommitTextOnly(options: object): void {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('invalid_candidate');
  }
  assertStrictRasterPolicy(options);
}

function cloneOwnData(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
  budget = { nodes: 0 },
): unknown {
  if (
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) return value;
  if (typeof value !== 'object' || depth > 32 || budget.nodes >= 100_000 || seen.has(value)) {
    fail('invalid_candidate');
  }
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype) && prototype !== null) {
    fail('invalid_candidate');
  }
  seen.add(value);
  budget.nodes += 1;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 10_000 || keys.some(key => typeof key !== 'string')) {
      fail('invalid_candidate');
    }
    const clone: Record<string, unknown> | unknown[] = isArray ? [] : {};
    for (const key of keys) {
      if (isArray && key === 'length') continue;
      const descriptor = descriptors[key as string];
      if (!descriptor || !('value' in descriptor)) fail('invalid_candidate');
      (clone as Record<string, unknown>)[key as string] = cloneOwnData(
        descriptor.value,
        seen,
        depth + 1,
        budget,
      );
    }
    return clone;
  } finally {
    seen.delete(value);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ('value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function setScalar(
  current: string | undefined,
  next: string,
): string {
  if (current === undefined || current === next) return next;
  return fail('candidate_reassigned');
}

function setHeadingValue(
  headings: readonly HeadingLedgerEntry[],
  index: number,
  field: 'title' | 'content',
  text: string,
): readonly HeadingLedgerEntry[] {
  if (!Number.isSafeInteger(index) || index < 0 || index > 1_000) fail('invalid_candidate');
  const existing = headings.find(entry => entry.index === index);
  const current = existing?.[field];
  if (current !== undefined && current !== text) fail('candidate_reassigned');
  const nextEntry = Object.freeze({
    index,
    title: field === 'title' ? text : existing?.title,
    content: field === 'content' ? text : existing?.content,
  });
  return Object.freeze([
    ...headings.filter(entry => entry.index !== index),
    nextEntry,
  ].sort((left, right) => left.index - right.index));
}

function requireLedger(resolvedOptions: object): LedgerState | undefined {
  const ledger = ledgerStates.get(resolvedOptions);
  if (!ledger) return undefined;
  if (ledger.status !== 'recording') fail('candidate_reassigned');
  return ledger;
}

/**
 * Associates a trusted main-process callback with an options object without
 * adding any serializable field that renderer IPC could forge.
 */
export function attachMainProcessBeforePublishCommit<T extends object>(
  runOptions: T,
  hook: PublishCommitHook,
  options: Readonly<{ requiresVisibleSnapshot?: boolean }> = {},
): T {
  if (!runOptions || typeof runOptions !== 'object' || typeof hook !== 'function') {
    fail('invalid_hook');
  }
  if (hookStates.has(runOptions)) fail('invalid_hook');
  hookStates.set(runOptions, Object.freeze({
    hook,
    status: 'pending',
    requiresVisibleSnapshot: options.requiresVisibleSnapshot === true,
  }));
  return runOptions;
}

/** Starts a main-only semantic ledger for the exact writer invocation. */
export function beginMainProcessEditorCommitCandidate(
  runOptions: object,
  resolvedOptions: object,
  options: Readonly<{ structured: boolean }>,
): void {
  const hookState = hookStates.get(runOptions);
  if (!hookState) return;
  if (
    hookState.status !== 'pending'
    || hookState.ledgerIdentity !== undefined
    || hookState.candidate !== undefined
    || !resolvedOptions
    || typeof resolvedOptions !== 'object'
    || typeof options?.structured !== 'boolean'
    || ledgerStates.has(resolvedOptions)
  ) fail('candidate_reassigned');
  if (hookState.requiresVisibleSnapshot) assertMainProcessEditorCommitTextOnly(resolvedOptions);
  const ledger = Object.freeze({
    runOptions,
    structured: options.structured,
    status: 'recording' as const,
    headings: Object.freeze([]),
    userSupplements: Object.freeze([]),
    deterministicAdornments: Object.freeze([]),
    externalLinkCards: Object.freeze([]),
  });
  ledgerStates.set(resolvedOptions, ledger);
  hookStates.set(runOptions, Object.freeze({
    ...hookState,
    ledgerIdentity: resolvedOptions,
  }));
}

/** Records one high-level text value immediately after the writer applies it. */
export function recordMainProcessEditorCommitSemantic(
  resolvedOptions: object,
  event: EditorCommitSemanticEvent,
): void {
  const ledger = requireLedger(resolvedOptions);
  if (!ledger) return;
  if (!event || typeof event !== 'object') fail('invalid_candidate');
  let next: LedgerState;
  switch (event.kind) {
    case 'title':
      next = { ...ledger, title: setScalar(ledger.title, boundedText(event.text, 64 * 1_024, false)) };
      break;
    case 'body-source':
      next = { ...ledger, bodyPlain: setScalar(ledger.bodyPlain, boundedText(event.text, 4 * 1_024 * 1_024)) };
      break;
    case 'introduction':
      next = { ...ledger, introduction: setScalar(ledger.introduction, boundedText(event.text, 512 * 1_024)) };
      break;
    case 'conclusion':
      next = { ...ledger, conclusion: setScalar(ledger.conclusion, boundedText(event.text, 512 * 1_024)) };
      break;
    case 'heading-title':
    case 'heading-body': {
      const field = event.kind === 'heading-title' ? 'title' : 'content';
      next = {
        ...ledger,
        headings: setHeadingValue(
          ledger.headings,
          event.index,
          field,
          boundedText(event.text, field === 'title' ? 64 * 1_024 : 2 * 1_024 * 1_024),
        ),
      };
      break;
    }
    case 'hashtags': {
      if (!Array.isArray(event.values) || event.values.length > 100) fail('invalid_candidate');
      const values = Object.freeze(event.values.map(value => boundedText(value, 1_024)));
      if (ledger.hashtags && !sameStringArray(ledger.hashtags, values)) {
        fail('candidate_reassigned');
      }
      next = { ...ledger, hashtags: values };
      break;
    }
    case 'user-supplement': {
      if (!['cta', 'custom-ftc'].includes(event.supplementKind)) fail('invalid_candidate');
      const supplement = Object.freeze({
        kind: event.supplementKind,
        text: boundedText(event.text, 64 * 1_024, false),
      });
      const exists = ledger.userSupplements.some(item => (
        item.kind === supplement.kind && item.text === supplement.text
      ));
      next = {
        ...ledger,
        userSupplements: exists
          ? ledger.userSupplements
          : Object.freeze([...ledger.userSupplements, supplement]),
      };
      break;
    }
    case 'deterministic-adornment': {
      const adornment = Object.freeze({
        kind: event.adornmentKind,
        templateId: boundedText(event.templateId, 1_024, false),
      });
      const exists = ledger.deterministicAdornments.some(item => (
        item.kind === adornment.kind && item.templateId === adornment.templateId
      ));
      next = {
        ...ledger,
        deterministicAdornments: exists
          ? ledger.deterministicAdornments
          : Object.freeze([...ledger.deterministicAdornments, adornment]),
      };
      break;
    }
    case 'external-link-card': {
      if (!['cta', 'enhanced-cta', 'previous-post', 'official-site'].includes(event.surfaceKind)) {
        fail('invalid_candidate');
      }
      if (typeof event.cardReady !== 'boolean') fail('invalid_candidate');
      const surface = Object.freeze({
        kind: event.surfaceKind,
        label: boundedText(event.label, 64 * 1_024, false),
        url: boundedText(event.url, 8 * 1_024, false),
        cardReady: event.cardReady,
      });
      const existing = ledger.externalLinkCards.find(item => (
        item.kind === surface.kind && item.label === surface.label && item.url === surface.url
      ));
      if (existing && existing.cardReady !== surface.cardReady) fail('candidate_reassigned');
      next = {
        ...ledger,
        externalLinkCards: existing
          ? ledger.externalLinkCards
          : Object.freeze([...ledger.externalLinkCards, surface]),
      };
      break;
    }
    default:
      return fail('invalid_candidate');
  }
  ledgerStates.set(resolvedOptions, Object.freeze(next));
}

function materializeStructuredContent(
  source: unknown,
  article: EditorCommitVisibleArticle,
): Readonly<{
  content: Readonly<Record<string, unknown>> | undefined;
  sourceHeadingTitles: readonly string[];
}> {
  if (source === undefined || source === null) {
    return Object.freeze({
      content: undefined,
      sourceHeadingTitles: Object.freeze([]),
    });
  }
  if (typeof source !== 'object' || Array.isArray(source)) fail('invalid_candidate');
  const cloned = cloneOwnData(source) as Record<string, unknown>;
  const sourceHeadings = Array.isArray(cloned.headings) ? cloned.headings : [];
  if (sourceHeadings.length !== article.headings.length) fail('candidate_missing');
  const sourceHeadingTitles = Object.freeze(sourceHeadings.map(original => {
    if (!original || typeof original !== 'object' || Array.isArray(original)) {
      return fail('invalid_candidate');
    }
    return boundedText(
      ownDataValue(original, 'title'),
      64 * 1_024,
      false,
    );
  }));
  const headings = article.headings.map((heading, index) => {
    const original = sourceHeadings[index];
    const originalRecord = original && typeof original === 'object' && !Array.isArray(original)
      ? original as Record<string, unknown>
      : {};
    return {
      ...originalRecord,
      title: heading.title,
      content: heading.content,
    };
  });
  return Object.freeze({
    content: deepFreeze({
      ...cloned,
      selectedTitle: article.title,
      bodyPlain: article.bodyPlain,
      content: article.bodyPlain,
      introduction: article.introduction,
      headings,
      conclusion: article.conclusion,
      hashtags: [...article.hashtags],
    }),
    sourceHeadingTitles,
  });
}

/** Seals the ledger and binds its immutable snapshot to the trusted hook. */
export function bindMainProcessEditorCommitCandidate(
  runOptions: object,
  resolvedOptions: object,
  structuredContent?: unknown,
): void {
  const hookState = hookStates.get(runOptions);
  if (!hookState) return;
  const ledger = requireLedger(resolvedOptions);
  if (
    !ledger
    || ledger.runOptions !== runOptions
    || hookState.ledgerIdentity !== resolvedOptions
    || hookState.candidate !== undefined
    || ledger.title === undefined
    || ledger.bodyPlain === undefined
    || ledger.hashtags === undefined
  ) fail('candidate_missing');
  if (ledger.structured && structuredContent === undefined) fail('candidate_missing');
  if (!ledger.structured && ledger.headings.length > 0) fail('invalid_candidate');
  const headings = ledger.headings.map((entry, index) => {
    if (entry.index !== index || entry.title === undefined || entry.content === undefined) {
      fail('candidate_missing');
    }
    return Object.freeze({ title: entry.title, content: entry.content });
  });
  const article = deepFreeze({
    title: ledger.title,
    bodyPlain: ledger.bodyPlain,
    introduction: ledger.introduction ?? '',
    headings: Object.freeze(headings),
    conclusion: ledger.conclusion ?? '',
    hashtags: Object.freeze([...ledger.hashtags]),
  });
  const materialized = materializeStructuredContent(structuredContent, article);
  const candidate = deepFreeze({
    validatedArticle: article,
    sourceHeadingTitles: materialized.sourceHeadingTitles,
    structuredContent: materialized.content,
    userSupplements: Object.freeze([...ledger.userSupplements]),
    deterministicAdornments: Object.freeze([...ledger.deterministicAdornments]),
    externalLinkCards: Object.freeze([...ledger.externalLinkCards]),
  });
  ledgerStates.set(resolvedOptions, Object.freeze({ ...ledger, status: 'bound' }));
  hookStates.set(runOptions, Object.freeze({ ...hookState, candidate }));
}

function snapshotVisibleEditorSurface(value: unknown): EditorCommitVisibleSnapshot {
  const cloned = cloneOwnData(value);
  if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) fail('invalid_candidate');
  const record = cloned as Record<string, unknown>;
  const title = boundedText(record.title, 64 * 1_024, false);
  const bodyText = boundedText(record.bodyText, 4 * 1_024 * 1_024, false);
  if (!Array.isArray(record.linkCards) || record.linkCards.length > 64) fail('invalid_candidate');
  const linkCards = record.linkCards.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_candidate');
    const card = value as Record<string, unknown>;
    if (!Array.isArray(card.urls) || card.urls.length > 16) fail('invalid_candidate');
    const urls = card.urls.map(url => boundedText(url, 8 * 1_024, false));
    if (typeof card.transformed !== 'boolean') fail('invalid_candidate');
    return Object.freeze({
      text: boundedText(card.text, 64 * 1_024, false),
      urls: Object.freeze(urls),
      transformed: card.transformed,
    });
  });
  if (!Array.isArray(record.bareUrls) || record.bareUrls.length > 64) fail('invalid_candidate');
  const bareUrls = record.bareUrls.map(url => boundedText(url, 8 * 1_024, false));
  if (
    !Array.isArray(record.externalAnchorUrls)
    || record.externalAnchorUrls.length > 64
  ) fail('invalid_candidate');
  const externalAnchorUrls = record.externalAnchorUrls.map(
    url => boundedText(url, 8 * 1_024, false),
  );
  const opaqueVisualCount = record.opaqueVisualCount;
  if (
    !Number.isSafeInteger(opaqueVisualCount)
    || (opaqueVisualCount as number) < 0
    || (opaqueVisualCount as number) > 10_000
  ) fail('invalid_candidate');
  return deepFreeze({
    title,
    bodyText,
    linkCards: Object.freeze(linkCards),
    bareUrls: Object.freeze(bareUrls),
    externalAnchorUrls: Object.freeze(externalAnchorUrls),
    opaqueVisualCount: opaqueVisualCount as number,
  });
}

export function requiresMainProcessEditorVisibleSnapshot(runOptions: object): boolean {
  return hookStates.get(runOptions)?.requiresVisibleSnapshot === true;
}

export function isMainProcessEditorCommitStrict(resolvedOptions: object): boolean {
  const ledger = ledgerStates.get(resolvedOptions);
  return Boolean(ledger && hookStates.get(ledger.runOptions)?.requiresVisibleSnapshot === true);
}

/** Binds a fresh, bounded DOM snapshot immediately before the final click. */
export function bindMainProcessEditorVisibleSnapshot(
  runOptions: object,
  snapshot: unknown,
): void {
  const state = hookStates.get(runOptions);
  if (!state || !state.requiresVisibleSnapshot) return;
  if (state.status !== 'pending' || !state.candidate || state.candidate.visibleSnapshot) {
    fail('candidate_reassigned');
  }
  const visibleSnapshot = snapshotVisibleEditorSurface(snapshot);
  const candidate = deepFreeze({ ...state.candidate, visibleSnapshot });
  hookStates.set(runOptions, Object.freeze({ ...state, candidate }));
}

/**
 * Invoked by each browser publishing path immediately before the irreversible
 * final publish/schedule confirmation click (draft saves intentionally skip it).
 */
export async function invokeMainProcessBeforePublishCommit(runOptions: object): Promise<void> {
  const state = hookStates.get(runOptions);
  if (!state) return;
  if (state.status !== 'pending') fail('hook_replayed');
  if (!state.candidate) fail('candidate_missing');
  if (state.requiresVisibleSnapshot && !state.candidate.visibleSnapshot) {
    fail('visible_snapshot_missing');
  }
  hookStates.set(runOptions, Object.freeze({ ...state, status: 'running' }));
  try {
    await state.hook(state.candidate);
    hookStates.set(runOptions, Object.freeze({ ...state, status: 'completed' }));
  } catch (error) {
    hookStates.set(runOptions, Object.freeze({ ...state, status: 'failed' }));
    throw error;
  }
}
