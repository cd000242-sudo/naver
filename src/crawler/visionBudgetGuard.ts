// v2.7.63 — Vision API 비용 누적 추적 + 경고 임계값
//
// Opus 5인 토론 (성능 엔지니어):
//   글당 누적 ₩500 초과 → 경고 / ₩1500 초과 → 자동 차단

import type { VisionRouting } from '../runtime/modelRegistry.js';

const COST_PER_CALL_KRW: Record<string, number> = {
  'gemini-flash': 50,
  'gemini-pro': 400,
  'claude-sonnet': 60,
  'openai-41': 40,
  'openai-41-mini': 15,
};

const WARN_THRESHOLD_KRW = 500;
const HARD_LIMIT_KRW = 1500;

let _accumulated = 0;
let _calls = 0;

export function resetVisionBudget(): void {
  _accumulated = 0;
  _calls = 0;
}

export function getVisionBudget(): { krw: number; calls: number } {
  return { krw: _accumulated, calls: _calls };
}

export interface BudgetCheckResult {
  proceed: boolean;
  warning?: string;
  blocked?: boolean;
}

export function chargeAndCheck(routing: VisionRouting): BudgetCheckResult {
  const cost = COST_PER_CALL_KRW[routing.provider] ?? 50;
  _accumulated += cost;
  _calls++;

  if (_accumulated >= HARD_LIMIT_KRW) {
    return {
      proceed: false,
      blocked: true,
      warning: `vision 비용 한도 초과 (₩${_accumulated} ≥ ₩${HARD_LIMIT_KRW}) — 자동 차단`,
    };
  }
  if (_accumulated >= WARN_THRESHOLD_KRW) {
    return {
      proceed: true,
      warning: `vision 누적 ₩${_accumulated} (${_calls}회) — ${routing.provider} 사용 중`,
    };
  }
  return { proceed: true };
}
