import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATION_SUBMISSION_MODE,
  resolveGenerationSubmissionMode,
  shouldAllowAutomaticProviderRetry,
} from '../generation/submissionPolicy';

describe('generation submission policy', () => {
  it('uses at-most-once submission unless a trusted caller explicitly opts into legacy retry', () => {
    expect(DEFAULT_GENERATION_SUBMISSION_MODE).toBe('single-submission');
    expect(resolveGenerationSubmissionMode(undefined)).toBe('single-submission');
    expect(resolveGenerationSubmissionMode('invalid')).toBe('single-submission');
    expect(shouldAllowAutomaticProviderRetry(undefined)).toBe(false);
    expect(shouldAllowAutomaticProviderRetry('single-submission')).toBe(false);
    expect(shouldAllowAutomaticProviderRetry('legacy-retry')).toBe(true);
  });

  it('does not let an untrusted request elevate itself to legacy retry behavior', () => {
    expect(resolveGenerationSubmissionMode('legacy-retry', { trusted: false })).toBe('single-submission');
    expect(resolveGenerationSubmissionMode('legacy-retry', { trusted: true })).toBe('legacy-retry');
  });
});
