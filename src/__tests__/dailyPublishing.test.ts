import { describe, expect, it, vi } from 'vitest';
import { DailyPublishingScheduler } from '../scheduler/dailyPublishing.js';
import type { DailyPublishingState } from '../scheduler/dailyPublishingTypes.js';

const plan = (overrides = {}) => ({
  accountId: 'account-1', categoryId: '1', enabled: true, mode: 'publish',
  slots: [{ time: '07:00', count: 2 }], generator: 'app-settings', topic: '', ...overrides,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(saved: DailyPublishingState | null = null) {
  let stored = saved;
  let time = new Date('2026-10-19T22:00:00Z');
  const saves: DailyPublishingState[] = [];
  const execute = vi.fn(async () => ({ confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' }));
  const checkAvailable = vi.fn(async () => ({ available: true }));
  const save = vi.fn(async (state: DailyPublishingState) => { stored = clone(state); saves.push(clone(state)); });
  const scheduler = new DailyPublishingScheduler({ load: async () => stored, save, execute, checkAvailable, now: () => time });
  return { scheduler, execute, checkAvailable, save, saves, stored: () => stored, setTime: (value: string) => { time = new Date(value); } };
}
async function ready(overrides = {}) {
  const f = fixture();
  await f.scheduler.initialize();
  await f.scheduler.replacePlans([plan(overrides)], f.scheduler.getState().revision);
  return f;
}

describe('daily publishing scheduler', () => {
  it('persists the whole due batch and claims each job before executing', async () => {
    const f = await ready();
    f.execute.mockImplementation(async () => {
      const state = f.stored()!;
      expect(state.runs).toHaveLength(2);
      expect(state.runs.filter((run) => run.status === 'inflight')).toHaveLength(1);
      return { confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' };
    });
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.checkAvailable).toHaveBeenCalledTimes(2);
    expect(f.scheduler.getState().runs.map((run) => run.status)).toEqual(['confirmed', 'confirmed']);
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
  it('catches up a slot missed the same day exactly once, but never one from before the plan was saved', async () => {
    const f = await ready();
    f.setTime('2026-10-20T06:30:00Z');
    await f.scheduler.tick();
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.scheduler.getState().runs.map((run) => run.date)).toEqual(['2026-10-20', '2026-10-20']);
    const late = await ready();
    late.setTime('2026-10-19T21:00:00Z');
    await late.scheduler.replacePlans([plan({ slots: [{ time: '05:00', count: 1 }, { time: '07:00', count: 1 }] })], late.scheduler.getState().revision);
    late.setTime('2026-10-19T23:00:00Z');
    await late.scheduler.tick();
    expect(late.scheduler.getState().runs.map((run) => run.time)).toEqual(['07:00']);
    const g = await ready({ enabled: false });
    await g.scheduler.tick();
    expect(g.execute).not.toHaveBeenCalled();
  });
  it('rejects stale updates and returns defensive state copies', async () => {
    const f = await ready();
    await expect(f.scheduler.replacePlans([], 0)).rejects.toThrow('DAILY_REVISION_CONFLICT');
    const state = f.scheduler.getState();
    state.plans[0].enabled = false;
    expect(f.scheduler.getState().plans[0].enabled).toBe(true);
    await expect(f.scheduler.stop('account-1', -1)).rejects.toThrow('DAILY_REVISION_CONFLICT');
  });
  it.each([
    { confirmed: false }, { confirmed: true },
    { confirmed: true, publishedUrl: 'https://blog.naver.com/owner' },
    { confirmed: true, publishedUrl: 'https://evil.example/owner/12345' },
  ])('holds an uncertain post for review without a retry and keeps the plan running: %j', async (result) => {
    const f = await ready();
    f.execute.mockResolvedValueOnce(result as never);
    await f.scheduler.tick();
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.scheduler.getState().plans[0].enabled).toBe(true);
    expect(f.scheduler.getState().runs.map((run) => run.status)).toEqual(['needs_review', 'confirmed']);
  });
  it('stops the account plan when a person must clear the block', async () => {
    const f = await ready();
    await f.scheduler.replacePlans([plan(), plan({ accountId: 'account-2' })], f.scheduler.getState().revision);
    f.execute.mockResolvedValueOnce({ confirmed: false, stopAccount: true } as never);
    await f.scheduler.tick();
    expect(f.scheduler.getState().plans.map((p) => p.enabled)).toEqual([false, true]);
    expect(f.scheduler.getState().runs.map((r) => r.status)).toEqual(['needs_review', 'cancelled', 'confirmed', 'confirmed']);
  });
  it('stops the plan after three failed posts in a row and counts only an unbroken streak', async () => {
    const f = await ready({ slots: [{ time: '07:00', count: 2 }, { time: '08:00', count: 3 }] });
    f.execute.mockResolvedValueOnce({ confirmed: false } as never)
      .mockResolvedValueOnce({ confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' } as never)
      .mockResolvedValue({ confirmed: false } as never);
    await f.scheduler.tick();
    expect(f.scheduler.getState().plans[0].enabled).toBe(true);
    f.setTime('2026-10-19T23:00:00Z');
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(5);
    expect(f.scheduler.getState().plans[0].enabled).toBe(false);
    expect(f.scheduler.getState().runs.map((r) => r.status)).toEqual(['needs_review', 'confirmed', 'needs_review', 'needs_review', 'needs_review']);
  });
  it('does not expose thrown secrets and stops the affected account', async () => {
    const f = await ready();
    f.execute.mockRejectedValue(new Error('token=private'));
    await f.scheduler.tick();
    expect(JSON.stringify(f.scheduler.getState())).not.toContain('private');
    expect(f.scheduler.getState().runs[0].reason).toBe('execution_uncertain');
  });
  it('checks availability for every job and keeps a blocked post waiting for a later tick', async () => {
    const f = await ready();
    f.checkAvailable.mockResolvedValueOnce({ available: true }).mockResolvedValueOnce({ available: false });
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.scheduler.getState().runs[1].status).toBe('pending');
    expect(f.scheduler.getState().plans[0].enabled).toBe(true);
    f.setTime('2026-10-19T22:05:00Z');
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.scheduler.getState().runs.map((run) => run.status)).toEqual(['confirmed', 'confirmed']);
  });
  it('lets a waiting post expire when its KST day ends', async () => {
    const f = await ready();
    f.checkAvailable.mockResolvedValue({ available: false });
    await f.scheduler.tick();
    f.setTime('2026-10-20T15:00:00Z');
    await f.scheduler.tick();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.scheduler.getState().runs.map((run) => [run.status, run.reason])).toEqual([['cancelled', 'deadline_missed'], ['cancelled', 'deadline_missed']]);
  });
  it('runs another account while one account is waiting', async () => {
    const f = await ready();
    await f.scheduler.replacePlans([plan(), plan({ accountId: 'account-2' })], f.scheduler.getState().revision);
    f.checkAvailable.mockImplementation(async (p) => ({ available: p.accountId !== 'account-1' }));
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.scheduler.getState().runs.map((r) => r.status)).toEqual(['pending', 'pending', 'confirmed', 'confirmed']);
  });
  it('a stop during a job allows its result and cancels following jobs', async () => {
    const f = await ready();
    f.execute.mockImplementation(async () => {
      await f.scheduler.stop('account-1', f.scheduler.getState().revision);
      return { confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' };
    });
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.scheduler.getState().runs.map((run) => run.status)).toEqual(['confirmed', 'cancelled']);
  });
  it('never executes without a durable claim', async () => {
    const f = await ready();
    f.save.mockImplementation(async (state) => {
      if (state.runs.some((run) => run.status === 'inflight')) throw new Error('disk full');
    });
    await expect(f.scheduler.tick()).rejects.toThrow('DAILY_PERSISTENCE_FAILED');
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('requires explicit draft confirmation', async () => {
    const f = await ready({ mode: 'draft' });
    f.execute.mockResolvedValue({ confirmed: true, draftSaved: true } as never);
    await f.scheduler.tick();
    expect(f.scheduler.getState().runs.every((run) => run.status === 'confirmed')).toBe(true);
  });
  it('serializes accounts and merges concurrent ticks', async () => {
    const f = await ready();
    await f.scheduler.replacePlans([plan(), plan({ accountId: 'account-2' })], f.scheduler.getState().revision);
    let active = 0;
    f.execute.mockImplementation(async () => {
      active++;
      expect(active).toBe(1);
      await Promise.resolve();
      active--;
      return { confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' };
    });
    await Promise.all([f.scheduler.tick(), f.scheduler.tick()]);
    expect(f.execute).toHaveBeenCalledTimes(4);
  });
  it('recovers an interrupted job for review and keeps the plan and its unstarted jobs', async () => {
    const f = await ready();
    f.execute.mockImplementation(async () => { throw new Error('crash'); });
    await f.scheduler.tick();
    const state = f.scheduler.getState();
    state.plans[0].enabled = true;
    state.runs[0].status = 'inflight';
    const { reason: _failed, ...unstarted } = state.runs[1];
    state.runs[1] = { ...unstarted, status: 'pending' };
    const restarted = fixture(state);
    await restarted.scheduler.initialize();
    await restarted.scheduler.tick();
    expect(restarted.execute).toHaveBeenCalledTimes(1);
    expect(restarted.scheduler.getState().plans[0].enabled).toBe(true);
    expect(restarted.scheduler.getState().runs.map((run) => [run.status, run.reason])).toEqual([['needs_review', 'interrupted'], ['confirmed', undefined]]);
  });
  it('does not duplicate claims after plan revision changes or restart', async () => {
    const f = await ready();
    await f.scheduler.tick();
    await f.scheduler.replacePlans([plan({ topic: 'edited' })], f.scheduler.getState().revision);
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    const restarted = fixture(f.scheduler.getState());
    await restarted.scheduler.initialize();
    await restarted.scheduler.tick();
    expect(restarted.execute).not.toHaveBeenCalled();
  });
  it('persists a later due slot while a previous batch is still executing', async () => {
    const f = await ready({ slots: [{ time: '07:00', count: 1 }, { time: '07:01', count: 1 }] });
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.execute.mockImplementationOnce(async () => {
      entered();
      await gate;
      return { confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' };
    });
    const first = f.scheduler.tick();
    await started;
    f.setTime('2026-10-19T22:01:00Z');
    const second = f.scheduler.tick();
    await vi.waitFor(() => expect(f.scheduler.getState().runs).toHaveLength(2));
    release();
    await Promise.all([first, second]);
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
  it('cancels all accounts on an explicit global protection result', async () => {
    const f = await ready();
    await f.scheduler.replacePlans([plan(), plan({ accountId: 'account-2' })], f.scheduler.getState().revision);
    f.execute.mockResolvedValue({ confirmed: false, stopAll: true } as never);
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.scheduler.getState().plans.every((p) => !p.enabled)).toBe(true);
    expect(f.scheduler.getState().runs.map((r) => r.status)).toEqual(['needs_review', 'cancelled', 'cancelled', 'cancelled']);
  });
  it('waits before executing if availability lookup throws', async () => {
    const f = await ready();
    f.checkAvailable.mockRejectedValue(new Error('secret'));
    await f.scheduler.tick();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.scheduler.getState().runs.map((run) => run.status)).toEqual(['pending', 'pending']);
    expect(JSON.stringify(f.scheduler.getState())).not.toContain('secret');
  });
  it('a stop during the safety check prevents a claim', async () => {
    const f = await ready();
    f.checkAvailable.mockImplementation(async () => {
      await f.scheduler.stop('account-1', f.scheduler.getState().revision);
      return { available: true };
    });
    await f.scheduler.tick();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.scheduler.getState().runs.every((r) => r.status === 'cancelled')).toBe(true);
  });
  it('rejects unknown accounts and corrupt storage with safe errors', async () => {
    const f = await ready();
    await expect(f.scheduler.stop('missing', f.scheduler.getState().revision)).rejects.toThrow('DAILY_ACCOUNT_NOT_FOUND');
    const broken = fixture({ version: 99 } as never);
    await expect(broken.scheduler.initialize()).rejects.toThrow('DAILY_LOAD_FAILED');
    const fresh = fixture();
    expect(() => fresh.scheduler.getState()).toThrow('DAILY_NOT_INITIALIZED');
    await f.scheduler.initialize();
  });
  it('keeps unaffected account queues when one plan is edited', async () => {
    const f = await ready();
    await f.scheduler.replacePlans([plan(), plan({ accountId: 'account-2' })], f.scheduler.getState().revision);
    f.execute.mockImplementationOnce(async () => {
      await f.scheduler.replacePlans([plan({ topic: 'edited' }), plan({ accountId: 'account-2' })], f.scheduler.getState().revision);
      return { confirmed: true, publishedUrl: 'https://blog.naver.com/owner/12345' };
    });
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(3);
    expect(f.scheduler.getState().runs.map((r) => r.status)).toEqual(['confirmed', 'cancelled', 'confirmed', 'confirmed']);
  });
  it('enforces twenty actual attempts per KST day despite schedule edits', async () => {
    const f = await ready({ slots: [{ time: '07:00', count: 19 }] });
    await f.scheduler.tick();
    await f.scheduler.replacePlans([plan({ slots: [{ time: '07:01', count: 20 }] })], f.scheduler.getState().revision);
    f.setTime('2026-10-19T22:01:00Z');
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(20);
    await f.scheduler.replacePlans([plan({ slots: [{ time: '07:02', count: 20 }] })], f.scheduler.getState().revision);
    f.setTime('2026-10-19T22:02:00Z');
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(20);
    f.setTime('2026-10-20T22:02:00Z');
    await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(40);
  });
});
