import type { StructuredContent } from '../contentGenerator';

export type PublishableContentIssueCode =
  | 'not_object'
  | 'error_status'
  | 'invalid_status'
  | 'blank_title'
  | 'blank_body'
  | 'invalid_structure';

export type PublishableContentResult = Readonly<
  | { ok: true; content: StructuredContent }
  | { ok: false; issueCode: PublishableContentIssueCode }
>;

type UnknownRecord = Readonly<Record<string, unknown>>;

const TARGET_AGES = Object.freeze(['20s', '30s', '40s', '50s', 'all'] as const);
const URGENCY_LEVELS = Object.freeze(['breaking', 'depth', 'evergreen'] as const);
const RISK_LEVELS = Object.freeze(['low', 'medium', 'high'] as const);
const LEGAL_RISK_LEVELS = Object.freeze(['safe', 'caution', 'danger'] as const);
const TONES = Object.freeze(['friendly', 'expert', 'relatable'] as const);
const COMMENT_TYPES = Object.freeze(['opinion', 'experience', 'vote'] as const);
const CONTROVERSY_LEVELS = Object.freeze(['none', 'low', 'medium'] as const);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isTitleCandidate(value: unknown): boolean {
  return isRecord(value)
    && typeof value.text === 'string'
    && isFiniteNumber(value.score)
    && typeof value.reasoning === 'string';
}

function isHeading(value: unknown): boolean {
  return isRecord(value)
    && typeof value.title === 'string'
    && isOptionalString(value.content)
    && typeof value.summary === 'string'
    && isStringArray(value.keywords)
    && typeof value.imagePrompt === 'string';
}

function isImage(value: unknown): boolean {
  return isRecord(value)
    && typeof value.heading === 'string'
    && typeof value.prompt === 'string'
    && typeof value.placement === 'string'
    && typeof value.alt === 'string'
    && typeof value.caption === 'string';
}

function isEstimatedEngagement(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.views)
    && isFiniteNumber(value.comments)
    && isFiniteNumber(value.shares);
}

function isMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return typeof value.category === 'string'
    && TARGET_AGES.includes(value.targetAge as never)
    && URGENCY_LEVELS.includes(value.urgency as never)
    && typeof value.estimatedReadTime === 'string'
    && isFiniteNumber(value.wordCount)
    && RISK_LEVELS.includes(value.aiDetectionRisk as never)
    && LEGAL_RISK_LEVELS.includes(value.legalRisk as never)
    && isFiniteNumber(value.seoScore)
    && typeof value.keywordStrategy === 'string'
    && typeof value.publishTimeRecommend === 'string'
    && isOptionalString(value.originalTitle)
    && (value.tone === undefined || TONES.includes(value.tone as never))
    && (value.estimatedEngagement === undefined || isEstimatedEngagement(value.estimatedEngagement));
}

function isQuality(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return RISK_LEVELS.includes(value.aiDetectionRisk as never)
    && LEGAL_RISK_LEVELS.includes(value.legalRisk as never)
    && isFiniteNumber(value.seoScore)
    && isFiniteNumber(value.originalityScore)
    && isFiniteNumber(value.readabilityScore)
    && isStringArray(value.warnings)
    && (value.viralPotential === undefined || isFiniteNumber(value.viralPotential))
    && (value.engagementScore === undefined || isFiniteNumber(value.engagementScore));
}

function isCommentTrigger(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.position)
    && COMMENT_TYPES.includes(value.type as never)
    && typeof value.text === 'string';
}

function isViralHooks(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.commentTriggers)) return false;
  const shareTrigger = value.shareTrigger;
  const bookmarkValue = value.bookmarkValue;

  return value.commentTriggers.every(isCommentTrigger)
    && isRecord(shareTrigger)
    && isFiniteNumber(shareTrigger.position)
    && typeof shareTrigger.quote === 'string'
    && typeof shareTrigger.prompt === 'string'
    && isRecord(bookmarkValue)
    && typeof bookmarkValue.reason === 'string'
    && typeof bookmarkValue.seriesPromise === 'string';
}

function isTrafficStrategy(value: unknown): boolean {
  return isRecord(value)
    && typeof value.peakTrafficTime === 'string'
    && typeof value.publishRecommendTime === 'string'
    && typeof value.shareableQuote === 'string'
    && CONTROVERSY_LEVELS.includes(value.controversyLevel as never)
    && typeof value.retentionHook === 'string';
}

function isPostPublishActions(value: unknown): boolean {
  return isRecord(value)
    && isStringArray(value.selfComments)
    && typeof value.shareMessage === 'string'
    && typeof value.notificationMessage === 'string';
}

function isCta(value: unknown): boolean {
  return isRecord(value)
    && typeof value.text === 'string'
    && isOptionalString(value.link);
}

function hasValidRequiredStructure(value: UnknownRecord): boolean {
  return typeof value.generationTime === 'string'
    && isStringArray(value.titleAlternatives)
    && Array.isArray(value.titleCandidates)
    && value.titleCandidates.every(isTitleCandidate)
    && typeof value.bodyHtml === 'string'
    && Array.isArray(value.headings)
    && value.headings.every(isHeading)
    && isStringArray(value.hashtags)
    && Array.isArray(value.images)
    && value.images.every(isImage)
    && isMetadata(value.metadata)
    && isQuality(value.quality);
}

function hasValidOptionalStructure(value: UnknownRecord): boolean {
  return isOptionalString(value.content)
    && isOptionalString(value.introduction)
    && isOptionalString(value.conclusion)
    && (value.viralHooks === undefined || isViralHooks(value.viralHooks))
    && (value.trafficStrategy === undefined || isTrafficStrategy(value.trafficStrategy))
    && (value.postPublishActions === undefined || isPostPublishActions(value.postPublishActions))
    && (value.cta === undefined || isCta(value.cta))
    && (value.collectedImages === undefined || isStringArray(value.collectedImages));
}

function findIssue(value: UnknownRecord): PublishableContentIssueCode | undefined {
  if (value.status === 'error') return 'error_status';
  if (value.status !== 'success' && value.status !== 'warning') return 'invalid_status';
  if (typeof value.selectedTitle !== 'string') return 'invalid_structure';
  if (!value.selectedTitle.trim()) return 'blank_title';
  if (typeof value.bodyPlain !== 'string') return 'invalid_structure';
  if (!value.bodyPlain.trim()) return 'blank_body';
  if (!hasValidRequiredStructure(value) || !hasValidOptionalStructure(value)) {
    return 'invalid_structure';
  }

  return undefined;
}

function reject(issueCode: PublishableContentIssueCode): PublishableContentResult {
  return Object.freeze({ ok: false, issueCode });
}

export function validatePublishableContent(value: unknown): PublishableContentResult {
  if (!isRecord(value)) return reject('not_object');

  try {
    const issueCode = findIssue(value);
    return issueCode
      ? reject(issueCode)
      : Object.freeze({ ok: true, content: value as unknown as StructuredContent });
  } catch {
    return reject('invalid_structure');
  }
}
