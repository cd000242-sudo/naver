// [2026-09-22 Critique Loop] Per-article call/cost ledger. Calls and characters are exact;
// USD is 0 for subscription CLIs (flat plan, no marginal cost) and null for API engines
// whose price is not known here — never a guessed number (memory: 추정 효과 금지).

import type { CostLedger, QualityCallRecord } from './types';

export interface CostLedgerState {
  readonly baseCalls: number;
  readonly baseCostUsd: number | null;
  readonly calls: readonly QualityCallRecord[];
}

export function createCostLedger(baseCalls: number, baseCostUsd: number | null = null): CostLedgerState {
  return { baseCalls, baseCostUsd, calls: [] };
}

export function recordCall(state: CostLedgerState, call: QualityCallRecord): CostLedgerState {
  return { ...state, calls: [...state.calls, call] };
}

function marginalCost(calls: readonly QualityCallRecord[], subscription: boolean): number | null {
  if (calls.length === 0) return 0;
  return subscription ? 0 : null;
}

export function finalizeCostLedger(state: CostLedgerState, subscription: boolean): CostLedger {
  const qualityCalls = state.calls.length;
  const qualityCostUsd = marginalCost(state.calls, subscription);
  const totalCostUsd = state.baseCostUsd === null || qualityCostUsd === null ? null : state.baseCostUsd + qualityCostUsd;
  return {
    baseCalls: state.baseCalls,
    qualityCalls,
    totalCalls: state.baseCalls + qualityCalls,
    baseCostUsd: state.baseCostUsd,
    qualityCostUsd,
    totalCostUsd,
    qualityPromptChars: state.calls.reduce((n, c) => n + c.promptChars, 0),
    qualityResponseChars: state.calls.reduce((n, c) => n + c.responseChars, 0),
    calls: state.calls,
  };
}

/** Wrap a route so every call is timed and recorded. */
export function instrumentedCall(
  callModel: (prompt: string, options?: { maxTokens?: number; timeoutMs?: number }) => Promise<string>,
  onRecord: (call: Omit<QualityCallRecord, 'stage' | 'round' | 'engine'>) => void,
): (prompt: string, options?: { maxTokens?: number; timeoutMs?: number }) => Promise<string> {
  return async (prompt, options) => {
    const started = Date.now();
    try {
      const response = await callModel(prompt, options);
      onRecord({ promptChars: prompt.length, responseChars: String(response ?? '').length, elapsedMs: Date.now() - started });
      return response;
    } catch (error) {
      onRecord({ promptChars: prompt.length, responseChars: 0, elapsedMs: Date.now() - started });
      throw error;
    }
  };
}
