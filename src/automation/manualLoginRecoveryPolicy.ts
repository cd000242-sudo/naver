import {
  isNaverBlogDomainUrl,
  isNaverLoginUrl,
  isNaverWriteEditorUrl,
  needsWriteEditorNavigationAfterManualLogin,
} from './editorUrlState.js';

export type ManualLoginCheckpointAction =
  | 'handle-device-confirm'
  | 'wait-two-factor'
  | 'navigate-write-editor'
  | 'navigate-from-naver-domain'
  | 'success'
  | 'wait';

export interface ManualLoginCheckpointInput {
  currentUrl: string;
  deviceConfirmDetected: boolean;
  twoFactorDetected: boolean;
}

export interface ManualLoginCheckpointDecision {
  action: ManualLoginCheckpointAction;
  reason: string;
}

export function isManualLoginBlogLandingSuccessful(value: string): boolean {
  return isNaverBlogDomainUrl(value) && !isNaverLoginUrl(value);
}

export function resolveManualLoginCheckpoint(input: ManualLoginCheckpointInput): ManualLoginCheckpointDecision {
  if (input.deviceConfirmDetected) {
    return { action: 'handle-device-confirm', reason: 'device-confirm-page' };
  }

  if (input.twoFactorDetected) {
    return { action: 'wait-two-factor', reason: 'two-factor-page' };
  }

  const currentUrl = input.currentUrl;
  if (isManualLoginBlogLandingSuccessful(currentUrl)) {
    if (needsWriteEditorNavigationAfterManualLogin(currentUrl)) {
      return { action: 'navigate-write-editor', reason: 'blog-domain-without-editor' };
    }

    if (isNaverWriteEditorUrl(currentUrl)) {
      return { action: 'success', reason: 'already-on-writer' };
    }

    return { action: 'success', reason: 'blog-domain' };
  }

  if (!isNaverLoginUrl(currentUrl) && currentUrl.includes('naver.com')) {
    return { action: 'navigate-from-naver-domain', reason: 'logged-in-naver-domain' };
  }

  return { action: 'wait', reason: 'login-not-complete' };
}
