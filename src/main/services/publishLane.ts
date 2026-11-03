/**
 * One publish lane, two kinds of riders: the daily auto-publisher and publishing the owner starts by hand.
 *
 * The lane itself stays single (two browsers on one Naver account is a protection risk, and the publish engine
 * keeps global state that assumes one job). What this module changes is the failure mode: a manual job that
 * arrives while the daily publisher owns the lane (or has a post due right now) used to be rejected, and a daily
 * post that lost the race was skipped. Now the manual job waits its turn and starts as soon as the lane is free.
 *
 * Pure logic only (no Electron, no main.ts state) so it can be unit tested; main.ts injects the snapshot reader.
 */

export const DAILY_LEASE_PREFIX = 'daily:';
/** A manual job gives up waiting for the daily publisher after this long. */
export const LANE_WAIT_LIMIT_MS = 45 * 60_000;
export const LANE_POLL_MS = 1_000;
/** With the lane free and a daily post due, the manual job waits this long for the daily publisher to take it. */
export const DAILY_DUE_GRACE_MS = 45_000;

export const DAILY_YIELD_NOTICE = '⏳ 매일 자동발행 글을 먼저 올리는 중입니다 — 끝나면 바로 이어서 발행합니다';
export const LANE_TIMEOUT_MESSAGE = '매일 자동발행이 45분 넘게 이어져 기다리던 발행을 시작하지 못했습니다. 매일 자동발행이 끝난 뒤 다시 시도해 주세요.';
export const LANE_CANCELLED_MESSAGE = '매일 자동발행을 기다리던 발행을 취소했습니다. (매일 자동발행은 계속 진행됩니다)';

export function dailyLeaseOwner(jobId: string): string {
  return `${DAILY_LEASE_PREFIX}${jobId}`;
}

export function isDailyLeaseOwner(owner: string | null | undefined): boolean {
  return typeof owner === 'string' && owner.startsWith(DAILY_LEASE_PREFIX);
}

export interface LaneSnapshot {
  /** Owner label of the direct-automation lease, or null when nobody holds it. */
  leaseOwner: string | null;
  /** Any other run state: automation:run lock, AutomationService running, legacy flags. */
  busy: boolean;
  /** A daily job is between claim and finish (also covers source discovery, which holds no lease yet). */
  dailyExecuting: boolean;
  /** A daily post is pending right now and the daily publisher would start it on its next tick. */
  dailyDue: boolean;
}

export interface PublishLaneDeps {
  snapshot(): LaneSnapshot;
  now?(): number;
  sleep?(ms: number): Promise<void>;
  limitMs?: number;
  pollMs?: number;
  graceMs?: number;
}

export type LaneTurn =
  | { ok: true; waitedMs: number; release(): void }
  | { ok: false; code: 'cancelled' | 'timeout'; message: string };

export interface LaneView {
  dailyRunning: boolean;
  /** Something that is not the daily publisher holds the lane (a manual job or another scheduler). */
  otherBusy: boolean;
  dailyDue: boolean;
}

interface Waiter { cancelled: boolean; wake(): void }

export function createPublishLane(deps: PublishLaneDeps) {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const limitMs = deps.limitMs ?? LANE_WAIT_LIMIT_MS;
  const pollMs = deps.pollMs ?? LANE_POLL_MS;
  const graceMs = deps.graceMs ?? DAILY_DUE_GRACE_MS;
  const waiters = new Set<Waiter>();
  let userClaims = 0;

  const view = (): LaneView => {
    const snap = deps.snapshot();
    const dailyRunning = snap.dailyExecuting || isDailyLeaseOwner(snap.leaseOwner);
    return { dailyRunning, otherBusy: !dailyRunning && (snap.busy || userClaims > 0), dailyDue: snap.dailyDue };
  };

  const claim = (waitedMs: number): LaneTurn => {
    userClaims += 1;
    let released = false;
    return { ok: true, waitedMs, release: () => { if (!released) { released = true; userClaims = Math.max(0, userClaims - 1); } } };
  };

  /**
   * Waits until a manual job may start, then registers it as a claim so the daily publisher does not slip in
   * between "lane is free" and "the job has really started". The caller must release() when its job ends.
   * A lane held by another manual job is not waited for: the caller's own checks reject that as before.
   */
  async function enterAsUser(options: { label?: string; notify?: (message: string) => void } = {}): Promise<LaneTurn> {
    const first = view();
    if (!(first.dailyRunning || (!first.otherBusy && first.dailyDue))) return claim(0);

    const startedAt = now();
    let wake!: () => void;
    const woken = new Promise<void>(resolve => { wake = resolve; });
    const waiter: Waiter = { cancelled: false, wake };
    waiters.add(waiter);
    options.notify?.(DAILY_YIELD_NOTICE);
    let dueSince: number | null = null;
    try {
      for (;;) {
        if (waiter.cancelled) return { ok: false, code: 'cancelled', message: LANE_CANCELLED_MESSAGE };
        const waited = now() - startedAt;
        if (waited >= limitMs) return { ok: false, code: 'timeout', message: LANE_TIMEOUT_MESSAGE };
        const current = view();
        if (current.dailyRunning) dueSince = null;
        else if (current.otherBusy) return claim(waited);
        else if (current.dailyDue) {
          dueSince ??= now();
          if (now() - dueSince >= graceMs) return claim(waited);
        } else return claim(waited);
        await Promise.race([sleep(pollMs), woken]);
      }
    } finally {
      waiters.delete(waiter);
    }
  }

  /**
   * The owner pressed [중지]. While the daily publisher owns the lane that press must only end the owner's own
   * waiting job: stopping the daily post belongs to the daily screen. Returns whether the global cancel must be skipped.
   */
  function cancelForUser(): { isolated: boolean; cancelledWaiters: number } {
    let cancelledWaiters = 0;
    for (const waiter of waiters) {
      if (!waiter.cancelled) { waiter.cancelled = true; cancelledWaiters += 1; }
      waiter.wake();
    }
    return { isolated: view().dailyRunning, cancelledWaiters };
  }

  return {
    enterAsUser,
    cancelForUser,
    /** True while a manual job holds a claim; the daily publisher treats that as busy. */
    isUserClaimed: () => userClaims > 0,
    waitingCount: () => waiters.size,
    view,
  };
}

export type PublishLane = ReturnType<typeof createPublishLane>;
