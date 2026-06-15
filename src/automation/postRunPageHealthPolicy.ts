export type PostRunPageHealthStatus = 'healthy' | 'unhealthy';
export type PostRunPageHealthLogKey = 'page-session-kept' | 'page-session-reset';

export interface PostRunPageHealthInput {
  urlProbeSucceeded: boolean;
}

export interface PostRunPageHealthDecision {
  status: PostRunPageHealthStatus;
  shouldKeepPageReferences: boolean;
  shouldResetPageReferences: boolean;
  logKey: PostRunPageHealthLogKey;
}

export function resolvePostRunPageHealthDecision(
  input: PostRunPageHealthInput
): PostRunPageHealthDecision {
  if (input.urlProbeSucceeded) {
    return {
      status: 'healthy',
      shouldKeepPageReferences: true,
      shouldResetPageReferences: false,
      logKey: 'page-session-kept',
    };
  }

  return {
    status: 'unhealthy',
    shouldKeepPageReferences: false,
    shouldResetPageReferences: true,
    logKey: 'page-session-reset',
  };
}
