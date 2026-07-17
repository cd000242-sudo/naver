/**
 * A generation request may be billable as soon as the provider receives it.
 * Therefore the public default is deliberately at-most-once: a timeout or
 * transport failure is reported to the caller instead of being re-submitted.
 */
export type GenerationSubmissionMode = 'single-submission' | 'legacy-retry';

export interface ResolveGenerationSubmissionModeOptions {
  /** Only main-process code may opt into a compatibility retry path. */
  readonly trusted?: boolean;
}

export const DEFAULT_GENERATION_SUBMISSION_MODE = 'single-submission' as const;

export function resolveGenerationSubmissionMode(
  value: unknown,
  options: ResolveGenerationSubmissionModeOptions = {},
): GenerationSubmissionMode {
  if (options.trusted === true && value === 'legacy-retry') {
    return 'legacy-retry';
  }
  return DEFAULT_GENERATION_SUBMISSION_MODE;
}

export function shouldAllowAutomaticProviderRetry(
  mode: GenerationSubmissionMode | undefined,
): boolean {
  return mode === 'legacy-retry';
}
