/**
 * stageClassifier.ts — SPEC-MOAT-2026 Phase 0.1
 *
 * Classifies a user into one of four operating stages from observable inputs
 * (account count, weekly publish cadence, category diversity, client separation).
 *
 * The classification feeds three downstream features:
 *   1. Activation Trigger (Q3) — modal nudging when a user crosses a boundary
 *   2. Tier matching (Q2/Q3) — recommend Starter / Pro / Operator / Agency
 *   3. SLA scope (Q4) — different guarantees per stage
 *
 * Pure function — no IO, no electron, no fs. Safe to call from renderer or main.
 * Same input always yields same output (deterministic).
 *
 * Rules (Q3 §4.3):
 *   - novice  : 1 account AND weekly publishes < 5
 *   - fulltime: 1-2 accounts AND weekly publishes >= 5
 *   - operator: >= 3 accounts (no client separation requirement)
 *   - agency  : >= 5 accounts AND client separation is in use
 *
 * `agency` is gated on client separation because that capability does not yet
 * exist in the codebase (Q2 P1.2 backlog). Until then, a 5-account user without
 * client separation stays `operator` — accurate to current product state.
 */

/** Four stages of operation, ordered low → high revenue/LTV. */
export type UserStage = 'novice' | 'fulltime' | 'operator' | 'agency';

/**
 * Inputs observable from the local account / publishing data.
 *
 * - accountCount: distinct Naver accounts registered
 * - weeklyPublishCount: rolling 7-day publish total across all accounts
 * - categoryCount: distinct content categories in recent posts
 * - hasClientSeparation: true if the user maps accounts to external clients
 *                       (Agency tier capability — currently always false)
 */
export interface StageInput {
  readonly accountCount: number;
  readonly weeklyPublishCount: number;
  readonly categoryCount: number;
  readonly hasClientSeparation: boolean;
}

/**
 * Tunable thresholds. Exported so downstream UI (e.g., "next stage at X posts")
 * can show consistent numbers without duplicating constants.
 */
export const STAGE_THRESHOLDS = {
  /** weekly publish count at which novice graduates to fulltime */
  weeklyPublishForFulltime: 5,
  /** account count at which a user enters operator stage */
  operatorMinAccounts: 3,
  /** account count required for agency stage (combined with client separation) */
  agencyMinAccounts: 5,
} as const;

/**
 * Deterministic stage classification.
 *
 * Order matters: check highest tier first so a 5-account agency user does not
 * fall through to operator.
 */
export function classifyUserStage(input: StageInput): UserStage {
  const { accountCount, weeklyPublishCount, hasClientSeparation } = input;

  // Agency: needs both 5+ accounts AND client separation in active use
  if (accountCount >= STAGE_THRESHOLDS.agencyMinAccounts && hasClientSeparation) {
    return 'agency';
  }

  // Operator: 3+ accounts (regardless of client separation, since 5+accounts
  //           without separation is still a multi-account operator)
  if (accountCount >= STAGE_THRESHOLDS.operatorMinAccounts) {
    return 'operator';
  }

  // Fulltime: 1-2 accounts with sustained weekly cadence
  if (accountCount >= 1 && weeklyPublishCount >= STAGE_THRESHOLDS.weeklyPublishForFulltime) {
    return 'fulltime';
  }

  // Novice: default — under cadence threshold, or zero accounts
  return 'novice';
}
