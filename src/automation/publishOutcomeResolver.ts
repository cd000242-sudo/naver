import { classifyPublishFailure, type PublishFailureCode } from './publishFailureClassifier.js';
import {
  isNaverBlogDomainUrl,
  isNaverWriteEditorUrl,
} from './editorUrlState.js';

export interface PublishStatusSnapshot {
  success?: boolean;
  error?: boolean;
  successText?: string;
  errorText?: string;
}

export type ImmediatePublishOutcome =
  | {
      success: true;
      url?: string;
      reason: 'CONCRETE_POST_URL';
      needsManualUrlCheck: boolean;
    }
  | {
      success: false;
      code: PublishFailureCode;
      retryable: boolean;
      userActionRequired: boolean;
      message: string;
    };

export interface ImmediatePublishOutcomeInput {
  beforeUrl: string;
  afterUrl?: string | null;
  finalUrl?: string | null;
  retryUrl?: string | null;
  publishStatus?: PublishStatusSnapshot | null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isSameUrl(left: string, right: string): boolean {
  return stripTrailingSlash(left).toLowerCase() === stripTrailingSlash(right).toLowerCase();
}

export function isNaverEditorUrl(value: string): boolean {
  return isNaverWriteEditorUrl(value);
}

export function isNaverBlogUrl(value: string): boolean {
  return isNaverBlogDomainUrl(value);
}

export interface NaverBlogPostIdentity {
  blogId: string;
  logNo: string;
}

export function extractNaverBlogPostIdentity(value: string): NaverBlogPostIdentity | null {
  if (!isNaverBlogUrl(value) || isNaverEditorUrl(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const logNo = parsed.searchParams.get('logNo');
    const queryBlogId = parsed.searchParams.get('blogId');
    if (logNo && /^\d+$/.test(logNo) && queryBlogId?.trim()) {
      return { blogId: queryBlogId.trim(), logNo };
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && /^\d+$/.test(segments[1])) {
      return { blogId: decodeURIComponent(segments[0]), logNo: segments[1] };
    }
    return null;
  } catch {
    const match = value.match(/blog\.naver\.com\/([^/\s?#]+)\/(\d+)/i);
    return match ? { blogId: match[1], logNo: match[2] } : null;
  }
}

export function isConcreteNaverBlogPostUrl(value: string): boolean {
  return extractNaverBlogPostIdentity(value) !== null;
}

function changedCandidates(input: ImmediatePublishOutcomeInput): string[] {
  const beforeUrl = normalizeUrl(input.beforeUrl) || '';
  return [input.afterUrl, input.finalUrl, input.retryUrl]
    .map(normalizeUrl)
    .filter((value): value is string => Boolean(value))
    .filter((value) => !isSameUrl(value, beforeUrl));
}

function allObservedUrls(input: ImmediatePublishOutcomeInput): string[] {
  return [input.beforeUrl, input.afterUrl, input.finalUrl, input.retryUrl]
    .map(normalizeUrl)
    .filter((value): value is string => Boolean(value));
}

function failure(message: string): ImmediatePublishOutcome {
  const classified = classifyPublishFailure(message);
  return {
    success: false,
    code: classified.code,
    retryable: classified.retryable,
    userActionRequired: classified.userActionRequired,
    message,
  };
}

export function resolveImmediatePublishOutcome(input: ImmediatePublishOutcomeInput): ImmediatePublishOutcome {
  const changed = changedCandidates(input);
  const concretePostUrl = changed.find(isConcreteNaverBlogPostUrl);
  if (concretePostUrl) {
    return {
      success: true,
      url: concretePostUrl,
      reason: 'CONCRETE_POST_URL',
      needsManualUrlCheck: false,
    };
  }

  const status = input.publishStatus || null;
  if (status?.error) {
    return failure(status.errorText || 'publish failure message was visible');
  }

  if (status?.success) {
    return failure(`publish success message appeared but no post URL was confirmed${status.successText ? ` (${status.successText})` : ''}`);
  }

  const nonPostBlogUrl = changed.find((url) => isNaverBlogUrl(url) && !isNaverEditorUrl(url));
  if (nonPostBlogUrl) {
    return failure(`publish navigation timeout: no post URL was confirmed (${nonPostBlogUrl})`);
  }

  if (allObservedUrls(input).some(isNaverEditorUrl)) {
    return failure('editor did not navigate to a published post URL');
  }

  return failure('publish navigation timeout: no post URL or success message was confirmed');
}

export function resolvePublishedUrlAfterOutcome(
  currentPublishedUrl: string | null | undefined,
  outcome: ImmediatePublishOutcome,
): string | null {
  if (!outcome.success) {
    return normalizeUrl(currentPublishedUrl);
  }

  return normalizeUrl(outcome.url) || normalizeUrl(currentPublishedUrl);
}

export function formatPublishGuardLog(
  outcome: ImmediatePublishOutcome,
  resolvedPublishedUrl: string | null | undefined,
): string | null {
  if (!outcome.success || !outcome.needsManualUrlCheck) {
    return null;
  }

  return `[PublishGuard] outcome=${outcome.reason}, url=${normalizeUrl(outcome.url) || normalizeUrl(resolvedPublishedUrl) || '(none)'}`;
}
