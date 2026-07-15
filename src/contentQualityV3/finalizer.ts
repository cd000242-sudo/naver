import type { StructuredContent } from '../contentGenerator.js';
import {
  validatePublishableContent,
  type PublishableContentIssueCode,
} from '../contentPipeline/resultContract.js';
import type { ContentQualityV3TitleContract } from './titleContract.js';
import { validateContentQualityV3StrictOutput } from './strictOutputValidator.js';

export { resolveContentQualityV3TitleContract } from './titleContract.js';

export const CONTENT_QUALITY_V3_MAX_TITLE_CONTRACT_RETRIES = 1;

export type ContentQualityV3FinalizationIssueCode =
  | `structured_output_${PublishableContentIssueCode}`
  | 'manual_title_mismatch'
  | 'keyword_title_mismatch';

export type ContentQualityV3FinalizationResult = Readonly<
  | { ok: true; content: StructuredContent }
  | { ok: false; issueCode: ContentQualityV3FinalizationIssueCode }
>;

export type ContentQualityV3FinalizationDecision = Readonly<
  | {
    action: 'return';
    content: StructuredContent;
    titleContractRetriesUsed: number;
  }
  | {
    action: 'retry' | 'fail';
    issueCode: ContentQualityV3FinalizationIssueCode;
    titleContractRetriesUsed: number;
  }
>;

export interface ContentQualityV3FinalizationDecisionOptions {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly titleContractRetriesUsed: number;
}

export function recoverContentQualityV3BodyHtml(bodyPlain: string): string {
  return bodyPlain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}

function reject(
  issueCode: ContentQualityV3FinalizationIssueCode,
): ContentQualityV3FinalizationResult {
  return Object.freeze({ ok: false, issueCode });
}

export function finalizeContentQualityV3Draft(
  candidate: unknown,
  options: Readonly<{ titleContract?: ContentQualityV3TitleContract }> = {},
): ContentQualityV3FinalizationResult {
  const strictValidation = validateContentQualityV3StrictOutput(candidate);
  if (!strictValidation.ok) return reject('structured_output_invalid_structure');
  return revalidateContentQualityV3FinalizedContent(strictValidation.content, options);
}

/**
 * Revalidates content that already crossed the strict provider-schema boundary.
 * Publication-only fields and guard telemetry may exist at this point, so this
 * path must never be used directly on an untrusted provider response.
 */
export function revalidateContentQualityV3FinalizedContent(
  candidate: unknown,
  options: Readonly<{ titleContract?: ContentQualityV3TitleContract }> = {},
): ContentQualityV3FinalizationResult {
  const validation = validatePublishableContent(candidate);
  if (!validation.ok) return reject(`structured_output_${validation.issueCode}`);

  const titleContract = options.titleContract;
  if (titleContract && validation.content.selectedTitle !== titleContract.expectedTitle) {
    return reject(titleContract.issueCode);
  }

  const content: StructuredContent = Object.freeze({
    ...validation.content,
    bodyHtml: recoverContentQualityV3BodyHtml(validation.content.bodyPlain),
  });
  return Object.freeze({ ok: true, content });
}

export function materializeContentQualityV3ForLegacyConsumers(
  content: Readonly<StructuredContent>,
): StructuredContent {
  return globalThis.structuredClone(content);
}

function isTitleContractIssue(issueCode: ContentQualityV3FinalizationIssueCode): boolean {
  return issueCode === 'manual_title_mismatch' || issueCode === 'keyword_title_mismatch';
}

export function decideContentQualityV3Finalization(
  result: ContentQualityV3FinalizationResult,
  options: ContentQualityV3FinalizationDecisionOptions,
): ContentQualityV3FinalizationDecision {
  if (result.ok) {
    return Object.freeze({
      action: 'return',
      content: result.content,
      titleContractRetriesUsed: options.titleContractRetriesUsed,
    });
  }

  const titleContractIssue = isTitleContractIssue(result.issueCode);
  const hasAttemptCapacity = options.attempt < options.maxAttempts;
  const canRetryTitleContract = titleContractIssue
    && options.titleContractRetriesUsed < CONTENT_QUALITY_V3_MAX_TITLE_CONTRACT_RETRIES;
  const shouldRetry = hasAttemptCapacity && (!titleContractIssue || canRetryTitleContract);
  const titleContractRetriesUsed = shouldRetry && titleContractIssue
    ? options.titleContractRetriesUsed + 1
    : options.titleContractRetriesUsed;

  return Object.freeze({
    action: shouldRetry ? 'retry' : 'fail',
    issueCode: result.issueCode,
    titleContractRetriesUsed,
  });
}

export function buildContentQualityV3FinalizationRetryInstruction(
  issueCode: ContentQualityV3FinalizationIssueCode,
  titleContract?: ContentQualityV3TitleContract,
): string {
  const titleInstruction = titleContract && isTitleContractIssue(issueCode)
    ? ' Set selectedTitle exactly to user_brief.requiredTitle.'
    : '';
  return `[CONTENT_QUALITY_V3_RETRY:${issueCode}] Return one schema-valid JSON object.${titleInstruction}`;
}
