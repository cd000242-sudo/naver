import type { StructuredContent } from '../contentGenerator.js';
import type { AffiliateEvidenceInput } from '../content/affiliateAuthenticity.js';
import { EVALUATED_V3_CONTENT_MODES } from '../contentPipeline/mode.js';
import {
  evaluateContentQualityV3AffiliateGuard,
  repairContentQualityV3AffiliateTitle,
} from './affiliateGuard.js';
import {
  enforceContentQualityV3BusinessGuard,
  snapshotContentQualityV3BusinessEvidence,
  type ContentQualityV3BusinessEvidenceInput,
  type ContentQualityV3BusinessEvidenceSnapshot,
} from './businessGuard.js';
import {
  finalizeContentQualityV3Draft,
  revalidateContentQualityV3FinalizedContent,
  type ContentQualityV3FinalizationIssueCode,
} from './finalizer.js';
import {
  evaluateContentQualityV3FactualSafety,
  snapshotContentQualityV3FactualEvidence,
  type ContentQualityV3FactualEvidenceInput,
  type ContentQualityV3FactualEvidenceSnapshot,
  type ContentQualityV3FactualSafetyIssueCode,
} from './factualSafetyGuard.js';
import {
  resolveContentQualityV3TitleContract,
  type ContentQualityV3TitleContract,
  type ContentQualityV3TitleContractSource,
} from './titleContract.js';

export const CONTENT_QUALITY_V3_PUBLICATION_ERROR_PREFIX = '[content-quality-v3-publication]';

export type ContentQualityV3PublicationIssueCode =
  | ContentQualityV3FinalizationIssueCode
  | 'invalid_candidate'
  | 'invalid_generation_context'
  | 'invalid_runtime_attachments'
  | 'untrusted_provenance'
  | 'affiliate_authenticity_failed'
  | 'affiliate_shopping_quality_failed'
  | 'business_safety_failed'
  | 'factual_safety_invalid'
  | 'factual_prompt_leakage'
  | 'factual_fake_first_person'
  | 'factual_unsupported_important_number'
  | 'factual_high_risk_guarantee';

/**
 * Strict mode is retained for internal/evaluation callers. Production
 * generation uses advisory mode: editorial and factual findings are shown to
 * the user but do not discard a structurally publishable draft.
 */
export type ContentQualityV3PublicationSafetyMode = 'strict' | 'advisory';

export class ContentQualityV3PublicationError extends Error {
  readonly issueCode: ContentQualityV3PublicationIssueCode;

  constructor(issueCode: ContentQualityV3PublicationIssueCode) {
    super(`${CONTENT_QUALITY_V3_PUBLICATION_ERROR_PREFIX} ${issueCode}`);
    this.name = 'ContentQualityV3PublicationError';
    this.issueCode = issueCode;
    Object.freeze(this);
  }
}

export type ContentQualityV3GenerationSource = ContentQualityV3TitleContractSource
  & AffiliateEvidenceInput
  & ContentQualityV3BusinessEvidenceInput
  & ContentQualityV3FactualEvidenceInput
  & Readonly<{ contentMode?: unknown }>;

export interface ContentQualityV3GenerationRegistration {
  readonly source: ContentQualityV3GenerationSource;
  readonly minimumBodyChars: number;
  readonly safetyMode?: ContentQualityV3PublicationSafetyMode;
  /** Deterministic local findings collected before the publication ticket. */
  readonly advisoryIssues?: readonly ContentQualityV3PublicationIssueCode[];
}

export interface ContentQualityV3PublicationCandidateOptions {
  readonly titleContract?: ContentQualityV3TitleContract;
  readonly contentMode?: string;
  readonly affiliateEvidence?: AffiliateEvidenceInput;
  readonly businessEvidence?: ContentQualityV3BusinessEvidenceInput;
  readonly factualEvidence?: ContentQualityV3FactualEvidenceSnapshot;
  readonly minimumBodyChars?: number;
}

export type ContentQualityV3PublicationUserSupplementKind = 'cta' | 'custom-ftc';

export interface ContentQualityV3PublicationUserSupplement {
  readonly kind: ContentQualityV3PublicationUserSupplementKind;
  readonly text: string;
}

export interface ContentQualityV3PublicationBoundaryOptions {
  readonly userSupplements?: readonly ContentQualityV3PublicationUserSupplement[];
  readonly inspectionTexts?: readonly string[];
}

export interface ContentQualityV3RuntimeTelemetry {
  readonly contentPolicy?: unknown;
  readonly factCheckReport?: unknown;
}

export interface ContentQualityV3RuntimeAttachments {
  readonly context?: unknown;
  readonly collectedImages?: readonly unknown[];
  readonly telemetry: ContentQualityV3RuntimeTelemetry;
}

export interface ContentQualityV3PublicationEnvelope {
  readonly content: StructuredContent;
  readonly attachments: ContentQualityV3RuntimeAttachments;
}

export type ContentQualityV3PublicationCandidateResult = Readonly<
  | { ok: true; envelope: ContentQualityV3PublicationEnvelope }
  | { ok: false; issueCode: ContentQualityV3PublicationIssueCode }
>;

declare const CONTENT_QUALITY_V3_PUBLICATION_TICKET_BRAND: unique symbol;

export interface ContentQualityV3PublicationTicket {
  readonly [CONTENT_QUALITY_V3_PUBLICATION_TICKET_BRAND]: true;
}

interface TrustedPublicationState {
  readonly titleContract?: ContentQualityV3TitleContract;
  readonly contentMode: string;
  readonly affiliateEvidence: AffiliateEvidenceInput;
  readonly businessEvidence: ContentQualityV3BusinessEvidenceSnapshot;
  readonly factualEvidence: ContentQualityV3FactualEvidenceSnapshot;
  readonly minimumBodyChars: number;
  readonly safetyMode: ContentQualityV3PublicationSafetyMode;
  readonly registrationAdvisories: readonly ContentQualityV3PublicationIssueCode[];
}

const trustedGenerationState = new WeakMap<object, TrustedPublicationState>();
const activePublicationTickets = new WeakMap<object, TrustedPublicationState>();

const ARTICLE_KEYS = Object.freeze([
  'status',
  'generationTime',
  'selectedTitle',
  'titleAlternatives',
  'titleCandidates',
  'bodyHtml',
  'bodyPlain',
  'content',
  'headings',
  'hashtags',
  'images',
  'metadata',
  'quality',
  'introduction',
  'conclusion',
  'viralHooks',
  'trafficStrategy',
  'postPublishActions',
  'cta',
] as const);

const STATIC_PUBLICATION_ISSUE_CODES = new Set<ContentQualityV3PublicationIssueCode>([
  'invalid_candidate',
  'invalid_generation_context',
  'invalid_runtime_attachments',
  'untrusted_provenance',
  'affiliate_authenticity_failed',
  'affiliate_shopping_quality_failed',
  'business_safety_failed',
  'factual_safety_invalid',
  'factual_prompt_leakage',
  'factual_fake_first_person',
  'factual_unsupported_important_number',
  'factual_high_risk_guarantee',
]);

const ATTACHMENT_KEYS = Object.freeze([
  'contentPolicyContext',
  'collectedImages',
  'contentPolicy',
  'factCheckReport',
] as const);

type CandidateRecord = Readonly<Record<string, unknown>>;

function reject(
  issueCode: ContentQualityV3PublicationIssueCode,
): ContentQualityV3PublicationCandidateResult {
  return Object.freeze({ ok: false, issueCode });
}

function factualIssueToPublicationIssue(
  issueCode: ContentQualityV3FactualSafetyIssueCode,
): ContentQualityV3PublicationIssueCode {
  switch (issueCode) {
    case 'prompt_leakage':
      return 'factual_prompt_leakage';
    case 'fake_first_person':
      return 'factual_fake_first_person';
    case 'unsupported_important_number':
      return 'factual_unsupported_important_number';
    case 'high_risk_guarantee':
      return 'factual_high_risk_guarantee';
  }
}

function validateFactualSafety(
  content: Readonly<StructuredContent>,
  evidence: ContentQualityV3FactualEvidenceSnapshot,
): ContentQualityV3PublicationIssueCode | undefined {
  try {
    const result = evaluateContentQualityV3FactualSafety(content, evidence);
    const issueCode = result.issueCodes[0];
    return issueCode ? factualIssueToPublicationIssue(issueCode) : undefined;
  } catch {
    return 'factual_safety_invalid';
  }
}

function canBecomeAdvisory(issueCode: ContentQualityV3PublicationIssueCode): boolean {
  if (
    issueCode === 'invalid_candidate'
    || issueCode === 'invalid_generation_context'
    || issueCode === 'invalid_runtime_attachments'
    || issueCode === 'untrusted_provenance'
    || issueCode === 'factual_safety_invalid'
  ) return false;
  return !issueCode.startsWith('structured_output_');
}

function isPublicationIssueCode(value: unknown): value is ContentQualityV3PublicationIssueCode {
  return typeof value === 'string' && (
    value.startsWith('structured_output_')
    || value === 'manual_title_mismatch'
    || value === 'keyword_title_mismatch'
    || STATIC_PUBLICATION_ISSUE_CODES.has(value as ContentQualityV3PublicationIssueCode)
  );
}

function snapshotAdvisoryIssues(value: unknown): readonly ContentQualityV3PublicationIssueCode[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 32) {
    throw new ContentQualityV3PublicationError('invalid_generation_context');
  }
  const issues: ContentQualityV3PublicationIssueCode[] = [];
  for (const issueCode of value) {
    if (!isPublicationIssueCode(issueCode)) {
      throw new ContentQualityV3PublicationError('invalid_generation_context');
    }
    if (!issues.includes(issueCode)) issues.push(issueCode);
  }
  return Object.freeze(issues);
}

function appendPublicationAdvisories(
  content: StructuredContent,
  issueCodes: readonly ContentQualityV3PublicationIssueCode[],
): StructuredContent {
  if (issueCodes.length === 0) return content;
  const existingWarnings = Array.isArray(content.quality?.warnings)
    ? content.quality.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
  const advisoryWarnings = issueCodes.map(
    issueCode => `[content-quality-v3 advisory] ${issueCode}`,
  );
  const warnings = [...new Set([...existingWarnings, ...advisoryWarnings])];
  return Object.freeze({
    ...content,
    status: content.status === 'success' ? 'warning' : content.status,
    quality: Object.freeze({ ...content.quality, warnings }),
  });
}

const MAX_USER_SUPPLEMENTS = 32;
const MAX_USER_SUPPLEMENT_CHARS = 4_000;
const MAX_USER_SUPPLEMENT_TOTAL_CHARS = 20_000;
const MAX_INSPECTION_TEXTS = 256;
const MAX_INSPECTION_TEXT_CHARS = 4 * 1_024 * 1_024;
const MAX_INSPECTION_TOTAL_CHARS = 12 * 1_024 * 1_024;

function snapshotUserSupplements(
  value: unknown,
): readonly ContentQualityV3PublicationUserSupplement[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return undefined;
  try {
    const arrayDescriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const lengthDescriptor = arrayDescriptors.length;
    const lengthValue = lengthDescriptor && 'value' in lengthDescriptor
      ? lengthDescriptor.value as unknown
      : undefined;
    if (
      !lengthDescriptor
      || !('value' in lengthDescriptor)
      || typeof lengthValue !== 'number'
      || !Number.isSafeInteger(lengthValue)
      || lengthValue < 0
      || lengthValue > MAX_USER_SUPPLEMENTS
    ) return undefined;

    const supplements: ContentQualityV3PublicationUserSupplement[] = [];
    let totalChars = 0;
    for (let index = 0; index < lengthValue; index += 1) {
      const itemDescriptor = arrayDescriptors[String(index)];
      if (!itemDescriptor || !('value' in itemDescriptor)) return undefined;
      const item = itemDescriptor.value;
      if (!isObject(item)) return undefined;
      const itemDescriptors = Object.getOwnPropertyDescriptors(item);
      const kindDescriptor = itemDescriptors.kind;
      const textDescriptor = itemDescriptors.text;
      if (
        !kindDescriptor
        || !('value' in kindDescriptor)
        || !textDescriptor
        || !('value' in textDescriptor)
      ) return undefined;
      const kind = kindDescriptor.value;
      const text = textDescriptor.value;
      if (
        (kind !== 'cta' && kind !== 'custom-ftc')
        || typeof text !== 'string'
        || text.length > MAX_USER_SUPPLEMENT_CHARS
      ) return undefined;
      totalChars += text.length;
      if (totalChars > MAX_USER_SUPPLEMENT_TOTAL_CHARS) return undefined;
      supplements.push(Object.freeze({ kind, text }));
    }
    return Object.freeze(supplements);
  } catch {
    return undefined;
  }
}

function snapshotInspectionTexts(value: unknown): readonly string[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_INSPECTION_TEXTS) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const texts: string[] = [];
    let totalChars = 0;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') {
        return undefined;
      }
      const text = descriptor.value;
      if (text.length > MAX_INSPECTION_TEXT_CHARS) return undefined;
      totalChars += text.length;
      if (totalChars > MAX_INSPECTION_TOTAL_CHARS) return undefined;
      texts.push(text);
    }
    return Object.freeze(texts);
  } catch {
    return undefined;
  }
}

/** Collapses only intra-paragraph whitespace and inserts a hard boundary between paragraphs. */
export function normalizeContentQualityV3ClaimInspectionText(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n[\t ]*\n+/gu)
    .map(paragraph => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n.\n');
}

function validateVisibleInspection(
  content: Readonly<StructuredContent>,
  state: TrustedPublicationState,
  supplementValue: unknown,
  inspectionValue: unknown,
): ContentQualityV3PublicationIssueCode | undefined {
  const supplements = snapshotUserSupplements(supplementValue);
  if (!supplements) return 'factual_safety_invalid';
  const inspectionTexts = snapshotInspectionTexts(inspectionValue);
  if (!inspectionTexts) return 'factual_safety_invalid';
  const visibleInspectionText = [...supplements.map(item => item.text), ...inspectionTexts]
    .map(normalizeContentQualityV3ClaimInspectionText)
    .filter(Boolean)
    .join('\n.\n');
  if (!visibleInspectionText) return undefined;
  const collapsedInspectionText = [...supplements.map(item => item.text), ...inspectionTexts]
    .map(text => text.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join(' ');
  const inspectionShadow = `${visibleInspectionText}\n.\n${collapsedInspectionText}`;

  const inspectionContent = {
    ...content,
    bodyPlain: `${content.bodyPlain}\n.\n${inspectionShadow}`,
    bodyHtml: `${content.bodyHtml ?? content.bodyPlain}\n.\n${inspectionShadow}`,
    content: `${content.content ?? content.bodyPlain}\n.\n${inspectionShadow}`,
  } as StructuredContent;
  const factualIssue = validateFactualSafety(inspectionContent, state.factualEvidence);
  if (factualIssue) return factualIssue;

  if (state.contentMode === 'business') {
    try {
      enforceContentQualityV3BusinessGuard(inspectionContent, state.businessEvidence);
    } catch {
      return 'business_safety_failed';
    }
  }
  if (state.contentMode === 'affiliate') {
    const decision = evaluateContentQualityV3AffiliateGuard({
      content: inspectionContent,
      source: state.affiliateEvidence,
      minimumBodyChars: state.minimumBodyChars,
      authenticityRetryAvailable: false,
      shoppingQualityRetryAvailable: false,
      allowLocalRepair: false,
    });
    if (decision.action !== 'accept') return 'affiliate_authenticity_failed';
  }
  return undefined;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneBoundedString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, maxChars);
}

function snapshotAffiliateEvidence(source: ContentQualityV3GenerationSource): AffiliateEvidenceInput {
  const productReviews = Array.isArray(source.productReviews)
    ? source.productReviews
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 20)
      .map(item => item.slice(0, 4_000))
    : undefined;

  return Object.freeze({
    personalExperience: cloneBoundedString(source.personalExperience, 4_000),
    productReviews: productReviews ? Object.freeze(productReviews) : undefined,
    productSpec: cloneBoundedString(source.productSpec, 20_000),
    productPrice: cloneBoundedString(source.productPrice, 1_000),
  });
}

function snapshotTrustedState(
  registration: ContentQualityV3GenerationRegistration,
): TrustedPublicationState {
  try {
    if (!isObject(registration) || !isObject(registration.source)) {
      throw new ContentQualityV3PublicationError('invalid_generation_context');
    }
    const contentMode = registration.source.contentMode;
    const minimumBodyChars = registration.minimumBodyChars;
    const safetyMode = registration.safetyMode === undefined
      ? 'strict'
      : registration.safetyMode;
    if (
      typeof contentMode !== 'string'
      || !EVALUATED_V3_CONTENT_MODES.some(mode => mode === contentMode)
      || !Number.isFinite(minimumBodyChars)
      || minimumBodyChars <= 0
      || (safetyMode !== 'strict' && safetyMode !== 'advisory')
    ) {
      throw new ContentQualityV3PublicationError('invalid_generation_context');
    }

    const resolvedTitleContract = resolveContentQualityV3TitleContract(registration.source);
    const titleContract = resolvedTitleContract
      ? Object.freeze({ ...resolvedTitleContract })
      : undefined;
    return Object.freeze({
      titleContract,
      contentMode,
      affiliateEvidence: snapshotAffiliateEvidence(registration.source),
      businessEvidence: snapshotContentQualityV3BusinessEvidence(registration.source),
      factualEvidence: snapshotContentQualityV3FactualEvidence(registration.source),
      minimumBodyChars: Math.max(1, Math.floor(minimumBodyChars)),
      safetyMode,
      registrationAdvisories: snapshotAdvisoryIssues(registration.advisoryIssues),
    });
  } catch (error) {
    if (error instanceof ContentQualityV3PublicationError) throw error;
    throw new ContentQualityV3PublicationError('invalid_generation_context');
  }
}

export function registerContentQualityV3GeneratedContent<T extends object>(
  content: T,
  registration: ContentQualityV3GenerationRegistration,
): T {
  if (!isObject(content)) {
    throw new ContentQualityV3PublicationError('invalid_candidate');
  }
  const state = snapshotTrustedState(registration);
  const factualIssue = validateFactualSafety(
    content as unknown as StructuredContent,
    state.factualEvidence,
  );
  if (factualIssue && state.safetyMode === 'strict') {
    throw new ContentQualityV3PublicationError(factualIssue);
  }
  trustedGenerationState.set(content, factualIssue
    ? Object.freeze({
      ...state,
      registrationAdvisories: Object.freeze([
        ...new Set([...state.registrationAdvisories, factualIssue]),
      ]),
    })
    : state);
  return content;
}

export function beginContentQualityV3Publication(
  content: unknown,
): ContentQualityV3PublicationTicket | undefined {
  if (!isObject(content)) return undefined;
  const state = trustedGenerationState.get(content);
  if (!state) return undefined;

  trustedGenerationState.delete(content);
  const ticket = Object.freeze(Object.create(null)) as ContentQualityV3PublicationTicket;
  activePublicationTickets.set(ticket, state);
  return ticket;
}

/**
 * Creates a second main-process-only capability for the final browser publish
 * boundary. The renderer receives only an opaque store handle; the trusted,
 * bounded source snapshot remains attached to this WeakMap-backed ticket.
 */
export function forkContentQualityV3PublicationTicket(
  ticket: ContentQualityV3PublicationTicket | undefined,
): ContentQualityV3PublicationTicket | undefined {
  if (ticket === undefined) return undefined;
  if (!isObject(ticket)) {
    throw new ContentQualityV3PublicationError('untrusted_provenance');
  }
  const state = activePublicationTickets.get(ticket);
  if (!state) {
    throw new ContentQualityV3PublicationError('untrusted_provenance');
  }
  const fork = Object.freeze(Object.create(null)) as ContentQualityV3PublicationTicket;
  activePublicationTickets.set(fork, state);
  return fork;
}

function ownDataValues(
  candidate: object,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const values: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor) continue;
      if (!('value' in descriptor)) return undefined;
      values[key] = descriptor.value;
    }
    return values;
  } catch {
    return undefined;
  }
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    return structuredClone(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function splitCandidate(candidate: unknown): Readonly<{
  article: Record<string, unknown>;
  attachments: ContentQualityV3RuntimeAttachments;
}> | undefined {
  if (!isObject(candidate)) return undefined;
  const articleValues = ownDataValues(candidate, ARTICLE_KEYS);
  const attachmentValues = ownDataValues(candidate, ATTACHMENT_KEYS);
  if (!articleValues || !attachmentValues) return undefined;

  const article = cloneRecord(articleValues);
  const attachmentClone = cloneRecord(attachmentValues);
  if (!article || !attachmentClone) return undefined;

  const rawCollectedImages = attachmentClone.collectedImages;
  if (rawCollectedImages !== undefined && !Array.isArray(rawCollectedImages)) return undefined;

  return Object.freeze({
    article,
    attachments: Object.freeze({
      context: attachmentClone.contentPolicyContext,
      collectedImages: Array.isArray(rawCollectedImages)
        ? Object.freeze([...rawCollectedImages])
        : undefined,
      telemetry: Object.freeze({
        contentPolicy: attachmentClone.contentPolicy,
        factCheckReport: attachmentClone.factCheckReport,
      }),
    }),
  });
}

function appendMissingConclusionTail(bodyPlain: string, conclusion: unknown): string {
  if (typeof conclusion !== 'string' || !conclusion.trim()) return bodyPlain;
  if (bodyPlain.includes(conclusion)) return bodyPlain;

  const separatorPattern = /\n\s*\n/g;
  let match: RegExpExecArray | null;
  let longestMatchingPrefixLength = -1;
  while ((match = separatorPattern.exec(conclusion)) !== null) {
    const prefix = conclusion.slice(0, match.index).trimEnd();
    if (prefix.length > 0 && bodyPlain.trimEnd().endsWith(prefix)) {
      longestMatchingPrefixLength = prefix.length;
    }
  }
  if (longestMatchingPrefixLength < 0) return bodyPlain;

  const normalizedBody = bodyPlain.trimEnd();
  return `${normalizedBody}${conclusion.slice(longestMatchingPrefixLength)}`;
}

function acceptCoreContent(
  content: StructuredContent,
  options: ContentQualityV3PublicationCandidateOptions,
): ContentQualityV3PublicationCandidateResult {
  if (options.factualEvidence) {
    const factualIssue = validateFactualSafety(content, options.factualEvidence);
    if (factualIssue) return reject(factualIssue);
  }
  return Object.freeze({
    ok: true,
    envelope: Object.freeze({
      content,
      attachments: Object.freeze({ telemetry: Object.freeze({}) }),
    }),
  });
}

function finalizeCoreCandidate(
  article: CandidateRecord,
  options: ContentQualityV3PublicationCandidateOptions,
): ContentQualityV3PublicationCandidateResult {
  const bodyPlain = typeof article.bodyPlain === 'string'
    ? appendMissingConclusionTail(article.bodyPlain, article.conclusion)
    : article.bodyPlain;
  const synchronized = {
    ...article,
    bodyPlain,
    content: bodyPlain,
  };
  const resolveTitleContract = (
    candidate: unknown,
  ): ContentQualityV3TitleContract | undefined => {
    const contract = options.titleContract;
    if (options.contentMode !== 'affiliate' || !contract) return contract;
    const selectedTitle = candidate && typeof candidate === 'object'
      ? (candidate as { selectedTitle?: unknown }).selectedTitle
      : undefined;
    const actualTitle = typeof selectedTitle === 'string' ? selectedTitle : '';
    const repairedExpectedTitle = repairContentQualityV3AffiliateTitle(
      contract.expectedTitle,
      options.affiliateEvidence ?? {},
    );
    if (repairedExpectedTitle === contract.expectedTitle || actualTitle !== repairedExpectedTitle) {
      return contract;
    }
    return Object.freeze({ ...contract, expectedTitle: repairedExpectedTitle });
  };
  const finalized = revalidateContentQualityV3FinalizedContent(synchronized, {
    titleContract: resolveTitleContract(synchronized),
  });
  if (!finalized.ok) return reject(finalized.issueCode);

  if (options.contentMode === 'business') {
    let businessContent: StructuredContent;
    try {
      businessContent = enforceContentQualityV3BusinessGuard(
        finalized.content,
        options.businessEvidence ?? {},
      );
    } catch {
      return reject('business_safety_failed');
    }
    const revalidated = revalidateContentQualityV3FinalizedContent(businessContent, {
      titleContract: options.titleContract,
    });
    if (!revalidated.ok) return reject(revalidated.issueCode);
    return acceptCoreContent(revalidated.content, options);
  }

  if (options.contentMode !== 'affiliate') {
    return acceptCoreContent(finalized.content, options);
  }

  const affiliateDecision = evaluateContentQualityV3AffiliateGuard({
    content: finalized.content,
    source: options.affiliateEvidence ?? {},
    minimumBodyChars: options.minimumBodyChars ?? 2_500,
    authenticityRetryAvailable: false,
    shoppingQualityRetryAvailable: false,
  });
  if (affiliateDecision.action !== 'accept') {
    return reject('affiliate_authenticity_failed');
  }

  const revalidated = revalidateContentQualityV3FinalizedContent(affiliateDecision.content, {
    titleContract: resolveTitleContract(affiliateDecision.content),
  });
  if (!revalidated.ok) return reject(revalidated.issueCode);
  return acceptCoreContent(revalidated.content, options);
}

function materializeAdvisoryCandidate(
  candidate: unknown,
  issueCode: ContentQualityV3PublicationIssueCode,
): ContentQualityV3PublicationEnvelope | undefined {
  if (!canBecomeAdvisory(issueCode)) return undefined;
  const split = splitCandidate(candidate);
  if (!split) return undefined;

  const bodyPlain = typeof split.article.bodyPlain === 'string'
    ? appendMissingConclusionTail(split.article.bodyPlain, split.article.conclusion)
    : split.article.bodyPlain;
  const structurallyPublishable = revalidateContentQualityV3FinalizedContent({
    ...split.article,
    bodyPlain,
    content: bodyPlain,
  });
  if (!structurallyPublishable.ok) return undefined;

  return Object.freeze({
    content: appendPublicationAdvisories(structurallyPublishable.content, [issueCode]),
    attachments: split.attachments,
  });
}

export function finalizeContentQualityV3PublicationCandidate(
  candidate: unknown,
  options: ContentQualityV3PublicationCandidateOptions = {},
): ContentQualityV3PublicationCandidateResult {
  if (!isObject(candidate)) {
    const finalization = finalizeContentQualityV3Draft(candidate, {
      titleContract: options.titleContract,
    });
    return finalization.ok
      ? reject('invalid_candidate')
      : reject(finalization.issueCode);
  }
  const split = splitCandidate(candidate);
  if (!split) return reject('invalid_candidate');

  const coreResult = finalizeCoreCandidate(split.article, options);
  if (!coreResult.ok) return coreResult;
  return Object.freeze({
    ok: true,
    envelope: Object.freeze({
      content: coreResult.envelope.content,
      attachments: split.attachments,
    }),
  });
}

export function materializeContentQualityV3PublicationEnvelope(
  envelope: ContentQualityV3PublicationEnvelope,
): StructuredContent {
  let content: Record<string, unknown>;
  try {
    content = structuredClone(envelope.content) as unknown as Record<string, unknown>;
  } catch {
    throw new ContentQualityV3PublicationError('invalid_candidate');
  }

  const attachments = envelope.attachments;
  if (attachments.context !== undefined) content.contentPolicyContext = attachments.context;
  if (attachments.collectedImages !== undefined) {
    content.collectedImages = [...attachments.collectedImages];
  }
  if (attachments.telemetry.contentPolicy !== undefined) {
    content.contentPolicy = attachments.telemetry.contentPolicy;
  }
  if (attachments.telemetry.factCheckReport !== undefined) {
    content.factCheckReport = attachments.telemetry.factCheckReport;
  }
  return deepFreeze(content) as unknown as StructuredContent;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ('value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

export function enforceContentQualityV3PublicationBoundary<T>(
  candidate: T,
  ticket: ContentQualityV3PublicationTicket | undefined,
  options: ContentQualityV3PublicationBoundaryOptions = {},
): T | StructuredContent {
  if (ticket === undefined) return candidate;
  if (!isObject(ticket)) {
    throw new ContentQualityV3PublicationError('untrusted_provenance');
  }

  const state = activePublicationTickets.get(ticket);
  if (!state) {
    throw new ContentQualityV3PublicationError('untrusted_provenance');
  }
  activePublicationTickets.delete(ticket);

  const result = finalizeContentQualityV3PublicationCandidate(candidate, {
    titleContract: state.titleContract,
    contentMode: state.contentMode,
    affiliateEvidence: state.affiliateEvidence,
    businessEvidence: state.businessEvidence,
    factualEvidence: state.factualEvidence,
    minimumBodyChars: state.minimumBodyChars,
  });
  const advisoryIssues = [...state.registrationAdvisories];
  let envelope: ContentQualityV3PublicationEnvelope;
  if (!result.ok) {
    const advisoryEnvelope = state.safetyMode === 'advisory'
      ? materializeAdvisoryCandidate(candidate, result.issueCode)
      : undefined;
    if (!advisoryEnvelope) {
      throw new ContentQualityV3PublicationError(result.issueCode);
    }
    advisoryIssues.push(result.issueCode);
    envelope = advisoryEnvelope;
  } else {
    envelope = result.envelope;
  }
  const supplementIssue = validateVisibleInspection(
    envelope.content,
    state,
    options.userSupplements,
    options.inspectionTexts,
  );
  if (supplementIssue) {
    if (state.safetyMode !== 'advisory' || !canBecomeAdvisory(supplementIssue)) {
      throw new ContentQualityV3PublicationError(supplementIssue);
    }
    advisoryIssues.push(supplementIssue);
  }
  const advisedEnvelope = advisoryIssues.length > 0
    ? Object.freeze({
      ...envelope,
      content: appendPublicationAdvisories(envelope.content, advisoryIssues),
    })
    : envelope;
  return materializeContentQualityV3PublicationEnvelope(advisedEnvelope);
}
