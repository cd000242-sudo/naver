import { describe, expect, it } from 'vitest';
import { resolvePostRunPageHealthDecision } from '../automation/postRunPageHealthPolicy.js';

describe('resolvePostRunPageHealthDecision', () => {
  it('keeps page references when the post-run page health probe succeeds', () => {
    expect(resolvePostRunPageHealthDecision({ urlProbeSucceeded: true })).toEqual({
      status: 'healthy',
      shouldKeepPageReferences: true,
      shouldResetPageReferences: false,
      logKey: 'page-session-kept',
    });
  });

  it('resets page references when the post-run page health probe fails', () => {
    expect(resolvePostRunPageHealthDecision({ urlProbeSucceeded: false })).toEqual({
      status: 'unhealthy',
      shouldKeepPageReferences: false,
      shouldResetPageReferences: true,
      logKey: 'page-session-reset',
    });
  });
});
