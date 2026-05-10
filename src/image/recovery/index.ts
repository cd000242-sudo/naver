/**
 * SPEC-IMAGE-RECOVERY-001: public re-export.
 */

export type {
  HeadingContext,
  RecoveryEngine,
  RecoveryAttempts,
  RecoveryDecision,
  RecoveryActionTag,
  BlockingModalCode,
  ModalOption,
  ModalOptions,
  UserChoice,
  ToastNotifier,
  ModalNotifier,
  CheckpointFlusher,
  RecoveryMetricsSnapshot,
} from './types';

export { classifyError, RECOVERY_CONSTANTS } from './classifier';
export { getRecoveryMetrics } from './metrics';
export {
  RecoveryCoordinator,
  getRecoveryCoordinator,
  resetRecoveryCoordinatorForTest,
} from './coordinator';
