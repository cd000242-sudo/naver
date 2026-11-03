import { describe, expect, it, vi } from 'vitest';
import { DailyPublishingScheduler } from '../scheduler/dailyPublishing.js';
import { dailySlotTiming, nextDailyRunAt, nextDailyScheduledFor, validateDailyPlans } from '../scheduler/dailyPublishingModel.js';
import { validateDailyState } from '../scheduler/dailyPublishingState.js';
import { assertDailyScheduleDeadline, createDailyPublishingExecutor, getDailyPublishingContext } from '../main/services/dailyPublishingExecutor.js';
import { createDailyPublishingApi } from '../main/ldb-daily-publishing.js';

const plan = { accountId: 'a', categoryId: '3', enabled: true, mode: 'schedule', leadMinutes: 60,
  slots: [{ time: '09:00', count: 1 }], generator: 'agent-codex', imageSource: 'imagefx', topic: '주제' } as const;
const target = '2026-10-21T00:00:00.000Z', prepare = '2026-10-20T23:00:00.000Z';
function schedulerFixture() {
  let now = new Date(prepare), stored: any = null;
  const execute = vi.fn(async () => ({ confirmed: true, scheduleVerified: true, scheduledFor: target }));
  const scheduler = new DailyPublishingScheduler({ load: async () => stored, save: async state => { stored = structuredClone(state); },
    now: () => now, execute, checkAvailable: async () => ({ available: true }) });
  return { scheduler, execute, stored: () => stored, setTime: (value: string) => { now = new Date(value); } };
}
async function initialized(overrides: Record<string, unknown> = {}) {
  const f = schedulerFixture(); await f.scheduler.initialize(); await f.scheduler.replacePlans([{ ...plan, ...overrides }], 0); return f;
}
function executorFixture() {
  let now = new Date(prepare);
  const deps = { now: () => now, readConfig: async () => ({ defaultAiProvider: 'agent-codex', imageSource: 'imagefx' }),
    readAccount: async () => ({ id: 'a', blogId: 'myblog', settings: { keywords: ['소재'] } }),
    resolveCategory: async () => ({ categoryName: '이슈' }), reserveSource: vi.fn(async () => true),
    publish: vi.fn(async (_ids: string[], _options: Record<string, unknown>): Promise<any> => ({ success: true, results: [{ accountId: 'a', success: true,
      publishMode: 'schedule', scheduledPublication: { status: 'reserved', scheduledFor: target, blogId: 'myblog', verification: 'naver-reservation-list' } }] })) };
  return { deps, setTime: (value: string) => { now = new Date(value); }, job: { ...plan, id: 'job', scheduledFor: target, prepareAt: prepare } };
}
describe('publication time is separate from advance preparation', () => {
  it('accepts only explicit 60 minute schedule semantics and preserves legacy modes', () => {
    expect(validateDailyPlans([plan])[0]).toMatchObject({ mode: 'schedule', leadMinutes: 60 });
    for (const mode of ['draft', 'publish']) {
      const { leadMinutes: _, ...legacy } = { ...plan, mode };
      expect(validateDailyPlans([legacy])[0]).not.toHaveProperty('leadMinutes');
    }
    for (const leadMinutes of [undefined, 0, 59, 61, '60']) expect(() => validateDailyPlans([{ ...plan, leadMinutes }])).toThrow();
  });
  it('prepares at 08 for 09 and prepares on the previous day for a 00:30 publication', () => {
    const p = validateDailyPlans([plan])[0];
    expect(dailySlotTiming(p, '2026-10-21', '09:00')).toEqual({ scheduledFor: target, prepareAt: prepare });
    expect(dailySlotTiming(p, '2026-10-21', '00:30')).toEqual({ scheduledFor: '2026-10-20T15:30:00.000Z', prepareAt: '2026-10-20T14:30:00.000Z' });
    expect(nextDailyRunAt(p, new Date('2026-10-20T22:59:00Z'))).toBe(prepare);
    expect(nextDailyScheduledFor(p, new Date('2026-10-20T22:59:00Z'))).toBe(target);
    expect(nextDailyScheduledFor({ ...p, enabled: false }, new Date())).toBeNull();
    expect(nextDailyScheduledFor({ ...p, mode: 'draft' }, new Date())).toBeNull();
  });
  it('durably claims the publication date/time and persists reservation confirmation through restart', async () => {
    const f = await initialized(); await f.scheduler.tick();
    expect(f.execute.mock.calls[0][1]).toMatchObject({ key: 'a:2026-10-21:0900:1', date: '2026-10-21', time: '09:00', scheduledFor: target, prepareAt: prepare });
    expect(f.scheduler.getState().runs[0]).toMatchObject({ status: 'confirmed', scheduledFor: target, scheduleVerified: true });
    expect(validateDailyState(f.stored()).runs[0]).toMatchObject({ scheduledFor: target, prepareAt: prepare });
    await f.scheduler.tick(); expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('keys midnight publication by the next publication day rather than preparation day', async () => {
    const f = await initialized({ slots: [{ time: '00:30', count: 1 }] }); f.setTime('2026-10-20T14:30:00Z');
    f.execute.mockResolvedValue({ confirmed: true, scheduleVerified: true, scheduledFor: '2026-10-20T15:30:00.000Z' });
    await f.scheduler.tick();
    expect(f.scheduler.getState().runs[0]).toMatchObject({ key: 'a:2026-10-21:0030:1', date: '2026-10-21' });
  });
  it('claims an unstarted slot throughout its preparation window exactly once', async () => {
    const f = await initialized(); f.setTime('2026-10-20T23:20:00Z'); await f.scheduler.tick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.scheduler.getState().runs[0]).toMatchObject({ scheduledFor: target, prepareAt: prepare, key: 'a:2026-10-21:0900:1' });
    f.setTime('2026-10-20T23:59:59Z'); await f.scheduler.tick(); expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('restarts during preparation without losing an unclaimed slot or repeating confirmed work', async () => {
    const f = await initialized(); f.setTime('2026-10-20T23:20:00Z');
    let state = f.stored();
    const dependencies = { load: async () => state, save: async (value: any) => { state = structuredClone(value); },
      now: () => new Date('2026-10-20T23:20:00Z'), execute: f.execute, checkAvailable: async () => ({ available: true }) };
    const first = new DailyPublishingScheduler(dependencies); await first.initialize(); await first.tick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    const second = new DailyPublishingScheduler(dependencies); await second.initialize(); await second.tick();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('can prepare a midnight slot before or after midnight while preserving the publication date', async () => {
    for (const time of ['2026-10-20T14:45:00Z', '2026-10-20T15:10:00Z']) {
      const f = await initialized({ slots: [{ time: '00:30', count: 1 }] }); f.setTime(time);
      f.execute.mockResolvedValue({ confirmed: true, scheduleVerified: true, scheduledFor: '2026-10-20T15:30:00.000Z' });
      await f.scheduler.tick(); expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.scheduler.getState().runs[0]).toMatchObject({ key: 'a:2026-10-21:0030:1', date: '2026-10-21', prepareAt: '2026-10-20T14:30:00.000Z' });
    }
  });
  it('does not claim before preparation, at the deadline, or past the deadline', async () => {
    for (const time of ['2026-10-20T22:59:59Z', target, '2026-10-21T00:01:00Z']) {
      const f = await initialized(); f.setTime(time); await f.scheduler.tick();
      expect(f.execute).not.toHaveBeenCalled(); expect(f.scheduler.getState().runs).toEqual([]);
    }
  });
  it('catches up draft and publish slots later the same day, but not on the next day', async () => {
    for (const mode of ['draft', 'publish']) {
      const f = await initialized({ mode, leadMinutes: undefined }); f.setTime('2026-10-21T00:20:00Z');
      await f.scheduler.tick(); expect(f.execute).toHaveBeenCalledTimes(1);
      const next = await initialized({ mode, leadMinutes: undefined }); next.setTime('2026-10-21T15:20:00Z');
      await next.scheduler.tick(); expect(next.execute).not.toHaveBeenCalled();
    }
  });
  it('reports the current preparation window instead of tomorrow until its publication deadline', () => {
    const p = validateDailyPlans([plan])[0];
    expect(nextDailyRunAt(p, new Date('2026-10-20T23:20:00Z'))).toBe(prepare);
    expect(nextDailyScheduledFor(p, new Date('2026-10-20T23:20:00Z'))).toBe(target);
    expect(nextDailyRunAt(p, new Date(target))).toBe('2026-10-21T23:00:00.000Z');
    const claimed = [{ accountId: 'a', date: '2026-10-21', time: '09:00', ordinal: 1 }];
    expect(nextDailyRunAt(p, new Date('2026-10-20T23:20:00Z'), claimed)).toBe('2026-10-21T23:00:00.000Z');
    expect(nextDailyScheduledFor(p, new Date('2026-10-20T23:20:00Z'), claimed)).toBe('2026-10-22T00:00:00.000Z');
    const midnight = { ...p, slots: [{ time: '00:30', count: 1 }] };
    for (const time of ['2026-10-20T14:45:00Z', '2026-10-20T15:10:00Z']) {
      expect(nextDailyRunAt(midnight, new Date(time))).toBe('2026-10-20T14:30:00.000Z');
      expect(nextDailyScheduledFor(midnight, new Date(time))).toBe('2026-10-20T15:30:00.000Z');
    }
  });
  it.each([{ confirmed: true }, { confirmed: true, publishedUrl: 'https://blog.naver.com/myblog/123' },
    { confirmed: true, draftSaved: true }, { confirmed: true, scheduleVerified: true, scheduledFor: '2026-10-21T01:00:00.000Z' }])('never treats URL, draft or a different target as confirmed: %j', async result => {
    const f = await initialized(); f.execute.mockResolvedValue(result as never); await f.scheduler.tick();
    expect(f.scheduler.getState().runs[0].status).toBe('needs_review');
  });
  it('holds a queued job whose target passes while a previous slot runs', async () => {
    const f = await initialized({ slots: [{ time: '09:00', count: 2 }] });
    f.execute.mockImplementationOnce(async () => { f.setTime(target); return { confirmed: true, scheduleVerified: true, scheduledFor: target }; });
    await f.scheduler.tick(); expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.scheduler.getState().runs[1]).toMatchObject({ status: 'cancelled', reason: 'deadline_missed', scheduledFor: target });
    expect(f.scheduler.getState().plans[0].enabled).toBe(true);
  });
  it('rechecks the deadline when availability checks consume the remaining preparation time', async () => {
    let now = new Date('2026-10-20T23:59:59Z');
    const execute = vi.fn(async () => ({ confirmed: true, scheduleVerified: true, scheduledFor: target }));
    const scheduler = new DailyPublishingScheduler({ load: async () => null, save: async () => {}, now: () => now,
      execute, checkAvailable: async () => { now = new Date(target); return { available: true }; } });
    await scheduler.initialize(); await scheduler.replacePlans([plan], 0); await scheduler.tick();
    expect(execute).not.toHaveBeenCalled();
    expect(scheduler.getState().runs[0]).toMatchObject({ status: 'needs_review', reason: 'deadline_missed' });
  });
  it('preserves explicit deadline failures instead of attempting immediate publication or target rollover', async () => {
    const f = await initialized(); f.execute.mockRejectedValue(new Error('DAILY_SCHEDULE_DEADLINE_MISSED')); await f.scheduler.tick();
    expect(f.scheduler.getState().runs[0]).toMatchObject({ status: 'needs_review', reason: 'deadline_missed', scheduledFor: target });
    await f.scheduler.tick(); expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('sends native Naver schedule date/time, binds the private target and requires reservation-list proof', async () => {
    const f = executorFixture(); const result = await createDailyPublishingExecutor(f.deps)(f.job);
    expect(f.deps.publish.mock.calls[0][1]).toMatchObject({ publishMode: 'schedule', scheduleDate: '2026-10-21', scheduleTime: '09:00' });
    const context = getDailyPublishingContext(f.deps.publish.mock.calls[0][1]);
    expect(context).toMatchObject({ mode: 'schedule', scheduledFor: target, prepareAt: prepare });
    expect(() => assertDailyScheduleDeadline(context, new Date(target))).toThrow('DAILY_SCHEDULE_DEADLINE_MISSED');
    expect(result).toMatchObject({ confirmed: true, scheduleVerified: true, scheduledFor: target });
  });
  it.each([
    undefined, { status: 'reserved', scheduledFor: target, blogId: 'myblog', verification: 'submit-click' },
    { status: 'reserved', scheduledFor: target, blogId: 'other', verification: 'naver-reservation-list' },
    { status: 'reserved', scheduledFor: '2026-10-22T00:00:00.000Z', blogId: 'myblog', verification: 'naver-reservation-list' },
  ])('does not accept unverified native scheduling outcome %j', async scheduledPublication => {
    const f = executorFixture(); f.deps.publish.mockResolvedValue({ success: true, results: [{ accountId: 'a', success: true, publishMode: 'schedule',
      url: 'https://blog.naver.com/myblog/123', draftSaved: true, scheduledPublication }] });
    expect((await createDailyPublishingExecutor(f.deps)(f.job)).confirmed).toBe(false);
  });
  it('stops before source claims or paid work when the target has passed or is absent', async () => {
    const f = executorFixture(); f.setTime(target);
    await expect(createDailyPublishingExecutor(f.deps)(f.job)).rejects.toThrow('DAILY_SCHEDULE_DEADLINE_MISSED');
    expect(f.deps.reserveSource).not.toHaveBeenCalled(); expect(f.deps.publish).not.toHaveBeenCalled();
    await expect(createDailyPublishingExecutor(f.deps)({ ...f.job, scheduledFor: undefined })).rejects.toThrow('DAILY_SCHEDULE_TARGET_REQUIRED');
  });
  it('rechecks the deadline after research before handing off to paid generation', async () => {
    const f = executorFixture(); f.deps.reserveSource.mockImplementation(async () => { f.setTime(target); return true; });
    await expect(createDailyPublishingExecutor(f.deps)(f.job)).rejects.toThrow('DAILY_SCHEDULE_DEADLINE_MISSED');
    expect(f.deps.publish).not.toHaveBeenCalled();
  });
  it.each(['not-a-date', '2026-10-21T09:00:00+09:00', '2026-10-21T00:00:30.000Z'])('rejects malformed, noncanonical or subminute targets %s before paid work', async scheduledFor => {
    const f = executorFixture();
    await expect(createDailyPublishingExecutor(f.deps)({ ...f.job, scheduledFor })).rejects.toThrow('DAILY_SCHEDULE_TARGET_REQUIRED');
    expect(f.deps.reserveSource).not.toHaveBeenCalled(); expect(f.deps.publish).not.toHaveBeenCalled();
  });
  it('does not prepare before the agreed hour and fails closed on an invalid clock', async () => {
    const f = executorFixture(); f.setTime('2026-10-20T22:59:00Z');
    await expect(createDailyPublishingExecutor(f.deps)(f.job)).rejects.toThrow('DAILY_SCHEDULE_NOT_READY');
    f.setTime('invalid'); await expect(createDailyPublishingExecutor(f.deps)(f.job)).rejects.toThrow('DAILY_CLOCK_INVALID');
    expect(f.deps.publish).not.toHaveBeenCalled();
  });
  it('validates persisted target/prepare pairs and publication-day identity on restart', async () => {
    const f = await initialized(); await f.scheduler.tick(); const saved = f.stored();
    for (const changes of [{ scheduledFor: 'bad' }, { prepareAt: target }, { date: '2026-10-20' }, { scheduleVerified: false }]) {
      const copy = structuredClone(saved); Object.assign(copy.runs[0], changes);
      expect(() => validateDailyState(copy)).toThrow('DAILY_STATE_INVALID');
    }
  });
  it('reports preparation and publication separately and protects an old client that omits schedule mode', async () => {
    const f = await initialized(); const api = createDailyPublishingApi({ scheduler: f.scheduler, availability: async () => ({ ready: true, paid: true, label: 'ready' }),
      validatePlan: async () => {}, now: () => new Date('2026-10-20T22:59:00Z') });
    const status = (await api.request('GET', '/v1/automations/status')).body;
    expect(status.plans[0]).toMatchObject({ nextAt: prepare, nextScheduledFor: target });
    const { mode: _, ...omitted } = plan;
    expect((await api.request('POST', '/v1/automations/plan', { revision: status.revision, plan: omitted })).body.code).toBe('DAILY_SCHEDULE_MODE_REQUIRED');
    expect((await api.request('POST', '/v1/automations/stop', { revision: status.revision, accountId: 'a' })).status).toBe(200);
  });
  it('advertises missing native verification and rejects enabling while allowing disabled save and stop', async () => {
    const f = await initialized(); const api = createDailyPublishingApi({ scheduler: f.scheduler,
      availability: async () => ({ ready: true, paid: true, label: 'ready' }), validatePlan: async () => {} });
    const before = (await api.request('GET', '/v1/automations/status')).body;
    expect(before.scheduling.nativeReservationReady).toBe(false);
    const denied = await api.request('POST', '/v1/automations/plan', { revision: before.revision, plan });
    expect(denied).toMatchObject({ status: 422, body: { code: 'DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED' } });
    expect(f.scheduler.getState().revision).toBe(before.revision);
    const saved = await api.request('POST', '/v1/automations/plan', { revision: before.revision, plan: { ...plan, enabled: false } });
    expect(saved.status).toBe(200);
    expect((await api.request('POST', '/v1/automations/stop', { revision: saved.body.revision, accountId: 'a' })).status).toBe(200);
    const supported = createDailyPublishingApi({ scheduler: f.scheduler, nativeReservationReady: () => true,
      availability: async () => ({ ready: true, paid: true, label: 'ready' }), validatePlan: async () => {} });
    expect((await supported.request('POST', '/v1/automations/plan', { revision: f.scheduler.getState().revision, plan })).status).toBe(200);
  });
});
