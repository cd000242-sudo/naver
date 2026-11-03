import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_DUE_GRACE_MS, DAILY_YIELD_NOTICE, LANE_WAIT_LIMIT_MS, createPublishLane, dailyLeaseOwner, isDailyLeaseOwner,
  type LaneSnapshot,
} from '../main/services/publishLane.js';

/** Fake clock: every sleep advances time, and a hook can change the lane while "time passes". */
function harness(initial: Partial<LaneSnapshot> = {}, onTime?: (t: number, snap: LaneSnapshot) => void) {
  let t = 0;
  const snap: LaneSnapshot = { leaseOwner: null, busy: false, dailyExecuting: false, dailyDue: false, ...initial };
  const blocking = { on: false };
  const lane = createPublishLane({
    snapshot: () => snap,
    now: () => t,
    sleep: ms => { if (blocking.on) return new Promise<void>(() => undefined); t += ms; onTime?.(t, snap); return Promise.resolve(); },
  });
  return { lane, snap, blocking, time: () => t };
}

describe('publishLane — manual jobs queue behind the daily publisher', () => {
  it('names the daily lease so the lane can tell whose turn it is', () => {
    expect(dailyLeaseOwner('acct:2026-11-03:0700:1')).toBe('daily:acct:2026-11-03:0700:1');
    expect(isDailyLeaseOwner('daily:x')).toBe(true);
    expect(isDailyLeaseOwner('multi-account:123')).toBe(false);
    expect(isDailyLeaseOwner(null)).toBe(false);
  });

  it('starts at once on a free lane and holds a claim until released', async () => {
    const { lane } = harness();
    const notify = vi.fn();
    const turn = await lane.enterAsUser({ notify });
    expect(turn.ok).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(lane.isUserClaimed()).toBe(true);
    if (turn.ok) { turn.release(); turn.release(); }
    expect(lane.isUserClaimed()).toBe(false);
  });

  it('waits while the daily publisher owns the lane, then starts right after it ends', async () => {
    const { lane, time } = harness({ leaseOwner: 'daily:job-1', busy: true, dailyExecuting: true }, (t, snap) => {
      if (t >= 8_000) { snap.leaseOwner = null; snap.busy = false; snap.dailyExecuting = false; }
    });
    const notify = vi.fn();
    const turn = await lane.enterAsUser({ notify });
    expect(turn.ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(DAILY_YIELD_NOTICE);
    expect(time()).toBeGreaterThanOrEqual(8_000);
    expect(turn.ok && turn.waitedMs).toBeGreaterThanOrEqual(8_000);
  });

  it('also waits while a daily post is still discovering sources (no lease yet)', async () => {
    const { lane } = harness({ dailyExecuting: true }, (t, snap) => { if (t >= 3_000) snap.dailyExecuting = false; });
    const turn = await lane.enterAsUser();
    expect(turn.ok && turn.waitedMs).toBeGreaterThanOrEqual(3_000);
  });

  it('yields to a daily post that is due now, and goes after it finishes', async () => {
    const { lane } = harness({ dailyDue: true }, (t, snap) => {
      if (t === 3_000) { snap.leaseOwner = 'daily:job-2'; snap.busy = true; snap.dailyExecuting = true; snap.dailyDue = false; }
      if (t >= 20_000) { snap.leaseOwner = null; snap.busy = false; snap.dailyExecuting = false; }
    });
    const turn = await lane.enterAsUser();
    expect(turn.ok && turn.waitedMs).toBeGreaterThanOrEqual(20_000);
  });

  it('does not wait forever for a due daily post that never takes the lane (grace period)', async () => {
    const { lane, time } = harness({ dailyDue: true });
    const turn = await lane.enterAsUser();
    expect(turn.ok).toBe(true);
    expect(time()).toBeGreaterThanOrEqual(DAILY_DUE_GRACE_MS);
    expect(time()).toBeLessThan(DAILY_DUE_GRACE_MS + 5_000);
  });

  it('gives up with a clear message after 45 minutes', async () => {
    const { lane } = harness({ leaseOwner: 'daily:long', busy: true, dailyExecuting: true });
    const turn = await lane.enterAsUser();
    expect(turn.ok).toBe(false);
    if (!turn.ok) {
      expect(turn.code).toBe('timeout');
      expect(turn.message).toContain('45분');
    }
    expect(LANE_WAIT_LIMIT_MS).toBe(45 * 60_000);
    expect(lane.isUserClaimed()).toBe(false);
    expect(lane.waitingCount()).toBe(0);
  });

  it('the owner\'s [중지] cancels only the waiting job and leaves the daily run alone', async () => {
    const { lane, blocking } = harness({ leaseOwner: 'daily:job-3', busy: true, dailyExecuting: true });
    blocking.on = true; // sleeps never finish by themselves: only the cancel can wake the waiter
    const pending = lane.enterAsUser();
    await Promise.resolve();
    expect(lane.waitingCount()).toBe(1);
    const cancel = lane.cancelForUser();
    expect(cancel).toEqual({ isolated: true, cancelledWaiters: 1 });
    const turn = await pending;
    expect(turn.ok).toBe(false);
    if (!turn.ok) expect(turn.code).toBe('cancelled');
    expect(lane.isUserClaimed()).toBe(false);
  });

  it('a real manual double run is not queued: another manual job holding the lane is left to the existing checks', async () => {
    const { lane, time } = harness({ busy: true, dailyDue: true });
    const turn = await lane.enterAsUser();
    expect(turn.ok).toBe(true); // proceeds at once; the caller's own "already running" check rejects it as before
    expect(time()).toBe(0);
  });

  it('the owner\'s [중지] on the owner\'s own running job is a normal, non-isolated cancel', async () => {
    const { lane } = harness({ busy: true });
    expect(lane.cancelForUser()).toEqual({ isolated: false, cancelledWaiters: 0 });
  });

  it('a manual claim makes the lane look busy to the daily publisher until released', async () => {
    const { lane } = harness();
    const turn = await lane.enterAsUser();
    expect(lane.isUserClaimed()).toBe(true);
    expect(lane.view().otherBusy).toBe(true);
    if (turn.ok) turn.release();
    expect(lane.view().otherBusy).toBe(false);
  });
});

describe('screen publish limit covers the lane wait', () => {
  it('fullAutoFlow adds the same 45-minute allowance as LANE_WAIT_LIMIT_MS to both publish calls', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const flow = readFileSync(join(__dirname, '..', 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf8');
    const allowance = flow.match(/const PUBLISH_LANE_WAIT_ALLOWANCE_MS = (\d+) \* 60_000;/);
    expect(Number(allowance?.[1]) * 60_000).toBe(LANE_WAIT_LIMIT_MS);
    expect(flow.match(/timeout: PUBLISH_AUTOMATION_TIMEOUT_MS \+ PUBLISH_LANE_WAIT_ALLOWANCE_MS/g)?.length).toBe(2);
  });
});
