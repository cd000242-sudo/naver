/**
 * SPEC-IMAGE-RECOVERY-001: recovery coordinator.
 *
 * Owns per-heading recovery state and routes decisions to:
 *   - retry (silent within engine — toast user with "🔄 ...")
 *   - block (explicit modal — user must choose)
 *   - skip-heading / abort-batch (no UI prompt)
 *
 * Engine/model fallback is forbidden; this coordinator never switches engines.
 */

import { classifyError } from './classifier';
import { getRecoveryMetrics } from './metrics';
import type {
  BlockingModalCode,
  CheckpointFlusher,
  HeadingContext,
  ModalNotifier,
  ModalOptions,
  RecoveryAttempts,
  RecoveryDecision,
  ToastNotifier,
  UserChoice,
} from './types';

interface CoordinatorDeps {
  readonly toastNotifier?: ToastNotifier;
  readonly modalNotifier?: ModalNotifier;
  readonly checkpointFlusher?: CheckpointFlusher;
  readonly logger?: (tag: string, payload: unknown) => void;
}

interface ClassifyArgs {
  readonly errorMessage: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
}

const FRESH_ATTEMPTS = (): RecoveryAttempts => ({
  r1Tried: false,
  r2Count: 0,
  r3SessionDisabled: false,
  r4SelectorFailed: new Set<string>(),
  r5LoginExtended: 0,
  r6SmallImageRetried: false,
  r7AHashFailed: false,
  r8ColdStartFailures: 0,
  c4Server503Count: 0,
});

export class RecoveryCoordinator {
  private currentAttempts: RecoveryAttempts = FRESH_ATTEMPTS();
  private currentContext: HeadingContext | null = null;
  private recoveryStartedAt: number | null = null;

  constructor(private readonly deps: CoordinatorDeps = {}) {}

  /** Mark a fresh heading start. Resets per-heading counters per spec I-3. */
  startHeading(ctx: HeadingContext): void {
    this.currentAttempts = FRESH_ATTEMPTS();
    this.currentContext = ctx;
    this.recoveryStartedAt = null;
    getRecoveryMetrics().recordHeadingAttempted(); // C8
    this.log('RECOVERY:HEADING_START', {
      headingIndex: ctx.headingIndex,
      engine: ctx.engine,
      // V4: heading 콘텐츠 본문 로깅 제거 (보안 권고)
    });
  }

  /** C8: heading completed successfully (called by generator after image saved). */
  markHeadingSucceeded(): void {
    getRecoveryMetrics().recordHeadingSucceeded();
  }

  /** C8: heading skipped (R2 exhausted or unrecoverable). */
  markHeadingSkipped(): void {
    getRecoveryMetrics().recordHeadingSkipped();
  }

  /** C8: batch aborted entirely. */
  markBatchAborted(): void {
    getRecoveryMetrics().recordBatchAborted();
  }

  /** Decide what to do next given an error. Pure call — no toast/modal yet. */
  decide(args: ClassifyArgs): RecoveryDecision {
    const ctx = this.requireContext();
    const decision = classifyError({
      errorMessage: args.errorMessage,
      errorCode: args.errorCode,
      httpStatus: args.httpStatus,
      attempts: this.currentAttempts,
      context: ctx,
    });
    this.log('RECOVERY:DECIDE', {
      decision,
      errorCode: args.errorCode,
      httpStatus: args.httpStatus,
    });
    return decision;
  }

  /** Apply a retry decision: bump counters, fire toast, return backoff. */
  applyRetry(decision: Extract<RecoveryDecision, { action: 'retry' }>): number {
    if (this.recoveryStartedAt === null) {
      this.recoveryStartedAt = Date.now();
    }
    switch (decision.tag) {
      case 'R1': this.currentAttempts.r1Tried = true; break;
      case 'R2': this.currentAttempts.r2Count += 1; break;
      case 'R5': this.currentAttempts.r5LoginExtended += 1; break;
      case 'R6': this.currentAttempts.r6SmallImageRetried = true; break;
      case 'R7': this.currentAttempts.r7AHashFailed = true; break;
      case 'R8': this.currentAttempts.r8ColdStartFailures += 1; break;
      case 'R3': this.currentAttempts.r3SessionDisabled = true; break;
      case 'R4': /* selector tracking happens at call site */ break;
    }
    this.notifyToast(`🔄 [${decision.tag}] ${decision.reason}`);
    return decision.backoffMs;
  }

  /** C4: 503 누적 카운터 — classifier가 storm 임계 비교용으로 참조. */
  recordServer503(): void {
    this.currentAttempts.c4Server503Count += 1;
  }

  /** Mark a recovery attempt as successful. Stamps metrics. */
  recordRecoverySuccess(tag: RecoveryDecision extends { action: 'retry'; tag: infer T } ? T : never): void {
    const elapsed = this.recoveryStartedAt !== null ? Date.now() - this.recoveryStartedAt : 0;
    getRecoveryMetrics().recordRecoveryAttempt(tag, elapsed, true);
    this.log('RECOVERY:OK', { tag, elapsedMs: elapsed });
    this.recoveryStartedAt = null;
  }

  /** Show a blocking modal and wait for user choice. */
  async showBlockingModal(code: BlockingModalCode, options: ModalOptions): Promise<UserChoice> {
    getRecoveryMetrics().recordModalShown(code);
    await this.deps.checkpointFlusher?.flush(`modal:${code}`);
    this.log('RECOVERY:HALT', {
      code,
      errorCode: options.errorCode,
      heading: this.currentContext?.heading,
    });

    if (!this.deps.modalNotifier) {
      // Headless / test environment fallback — auto-cancel without proceeding.
      const fallback: UserChoice = {
        chosenId: 'cancel',
        choiceLabel: 'cancel-no-modal-host',
        timestampMs: Date.now(),
      };
      getRecoveryMetrics().recordUserChoice(fallback);
      return fallback;
    }

    const choice = await this.deps.modalNotifier.show(code, options);
    getRecoveryMetrics().recordUserChoice(choice);
    this.log('RECOVERY:USER_CHOICE', { code, choice });
    return choice;
  }

  /** Selector tracking for R4 (multi-fallback). */
  recordSelectorFailure(selectorId: string): void {
    this.currentAttempts.r4SelectorFailed.add(selectorId);
  }

  hasSelectorAlreadyFailed(selectorId: string): boolean {
    return this.currentAttempts.r4SelectorFailed.has(selectorId);
  }

  /**
   * Mark current heading as being retried (i-- pattern in caller).
   * The next call to startHeading() with the same headingIndex will be skipped
   * to preserve recovery counters.
   */
  private retryingHeadingIndex: number | null = null;

  markRetryingHeading(headingIndex: number): void {
    this.retryingHeadingIndex = headingIndex;
  }

  isRetryingSameHeading(headingIndex: number): boolean {
    if (this.retryingHeadingIndex === headingIndex) {
      this.retryingHeadingIndex = null; // consume the marker
      return true;
    }
    return false;
  }

  /** Read-only attempt snapshot (for tests + diagnostics). */
  getAttempts(): Readonly<RecoveryAttempts> {
    return {
      ...this.currentAttempts,
      r4SelectorFailed: new Set(this.currentAttempts.r4SelectorFailed),
    };
  }

  private requireContext(): HeadingContext {
    if (!this.currentContext) {
      throw new Error('RecoveryCoordinator: startHeading() must be called before decide()');
    }
    return this.currentContext;
  }

  private notifyToast(message: string): void {
    this.deps.toastNotifier?.notify(message);
    this.log('RECOVERY:TOAST', { message });
  }

  private log(tag: string, payload: unknown): void {
    if (this.deps.logger) {
      this.deps.logger(tag, payload);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[${tag}]`, JSON.stringify(payload));
  }
}

let _singleton: RecoveryCoordinator | null = null;

export function getRecoveryCoordinator(deps?: CoordinatorDeps): RecoveryCoordinator {
  if (!_singleton) {
    _singleton = new RecoveryCoordinator(deps);
  }
  return _singleton;
}

export function resetRecoveryCoordinatorForTest(): void {
  _singleton = null;
}
