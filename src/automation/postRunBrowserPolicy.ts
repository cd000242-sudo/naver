export interface PostRunBrowserPolicyInput {
  keepBrowserOpen?: boolean | null;
  hasBrowser: boolean;
  hasPage: boolean;
  hasPublishedUrl: boolean;
}

export interface PostRunBrowserPolicy {
  keepOpen: boolean;
  shouldCloseBrowser: boolean;
  shouldLogKeepOpen: boolean;
  shouldReviewPublishedPost: boolean;
  shouldMinimizeBrowser: boolean;
  shouldCheckPageHealth: boolean;
  shouldCleanupStalePages: boolean;
}

export function resolvePostRunBrowserPolicy(input: PostRunBrowserPolicyInput): PostRunBrowserPolicy {
  const keepOpen = input.keepBrowserOpen ?? true;

  return {
    keepOpen,
    shouldCloseBrowser: !keepOpen && input.hasBrowser,
    shouldLogKeepOpen: keepOpen,
    shouldReviewPublishedPost: keepOpen && input.hasPage && input.hasPublishedUrl,
    shouldMinimizeBrowser: keepOpen,
    shouldCheckPageHealth: keepOpen && input.hasPage,
    shouldCleanupStalePages: keepOpen && input.hasBrowser,
  };
}
