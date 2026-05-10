/**
 * SPEC-IMAGE-RECOVERY-001: type definitions for the auto-recovery layer.
 *
 * Recovery is split into two paths:
 *   - "retry": same engine, same model, automatic recovery (R1~R8)
 *   - "block": user-explicit blocking modal (B1~B7)
 *
 * Engine/model fallback is forbidden — see feedback_no_fallback.md.
 */

export type RecoveryEngine = 'imageFx' | 'flow';

export interface HeadingContext {
  readonly headingIndex: number;
  readonly totalHeadings: number;
  readonly heading: string;
  readonly postTitle: string;
  readonly engine: RecoveryEngine;
}

export interface RecoveryAttempts {
  r1Tried: boolean;
  r2Count: number;
  r3SessionDisabled: boolean;
  r4SelectorFailed: Set<string>;
  r5LoginExtended: number;
  r6SmallImageRetried: boolean;
  r7AHashFailed: boolean;
  r8ColdStartFailures: number;
  // C4: 503 storm 누적 카운터 (Phase 6)
  c4Server503Count: number;
}

export type BlockingModalCode = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7';

export type RecoveryActionTag = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

export type RecoveryDecision =
  | { readonly action: 'retry'; readonly tag: RecoveryActionTag; readonly reason: string; readonly backoffMs: number }
  | { readonly action: 'block'; readonly modalCode: BlockingModalCode; readonly reason: string; readonly errorCode?: string }
  | { readonly action: 'skip-heading'; readonly reason: string }
  | { readonly action: 'abort-batch'; readonly reason: string };

export interface ModalOption {
  readonly id: string;
  readonly label: string;
  readonly variant?: 'primary' | 'secondary' | 'destructive';
}

export interface ModalOptions {
  readonly title: string;
  readonly message: string;
  readonly errorCode?: string;
  readonly choices: readonly ModalOption[];
  readonly resourceLinks?: readonly { readonly label: string; readonly url: string }[];
}

export interface UserChoice {
  readonly chosenId: string;
  readonly choiceLabel: string;
  readonly timestampMs: number;
}

export interface ToastNotifier {
  notify(message: string): void;
}

export interface ModalNotifier {
  show(code: BlockingModalCode, options: ModalOptions): Promise<UserChoice>;
}

export interface CheckpointFlusher {
  flush(reason: string): Promise<void>;
}

export interface RecoveryMetricsSnapshot {
  readonly r1Count: number;
  readonly r2Count: number;
  readonly r3Count: number;
  readonly r4Count: number;
  readonly r5Count: number;
  readonly r6Count: number;
  readonly r7Count: number;
  readonly r8Count: number;
  readonly modalShownCount: Record<BlockingModalCode, number>;
  readonly userChoiceDistribution: Record<string, number>;
  readonly avgRecoveryMs: number;
  // C8 (SPEC-IMAGE-RECOVERY-001 Phase 6): SLO 분모를 위한 결과 카운터
  readonly headingsAttempted: number;
  readonly headingsSucceeded: number;
  readonly headingsSkipped: number;
  readonly batchesAborted: number;
}
