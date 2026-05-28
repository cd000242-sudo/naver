/**
 * Daily/monthly budget guard for Vision API calls.
 *
 * Phase 6 cost-control contract:
 * - Defaults are 200 calls/day and 5000 calls/month per SPEC §6 선행 결정 #5.
 * - When a limit is reached, checkBudget() returns allowed=false and the
 *   caller MUST surface a blocking modal to the user (feedback_no_fallback).
 *   Silent fallback to a cheaper provider is forbidden — the user explicitly
 *   has to acknowledge the over-limit before proceeding.
 *
 * Counters are process-local. Persistence across app restarts is deliberately
 * deferred to Phase 7 so the surface area of this module stays small.
 *
 * Day/month rollover is handled lazily: each call probes the current local
 * date and resets the relevant counter when the window has elapsed.
 */

const DEFAULT_DAILY_LIMIT = 200;
const DEFAULT_MONTHLY_LIMIT = 5000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BudgetLimits {
  readonly dailyLimit: number;
  readonly monthlyLimit: number;
}

let limits: BudgetLimits = {
  dailyLimit: DEFAULT_DAILY_LIMIT,
  monthlyLimit: DEFAULT_MONTHLY_LIMIT,
};

// ---------------------------------------------------------------------------
// Counter state
// ---------------------------------------------------------------------------

interface CounterWindow {
  count: number;
  windowKey: string;
}

let dailyWindow: CounterWindow = { count: 0, windowKey: '' };
let monthlyWindow: CounterWindow = { count: 0, windowKey: '' };

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function monthKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

function rolloverIfNeeded(now: Date): void {
  const dKey = dayKey(now);
  if (dailyWindow.windowKey !== dKey) {
    dailyWindow = { count: 0, windowKey: dKey };
  }
  const mKey = monthKey(now);
  if (monthlyWindow.windowKey !== mKey) {
    monthlyWindow = { count: 0, windowKey: mKey };
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BudgetCheck {
  /** True when the next Vision call is permitted. */
  readonly allowed: boolean;
  /** Human-readable reason when allowed=false; undefined when allowed=true. */
  readonly reason?: string;
  /** Calls used in the current day window. */
  readonly dailyUsed: number;
  /** Calls used in the current month window. */
  readonly monthlyUsed: number;
}

export interface BudgetState extends BudgetCheck {
  readonly dailyLimit: number;
  readonly monthlyLimit: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Override the daily/monthly limits. Useful when the user changes settings
 * or for tests that need a deterministic small budget.
 *
 * Negative or zero values are clamped to 1 to prevent total lock-out by typo.
 */
export function configureBudget(next: Partial<BudgetLimits>): void {
  limits = {
    dailyLimit: Math.max(1, next.dailyLimit ?? limits.dailyLimit),
    monthlyLimit: Math.max(1, next.monthlyLimit ?? limits.monthlyLimit),
  };
}

/**
 * Probe the budget without consuming any quota. Returns whether the next
 * Vision call would be permitted under the current counters.
 */
export function checkBudget(now: Date = new Date()): BudgetCheck {
  rolloverIfNeeded(now);
  if (dailyWindow.count >= limits.dailyLimit) {
    return {
      allowed: false,
      reason: `일일 한도 도달 (${dailyWindow.count}/${limits.dailyLimit}). 내일 자정에 자동 해제됩니다.`,
      dailyUsed: dailyWindow.count,
      monthlyUsed: monthlyWindow.count,
    };
  }
  if (monthlyWindow.count >= limits.monthlyLimit) {
    return {
      allowed: false,
      reason: `이번 달 한도 도달 (${monthlyWindow.count}/${limits.monthlyLimit}). 다음 달 1일에 자동 해제됩니다.`,
      dailyUsed: dailyWindow.count,
      monthlyUsed: monthlyWindow.count,
    };
  }
  return {
    allowed: true,
    dailyUsed: dailyWindow.count,
    monthlyUsed: monthlyWindow.count,
  };
}

/**
 * Record a Vision API call against the daily and monthly counters. Callers
 * SHOULD only invoke this after checkBudget() returns allowed=true.
 */
export function recordVisionCall(now: Date = new Date()): void {
  rolloverIfNeeded(now);
  dailyWindow.count += 1;
  monthlyWindow.count += 1;
}

/**
 * Snapshot of counters and limits, suitable for rendering in a status
 * indicator or a settings dialog.
 */
export function getBudgetState(now: Date = new Date()): BudgetState {
  const check = checkBudget(now);
  return {
    ...check,
    dailyLimit: limits.dailyLimit,
    monthlyLimit: limits.monthlyLimit,
  };
}

/**
 * Reset all counters. Test-only — not exposed via the production UI.
 */
export function resetBudgetCounters(): void {
  dailyWindow = { count: 0, windowKey: '' };
  monthlyWindow = { count: 0, windowKey: '' };
}
