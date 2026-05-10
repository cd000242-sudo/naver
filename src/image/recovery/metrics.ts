/**
 * SPEC-IMAGE-RECOVERY-001: in-memory recovery metrics counter.
 *
 * Snapshots are exposed to operationsDashboard for the "복구" panel.
 * No speculation — every value is observed (feedback_no_speculation).
 */

import type {
  BlockingModalCode,
  RecoveryActionTag,
  RecoveryMetricsSnapshot,
  UserChoice,
} from './types';

interface RecoveryEvent {
  readonly tag: RecoveryActionTag;
  readonly elapsedMs: number;
  readonly success: boolean;
  readonly timestampMs: number;
}

class RecoveryMetricsStore {
  private readonly events: RecoveryEvent[] = [];
  private readonly modalCounts: Record<BlockingModalCode, number> = {
    B1: 0, B2: 0, B3: 0, B4: 0, B5: 0, B6: 0, B7: 0,
  };
  private readonly userChoiceCounts: Record<string, number> = {};
  // C8: heading-level outcome counters (SLO denominator)
  private headingsAttempted = 0;
  private headingsSucceeded = 0;
  private headingsSkipped = 0;
  private batchesAborted = 0;

  recordRecoveryAttempt(tag: RecoveryActionTag, elapsedMs: number, success: boolean): void {
    this.events.push({ tag, elapsedMs, success, timestampMs: Date.now() });
    if (this.events.length > 1000) {
      this.events.splice(0, this.events.length - 1000);
    }
  }

  recordModalShown(code: BlockingModalCode): void {
    this.modalCounts[code] += 1;
  }

  recordUserChoice(choice: UserChoice): void {
    const key = choice.chosenId;
    this.userChoiceCounts[key] = (this.userChoiceCounts[key] ?? 0) + 1;
  }

  // C8: heading-level outcome tracking
  recordHeadingAttempted(): void { this.headingsAttempted += 1; }
  recordHeadingSucceeded(): void { this.headingsSucceeded += 1; }
  recordHeadingSkipped(): void { this.headingsSkipped += 1; }
  recordBatchAborted(): void { this.batchesAborted += 1; }

  snapshot(): RecoveryMetricsSnapshot {
    const tagCount: Record<RecoveryActionTag, number> = {
      R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0, R8: 0,
    };
    let totalMs = 0;
    let successCount = 0;
    for (const event of this.events) {
      tagCount[event.tag] += 1;
      if (event.success) {
        totalMs += event.elapsedMs;
        successCount += 1;
      }
    }
    const avgRecoveryMs = successCount > 0 ? totalMs / successCount : 0;

    return {
      r1Count: tagCount.R1,
      r2Count: tagCount.R2,
      r3Count: tagCount.R3,
      r4Count: tagCount.R4,
      r5Count: tagCount.R5,
      r6Count: tagCount.R6,
      r7Count: tagCount.R7,
      r8Count: tagCount.R8,
      modalShownCount: { ...this.modalCounts },
      userChoiceDistribution: { ...this.userChoiceCounts },
      avgRecoveryMs,
      headingsAttempted: this.headingsAttempted,
      headingsSucceeded: this.headingsSucceeded,
      headingsSkipped: this.headingsSkipped,
      batchesAborted: this.batchesAborted,
    };
  }

  reset(): void {
    this.events.length = 0;
    for (const code of Object.keys(this.modalCounts) as BlockingModalCode[]) {
      this.modalCounts[code] = 0;
    }
    for (const key of Object.keys(this.userChoiceCounts)) {
      delete this.userChoiceCounts[key];
    }
    this.headingsAttempted = 0;
    this.headingsSucceeded = 0;
    this.headingsSkipped = 0;
    this.batchesAborted = 0;
  }
}

let _instance: RecoveryMetricsStore | null = null;

export function getRecoveryMetrics(): RecoveryMetricsStore {
  if (!_instance) {
    _instance = new RecoveryMetricsStore();
  }
  return _instance;
}

export type { RecoveryMetricsStore };
