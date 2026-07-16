import { createHash } from 'node:crypto';
import type {
  EditorCommitCandidate,
  EditorCommitVisibleArticle,
} from '../automation/publishCommitHook.js';
import {
  CONTENT_QUALITY_V3_PUBLISH_COMMIT_ERROR_PREFIX,
} from '../automation/publishCommitHook.js';
import { DEFAULT_AFFILIATE_FTC_DISCLOSURE } from '../automation/ftcDisclosurePresets.js';
import { normalizeEditorSubtitleText } from '../automation/editorWriterTextSemantics.js';
import { buildMobileRichHtml } from '../automation/richTextPaste.js';
import {
  hashContentQualityV3CanonicalTitleBody,
} from './durableProvenanceRegistry.js';
import {
  ContentQualityV3PublishHandoffStore,
  enforceContentQualityV3PublishPayload,
} from './publishHandoffStore.js';

type ProjectionFailureCode = 'invalid_candidate' | 'candidate_mismatch';
type VisibleFailureCode =
  | 'visible_snapshot_missing'
  | 'visible_link_card_mismatch'
  | 'visible_bare_url'
  | 'visible_external_anchor'
  | 'visible_opaque_visual'
  | 'visible_body_mismatch';

export interface ContentQualityV3EditorCommitProjection {
  readonly title: string;
  readonly bodyPlain: string;
  readonly introduction: string;
  readonly headings: readonly Readonly<{ title: string; content: string }>[];
  readonly conclusion: string;
  readonly hashtags: readonly string[];
}

function fail(code: ProjectionFailureCode | VisibleFailureCode): never {
  throw new Error(`${CONTENT_QUALITY_V3_PUBLISH_COMMIT_ERROR_PREFIX} ${code}`);
}

function normalizeComparableUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/u.test(url.protocol)) fail('invalid_candidate');
    url.hash = '';
    return url.toString();
  } catch {
    return fail('invalid_candidate');
  }
}

function normalizeVisibleExactText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/gu, ' ')
    .trim()
    .normalize('NFC');
}

function assertCanonicalBodyCoverage(
  article: ContentQualityV3EditorCommitProjection,
  structured: boolean,
  sourceHeadingTitles: readonly string[],
): void {
  if (!structured) return;
  if (
    sourceHeadingTitles.length !== article.headings.length
    || article.headings.length === 0
  ) fail('visible_body_mismatch');

  const lines = article.bodyPlain.replace(/\r\n/g, '\n').split('\n');
  const removedLineIndexes = new Set<number>();
  const headingLineIndexes: number[] = [];
  const firstNonEmptyLine = lines.findIndex(line => normalizeVisibleExactText(line).length > 0);
  if (
    firstNonEmptyLine >= 0
    && normalizeVisibleExactText(lines[firstNonEmptyLine]) === normalizeVisibleExactText(article.title)
  ) removedLineIndexes.add(firstNonEmptyLine);

  let cursor = firstNonEmptyLine >= 0 ? firstNonEmptyLine : 0;
  for (let index = 0; index < sourceHeadingTitles.length; index += 1) {
    const sourceTitle = sourceHeadingTitles[index];
    const appliedTitle = article.headings[index]?.title ?? '';
    if (
      !normalizeVisibleExactText(sourceTitle)
      || normalizeVisibleExactText(normalizeEditorSubtitleText(sourceTitle))
        !== normalizeVisibleExactText(appliedTitle)
    ) fail('visible_body_mismatch');
    const lineIndex = lines.findIndex((line, candidateIndex) => (
      candidateIndex >= cursor
      && !removedLineIndexes.has(candidateIndex)
      && normalizeVisibleExactText(normalizeEditorSubtitleText(line))
        === normalizeVisibleExactText(appliedTitle)
    ));
    if (lineIndex < 0) fail('visible_body_mismatch');
    removedLineIndexes.add(lineIndex);
    headingLineIndexes.push(lineIndex);
    cursor = lineIndex + 1;
  }

  const firstContentLine = removedLineIndexes.has(firstNonEmptyLine)
    ? firstNonEmptyLine + 1
    : Math.max(0, firstNonEmptyLine);
  const canonicalChunks = [
    lines.slice(firstContentLine, headingLineIndexes[0]).join('\n'),
    ...headingLineIndexes.map((lineIndex, index) => lines.slice(
      lineIndex + 1,
      headingLineIndexes[index + 1] ?? lines.length,
    ).join('\n')),
  ];
  const canonicalProse = normalizeVisibleExactText(canonicalChunks
    .map(chunk => buildMobileRichHtml(chunk).plainText)
    .filter(Boolean)
    .join('\n'));
  const appliedProse = normalizeVisibleExactText([
    article.introduction,
    ...article.headings.map(heading => heading.content),
    article.conclusion,
  ].filter(Boolean).join('\n'));
  if (
    !canonicalProse
    || canonicalProse !== appliedProse
  ) fail('visible_body_mismatch');
}

function assertExactVisibleArticle(
  article: ContentQualityV3EditorCommitProjection,
  structured: boolean,
  bodyText: string,
  requiredPrefixSegments: readonly string[],
): void {
  const articleSegments = structured ? [
    article.introduction,
    ...article.headings.flatMap(heading => [heading.title, heading.content]),
    article.conclusion,
  ] : [article.bodyPlain];
  const hashtagSegments = article.hashtags
    .map(tag => normalizeVisibleExactText(tag).replace(/^#+/u, ''))
    .filter(Boolean)
    .map(tag => `#${tag}`);
  const expected = normalizeVisibleExactText([
    ...requiredPrefixSegments,
    ...articleSegments,
    ...hashtagSegments,
  ].filter(Boolean).join('\n'));
  const visible = normalizeVisibleExactText(bodyText);
  if (!expected || visible !== expected) fail('visible_body_mismatch');
}

function readVisibleSnapshot(candidate: EditorCommitCandidate): Readonly<{
  title: string;
  bodyText: string;
  linkCards: readonly Readonly<{ text: string; urls: readonly string[]; transformed: boolean }>[];
  bareUrls: readonly string[];
  externalAnchorUrls: readonly string[];
  opaqueVisualCount: number;
}> {
  const value = ownValue(candidate, 'visibleSnapshot');
  if (!value) fail('visible_snapshot_missing');
  if (typeof value !== 'object' || Array.isArray(value)) fail('invalid_candidate');
  const title = readString(ownValue(value, 'title'));
  const bodyText = readString(ownValue(value, 'bodyText'));
  if (!title || title.length > 64 * 1_024 || !bodyText || bodyText.length > 4 * 1_024 * 1_024) {
    fail('invalid_candidate');
  }
  const rawCards = ownValue(value, 'linkCards');
  if (!Array.isArray(rawCards) || rawCards.length > 64) fail('invalid_candidate');
  const linkCards = rawCards.map(card => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) fail('invalid_candidate');
    const text = readString(ownValue(card, 'text'));
    const rawUrls = ownValue(card, 'urls');
    const transformed = ownValue(card, 'transformed');
    if (!text || text.length > 64 * 1_024 || !Array.isArray(rawUrls) || rawUrls.length > 16) {
      fail('invalid_candidate');
    }
    if (transformed !== true) fail('visible_link_card_mismatch');
    const urls = rawUrls.map(url => readString(url));
    if (urls.length === 0) fail('visible_link_card_mismatch');
    return Object.freeze({ text, urls: Object.freeze(urls), transformed: true });
  });
  const rawBareUrls = ownValue(value, 'bareUrls');
  if (!Array.isArray(rawBareUrls) || rawBareUrls.length > 64) fail('invalid_candidate');
  const bareUrls = rawBareUrls.map(url => readString(url));
  if (bareUrls.length > 0) fail('visible_bare_url');
  const rawExternalAnchorUrls = ownValue(value, 'externalAnchorUrls');
  if (!Array.isArray(rawExternalAnchorUrls) || rawExternalAnchorUrls.length > 64) {
    fail('invalid_candidate');
  }
  const externalAnchorUrls = rawExternalAnchorUrls.map(url => readString(url));
  if (externalAnchorUrls.length > 0) fail('visible_external_anchor');
  const opaqueVisualCount = ownValue(value, 'opaqueVisualCount');
  if (
    !Number.isSafeInteger(opaqueVisualCount)
    || (opaqueVisualCount as number) < 0
    || (opaqueVisualCount as number) > 10_000
  ) fail('invalid_candidate');
  if (opaqueVisualCount !== 0) fail('visible_opaque_visual');
  return Object.freeze({
    title,
    bodyText,
    linkCards: Object.freeze(linkCards),
    bareUrls: Object.freeze(bareUrls),
    externalAnchorUrls: Object.freeze(externalAnchorUrls),
    opaqueVisualCount: 0,
  });
}

function assertAllowedAdornments(candidate: EditorCommitCandidate): readonly string[] {
  const value = ownValue(candidate, 'deterministicAdornments');
  if (!Array.isArray(value) || value.length > 1) fail('invalid_candidate');
  const requiredFtcTexts: string[] = [];
  for (const adornment of value) {
    if (!adornment || typeof adornment !== 'object' || Array.isArray(adornment)) {
      fail('invalid_candidate');
    }
    const kind = ownValue(adornment, 'kind');
    const templateId = ownValue(adornment, 'templateId');
    if (kind !== 'ftc-preset' || templateId !== 'affiliate-default') {
      fail('invalid_candidate');
    }
    requiredFtcTexts.push(DEFAULT_AFFILIATE_FTC_DISCLOSURE);
  }
  return Object.freeze(requiredFtcTexts);
}

function assertAllowedUserSupplements(candidate: EditorCommitCandidate): readonly string[] {
  const value = ownValue(candidate, 'userSupplements');
  if (!Array.isArray(value) || value.length > 32) fail('invalid_candidate');
  if (value.length > 1) fail('invalid_candidate');
  const requiredFtcTexts: string[] = [];
  for (const supplement of value) {
    if (!supplement || typeof supplement !== 'object' || Array.isArray(supplement)) {
      fail('invalid_candidate');
    }
    const kind = ownValue(supplement, 'kind');
    const text = readString(ownValue(supplement, 'text'));
    if (
      kind !== 'custom-ftc'
      || !text.trim()
      || text !== text.trim()
      || text.length > 4_000
    ) fail('invalid_candidate');
    requiredFtcTexts.push(text);
  }
  return Object.freeze(requiredFtcTexts);
}

function readExternalLinkCards(candidate: EditorCommitCandidate): readonly Readonly<{
  label: string;
  url: string;
  cardReady: true;
}>[] {
  const value = ownValue(candidate, 'externalLinkCards');
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 64) fail('invalid_candidate');
  return Object.freeze(value.map(surface => {
    if (!surface || typeof surface !== 'object' || Array.isArray(surface)) {
      return fail('invalid_candidate');
    }
    const kind = ownValue(surface, 'kind');
    const label = readString(ownValue(surface, 'label'));
    const url = readString(ownValue(surface, 'url'));
    const cardReady = ownValue(surface, 'cardReady');
    if (!['cta', 'enhanced-cta', 'previous-post', 'official-site'].includes(String(kind))) {
      return fail('invalid_candidate');
    }
    if (!label || !url || cardReady !== true) fail('visible_link_card_mismatch');
    return Object.freeze({ label, url, cardReady: true as const });
  }));
}

function assertVisibleSurface(
  candidate: EditorCommitCandidate,
): readonly string[] {
  const adornmentFtcTexts = assertAllowedAdornments(candidate);
  const userFtcTexts = assertAllowedUserSupplements(candidate);
  if (adornmentFtcTexts.length + userFtcTexts.length > 1) fail('invalid_candidate');
  const requiredFtcTexts = Object.freeze([...adornmentFtcTexts, ...userFtcTexts]);
  const snapshot = readVisibleSnapshot(candidate);
  const article = projectionFromArticle(candidate.validatedArticle);
  if (!normalizedBytes(snapshot.title).equals(normalizedBytes(article.title))) {
    fail('candidate_mismatch');
  }
  const rawSourceHeadingTitles = ownValue(candidate, 'sourceHeadingTitles');
  if (!Array.isArray(rawSourceHeadingTitles) || rawSourceHeadingTitles.length > 1_000) {
    fail('invalid_candidate');
  }
  const sourceHeadingTitles = Object.freeze(rawSourceHeadingTitles.map(readString));
  assertCanonicalBodyCoverage(
    article,
    candidate.structuredContent !== undefined,
    sourceHeadingTitles,
  );
  assertExactVisibleArticle(
    article,
    candidate.structuredContent !== undefined,
    snapshot.bodyText,
    requiredFtcTexts,
  );
  const expectedCards = readExternalLinkCards(candidate);
  if (expectedCards.length !== snapshot.linkCards.length) fail('visible_link_card_mismatch');
  const remaining = snapshot.linkCards.map(card => ({
    card,
    urls: new Set(card.urls.map(normalizeComparableUrl)),
  }));
  for (const expected of expectedCards) {
    const normalized = normalizeComparableUrl(expected.url);
    const matchIndex = remaining.findIndex(item => item.urls.has(normalized));
    if (matchIndex < 0) fail('visible_link_card_mismatch');
    remaining.splice(matchIndex, 1);
  }
  return Object.freeze([
    article.title,
    article.bodyPlain,
    article.introduction,
    ...article.headings.flatMap(heading => [heading.title, heading.content]),
    article.conclusion,
    ...article.hashtags,
    ...expectedCards.flatMap(card => [card.label, card.url]),
    snapshot.title,
    snapshot.bodyText,
    ...snapshot.linkCards.flatMap(card => [card.text, ...card.urls]),
  ]);
}

function ownValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) fail('invalid_candidate');
  return descriptor.value;
}

function copyOwnDataRecord(value: object): Record<string, unknown> {
  const keys = Reflect.ownKeys(value);
  if (keys.length > 10_000 || keys.some(key => typeof key !== 'string')) {
    fail('invalid_candidate');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) fail('invalid_candidate');
    result[key] = descriptor.value;
  }
  return result;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') fail('invalid_candidate');
  return value;
}

function readOptionalString(value: unknown): string {
  return value === undefined ? '' : readString(value);
}

function readHeadings(value: unknown): readonly Readonly<{ title: string; content: string }>[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 1_000) fail('invalid_candidate');
  return Object.freeze(value.map(heading => {
    if (!heading || typeof heading !== 'object' || Array.isArray(heading)) {
      return fail('invalid_candidate');
    }
    return Object.freeze({
      title: readString(ownValue(heading, 'title')),
      content: readString(ownValue(heading, 'content')),
    });
  }));
}

function readHashtags(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 100) fail('invalid_candidate');
  return Object.freeze(value.map(readString));
}

function projectionFromArticle(
  article: EditorCommitVisibleArticle,
): ContentQualityV3EditorCommitProjection {
  return Object.freeze({
    title: readString(article.title),
    bodyPlain: readString(article.bodyPlain),
    introduction: readString(article.introduction),
    headings: readHeadings(article.headings),
    conclusion: readString(article.conclusion),
    hashtags: readHashtags(article.hashtags),
  });
}

function projectionFromPayload(payload: object): ContentQualityV3EditorCommitProjection {
  const structured = ownValue(payload, 'structuredContent');
  if (structured === undefined || structured === null) {
    return Object.freeze({
      title: readString(ownValue(payload, 'title')),
      bodyPlain: readString(ownValue(payload, 'content')),
      introduction: '',
      headings: Object.freeze([]),
      conclusion: '',
      hashtags: Object.freeze([]),
    });
  }
  if (typeof structured !== 'object' || Array.isArray(structured)) {
    return fail('invalid_candidate');
  }
  return Object.freeze({
    title: readString(ownValue(structured, 'selectedTitle')),
    bodyPlain: readString(ownValue(structured, 'bodyPlain')),
    introduction: readOptionalString(ownValue(structured, 'introduction')),
    headings: readHeadings(ownValue(structured, 'headings')),
    conclusion: readOptionalString(ownValue(structured, 'conclusion')),
    hashtags: readHashtags(ownValue(structured, 'hashtags')),
  });
}

function normalizedBytes(value: string): Buffer {
  return Buffer.from(value.replace(/\r\n/g, '\n').normalize('NFC'), 'utf8');
}

function appendLengthPrefixed(
  hash: ReturnType<typeof createHash>,
  value: string,
  maximumBytes: number,
): void {
  const bytes = normalizedBytes(value);
  if (bytes.length > maximumBytes) fail('invalid_candidate');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length, 0);
  hash.update(length);
  hash.update(bytes);
}

function appendCount(hash: ReturnType<typeof createHash>, count: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000) {
    fail('invalid_candidate');
  }
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32BE(count, 0);
  hash.update(buffer);
}

/** Exact registry semantics: NFC + CRLF→LF + byte-length prefixes only. */
export function hashContentQualityV3EditorCommitProjection(
  projection: ContentQualityV3EditorCommitProjection,
): string {
  const coreHash = hashContentQualityV3CanonicalTitleBody({
    title: projection.title,
    body: projection.bodyPlain,
  });
  const hash = createHash('sha256');
  appendLengthPrefixed(hash, coreHash, 64);
  appendLengthPrefixed(hash, projection.introduction, 512 * 1_024);
  appendCount(hash, projection.headings.length);
  for (const heading of projection.headings) {
    appendLengthPrefixed(hash, heading.title, 64 * 1_024);
    appendLengthPrefixed(hash, heading.content, 2 * 1_024 * 1_024);
  }
  appendLengthPrefixed(hash, projection.conclusion, 512 * 1_024);
  appendCount(hash, projection.hashtags.length);
  for (const hashtag of projection.hashtags) {
    appendLengthPrefixed(hash, hashtag, 1_024);
  }
  return hash.digest('hex');
}

export function assertContentQualityV3EditorCommitProjection(
  expected: EditorCommitVisibleArticle,
  canonicalPayload: object,
): void {
  const expectedHash = hashContentQualityV3EditorCommitProjection(
    projectionFromArticle(expected),
  );
  const canonicalHash = hashContentQualityV3EditorCommitProjection(
    projectionFromPayload(canonicalPayload),
  );
  if (expectedHash !== canonicalHash) fail('candidate_mismatch');
}

function materializeEditorPayload<T extends object>(
  effectivePayload: T,
  candidate: EditorCommitCandidate,
): T {
  if (!candidate || typeof candidate !== 'object') fail('invalid_candidate');
  const article = projectionFromArticle(candidate.validatedArticle);
  const base = copyOwnDataRecord(effectivePayload);
  const structured = candidate.structuredContent;
  if (structured !== undefined && (typeof structured !== 'object' || Array.isArray(structured))) {
    fail('invalid_candidate');
  }
  return {
    ...base,
    title: article.title,
    content: article.bodyPlain,
    structuredContent: structured,
  } as T;
}

/**
 * Previews the exact writer snapshot, compares the complete visible core, and
 * only then consumes that same candidate once. Any failure occurs before the
 * browser's irreversible publish/schedule confirmation click.
 */
export async function enforceContentQualityV3EditorCommit<T extends object>(
  store: ContentQualityV3PublishHandoffStore,
  effectivePayload: T,
  candidate: EditorCommitCandidate,
): Promise<void> {
  const inspectionTexts = assertVisibleSurface(candidate);
  const editorPayload = materializeEditorPayload(effectivePayload, candidate);
  const options = Object.freeze({
    userSupplements: candidate.userSupplements,
    inspectionTexts,
  });
  const preview = await enforceContentQualityV3PublishPayload(
    store,
    editorPayload,
    { ...options, consume: false },
  );
  assertContentQualityV3EditorCommitProjection(candidate.validatedArticle, preview);
  await enforceContentQualityV3PublishPayload(
    store,
    editorPayload,
    { ...options, consume: true },
  );
}
