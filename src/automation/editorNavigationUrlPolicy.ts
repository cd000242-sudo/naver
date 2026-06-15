import {
  isChromeErrorUrl,
  isNaverBlogDomainUrl,
  isNaverLoginUrl,
  isNaverWriteEditorUrl,
} from './editorUrlState.js';

export type BlogWriteNavigationUrlKind =
  | 'browser-error'
  | 'editor'
  | 'login'
  | 'blog-domain'
  | 'external';

export interface BlogWriteNavigationUrlState {
  kind: BlogWriteNavigationUrlKind;
  isBrowserError: boolean;
  isEditorUrl: boolean;
  isLoginRedirect: boolean;
  isBlogDomain: boolean;
  isExternalRedirect: boolean;
}

export interface BlogWriteFrameSwitchSurfaceDecision {
  isEditorSurface: boolean;
  isBlogDomainSurface: boolean;
  shouldRetryNavigation: boolean;
  shouldWaitForBlogDomainEditorFrame: boolean;
}

export type ManualLoginRetryWriteNavigationStatus =
  | 'ready'
  | 'blog-main-without-editor'
  | 'access-failed';

export interface ManualLoginRetryWriteNavigationDecision {
  status: ManualLoginRetryWriteNavigationStatus;
  isReadyForEditor: boolean;
}

type BlogWriteNavigationUrlFlags = Omit<Partial<BlogWriteNavigationUrlState>, 'kind'>;

function buildState(kind: BlogWriteNavigationUrlKind, flags: BlogWriteNavigationUrlFlags): BlogWriteNavigationUrlState {
  return {
    kind,
    isBrowserError: false,
    isEditorUrl: false,
    isLoginRedirect: false,
    isBlogDomain: false,
    isExternalRedirect: false,
    ...flags,
  };
}

export function classifyBlogWriteNavigationUrl(value: string): BlogWriteNavigationUrlState {
  if (isChromeErrorUrl(value)) {
    return buildState('browser-error', { isBrowserError: true });
  }

  const isEditorUrl = isNaverWriteEditorUrl(value);
  const isBlogDomain = isNaverBlogDomainUrl(value);

  if (isEditorUrl) {
    return buildState('editor', {
      isEditorUrl: true,
      isBlogDomain,
    });
  }

  if (isNaverLoginUrl(value)) {
    return buildState('login', { isLoginRedirect: true });
  }

  if (isBlogDomain) {
    return buildState('blog-domain', { isBlogDomain: true });
  }

  return buildState('external', { isExternalRedirect: true });
}

export function isOutsideBlogWriteSurface(value: string): boolean {
  const state = classifyBlogWriteNavigationUrl(value);
  return !state.isBlogDomain && !state.isEditorUrl;
}

export function shouldSkipBlogWriteWarmup(value: string): boolean {
  const state = classifyBlogWriteNavigationUrl(value);
  return state.isBlogDomain || state.isEditorUrl;
}

export function isBlogWriteLoginRedirect(value: string): boolean {
  return classifyBlogWriteNavigationUrl(value).isLoginRedirect;
}

export function resolveBlogWriteFrameSwitchSurface(value: string): BlogWriteFrameSwitchSurfaceDecision {
  const state = classifyBlogWriteNavigationUrl(value);
  const isEditorSurface = state.isEditorUrl;
  const isBlogDomainSurface = state.isBlogDomain;

  return {
    isEditorSurface,
    isBlogDomainSurface,
    shouldRetryNavigation: !isEditorSurface && !isBlogDomainSurface,
    shouldWaitForBlogDomainEditorFrame: isBlogDomainSurface && !isEditorSurface,
  };
}

export function resolveManualLoginRetryWriteNavigation(
  value: string,
  hasEditorFrame: boolean
): ManualLoginRetryWriteNavigationDecision {
  const state = classifyBlogWriteNavigationUrl(value);

  if (state.isBlogDomain && (state.isEditorUrl || hasEditorFrame)) {
    return {
      status: 'ready',
      isReadyForEditor: true,
    };
  }

  if (state.isBlogDomain) {
    return {
      status: 'blog-main-without-editor',
      isReadyForEditor: false,
    };
  }

  return {
    status: 'access-failed',
    isReadyForEditor: false,
  };
}
