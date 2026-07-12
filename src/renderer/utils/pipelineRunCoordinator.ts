export type PipelineRunOwner = 'legacy' | 'unified' | 'multi-account';

export interface PipelineRunLease {
  readonly id: string;
  readonly owner: PipelineRunOwner;
  readonly startedAt: number;
}

let activeRun: PipelineRunLease | null = null;
let nextRunSequence = 0;

function snapshot(lease: PipelineRunLease): PipelineRunLease {
  return Object.freeze({ ...lease });
}

export function tryAcquirePipelineRun(owner: PipelineRunOwner): PipelineRunLease | null {
  if (activeRun) return null;

  const lease = Object.freeze({
    id: `${owner}:${Date.now()}:${++nextRunSequence}`,
    owner,
    startedAt: Date.now(),
  });
  activeRun = lease;
  return snapshot(lease);
}

export function releasePipelineRun(lease: PipelineRunLease | null | undefined): boolean {
  if (!lease || !activeRun || lease.id !== activeRun.id) return false;
  activeRun = null;
  return true;
}

export function getActivePipelineRun(): PipelineRunLease | null {
  return activeRun ? snapshot(activeRun) : null;
}

export function resetPipelineRunCoordinator(): void {
  activeRun = null;
}
