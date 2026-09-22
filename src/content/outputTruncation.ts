// [2026-09-22 audit P0] Output truncation is a first-class failure, not a parse problem.
//
// Every provider used to inspect finish_reason / finishReason / stop_reason ONLY when the
// response text was empty. A body cut at MAX_TOKENS with text present was returned as a
// success, the half JSON went through the 8-stage repair parser, and the article came out
// short or as a title-only object. Now a truncated non-empty response throws
// OutputTruncatedError so the caller can raise the budget and retry, or report
// OUTPUT_TRUNCATED honestly.

export type TruncationProvider = 'gemini' | 'openai' | 'claude' | 'perplexity' | 'agent';

const TRUNCATED_REASONS: Record<TruncationProvider, ReadonlySet<string>> = {
  gemini: new Set(['MAX_TOKENS']),
  openai: new Set(['length', 'max_output_tokens', 'incomplete']),
  claude: new Set(['max_tokens']),
  perplexity: new Set(['length']),
  agent: new Set(['length', 'max_tokens', 'MAX_TOKENS']),
};

export function isTruncatedFinishReason(provider: TruncationProvider, reason: unknown): boolean {
  const normalized = String(reason ?? '').trim();
  if (!normalized) return false;
  return TRUNCATED_REASONS[provider].has(normalized);
}

export class OutputTruncatedError extends Error {
  readonly code = 'OUTPUT_TRUNCATED';

  constructor(
    readonly provider: TruncationProvider,
    readonly model: string,
    readonly finishReason: string,
    readonly partialText: string,
    readonly outputTokens?: number,
  ) {
    super(
      `OUTPUT_TRUNCATED: ${provider}/${model} stopped at ${finishReason}`
      + (outputTokens ? ` after ${outputTokens} output tokens` : '')
      + ` (partial ${partialText.length} chars)`,
    );
    this.name = 'OutputTruncatedError';
  }
}

export function isOutputTruncatedError(error: unknown): error is OutputTruncatedError {
  return error instanceof OutputTruncatedError
    || (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'OUTPUT_TRUNCATED');
}

/** Raise an output budget once for a truncation retry, bounded by the provider ceiling. */
export function raisedOutputBudget(current: number, ceiling: number, factor = 1.5): number {
  const raised = Math.ceil(current * factor);
  return Math.min(ceiling, Math.max(current + 1024, raised));
}
