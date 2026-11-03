import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachDailyNativeReservation, forwardDailyNativeReservation, hasDailyNativeReservation,
  assertDailyNativeReservationReady, assertDailyNativeReservationCommit,
  assertDailyNativeReservationAdapterReady,
  parseNativeReservationTime, attestNativeReservationList, verifyDailyNativeReservation,
  type NativeReservationRequest, type NativeReservationSnapshot,
} from '../automation/dailyNativeReservation.js';

const target = '2099-10-21T00:00:00.000Z';
const request: NativeReservationRequest = { blogId: 'myblog', categoryId: '3', title: '새 글의 정확한 제목', scheduledFor: target };
const now = () => new Date('2099-10-20T23:30:00.000Z');
const row = { title: request.title, scheduledAt: '2099.10.21. 오전 9:00', categoryId: '3', state: 'scheduled' as const };
const snapshot = (): NativeReservationSnapshot => ({ url: 'https://blog.naver.com/PostList.naver?blogId=myblog',
  blogId: 'myblog', listVisible: true, rows: [{ ...row }] });
const page = { url: () => snapshot().url } as any;
const scope = { mode: 'schedule', title: request.title, blogId: 'myblog', categoryId: '3', scheduleDate: '2099-10-21 09:00' };
const adapter = () => ({ open: vi.fn(async () => undefined), read: vi.fn(async () => snapshot()) });

afterEach(() => vi.useRealTimers());
describe('native NAVER reservation list attestation', () => {
  it('preflights adapter availability without a placeholder title or paid work', () => {
    for (const candidate of [undefined, {}, { open: async () => undefined }, { open: 'not a function', read: async () => snapshot() }]) {
      expect(() => assertDailyNativeReservationAdapterReady(candidate as any)).toThrow('DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED');
    }
    expect(() => assertDailyNativeReservationAdapterReady(adapter())).not.toThrow();
  });
  it('leaves legacy/non-daily options unchanged and never fabricates a proof for them', async () => {
    const ordinary = {}, forwarded = {};
    assertDailyNativeReservationReady(ordinary, now());
    assertDailyNativeReservationCommit(ordinary, scope, now());
    forwardDailyNativeReservation(ordinary, forwarded);
    expect(hasDailyNativeReservation(forwarded)).toBe(false);
    await expect(verifyDailyNativeReservation(ordinary, page)).rejects.toThrow('SCHEDULE_PUBLISH_OUTCOME_UNKNOWN');
  });
  it('normalizes supported KST dates without the local machine timezone', () => {
    for (const time of ['2099-10-21 09:00', '2099.10.21. 오전 9:00', '2099. 10. 21. 09:00', target]) {
      expect(parseNativeReservationTime(time)).toBe(target);
    }
    expect(parseNativeReservationTime('2099.10.21. 오후 12:00')).toBe('2099-10-21T03:00:00.000Z');
    expect(parseNativeReservationTime('2099.10.21. 오전 12:00')).toBe('2099-10-20T15:00:00.000Z');
    for (const time of ['2099-02-30 09:00', '2099-10-21 24:00', '09:00', 'tomorrow', '2099.10.21. 오후 13:00']) {
      expect(() => parseNativeReservationTime(time)).toThrow();
    }
  });
  it('requires a single exact row for the blog, category, title and target', () => {
    expect(attestNativeReservationList(snapshot(), request)).toMatchObject({ status: 'reserved', blogId: 'myblog',
      scheduledFor: target, scheduledForUTC: target, verification: 'naver-reservation-list' });
  });
  it.each([
    { ...snapshot(), blogId: 'other' }, { ...snapshot(), url: 'https://blog.naver.com.evil.test/myblog' },
    { ...snapshot(), listVisible: false }, { ...snapshot(), rows: [{ ...row, categoryId: undefined }] },
    { ...snapshot(), rows: [{ ...row, categoryId: '4' }] }, { ...snapshot(), rows: [{ ...row, state: 'published' }] },
    { ...snapshot(), rows: [{ ...row, scheduledAt: '2099-10-21 10:00' }] },
    { ...snapshot(), rows: [{ ...row }, { ...row }] },
    { ...snapshot(), url: 'https://blog.naver.com/PostList.naver?blogId=myblog&blogId=other' },
    { ...snapshot(), url: 'https://blog.naver.com/other?blogId=myblog' },
  ])('does not accept wrong, missing or ambiguous list evidence %j', value => {
    expect(() => attestNativeReservationList(value as NativeReservationSnapshot, request)).toThrow('SCHEDULE_PUBLISH_OUTCOME_UNKNOWN');
  });
  it('never combines a matching title with a neighboring row time or category', () => {
    const bad = { ...snapshot(), rows: [{ ...row, scheduledAt: '2099-10-21 10:00' }, { ...row, title: '이웃 글 제목' }] };
    expect(() => attestNativeReservationList(bad, request)).toThrow('SCHEDULE_PUBLISH_OUTCOME_UNKNOWN');
    expect(attestNativeReservationList({ ...snapshot(), rows: [{ ...row }, { ...row, scheduledAt: '2099-10-21 10:00' }] }, request)).toMatchObject({ status: 'reserved' });
  });
  it('private identity survives the internal handoff but JSON fields cannot opt in', () => {
    const original = {}, targetOptions = {}, ui = adapter();
    attachDailyNativeReservation(original, request, { adapter: ui });
    forwardDailyNativeReservation(original, targetOptions);
    expect(hasDailyNativeReservation(targetOptions)).toBe(true);
    expect(hasDailyNativeReservation({ ...original, dailyNativeReservation: request })).toBe(false);
    expect(() => attachDailyNativeReservation(original, request, { adapter: ui })).toThrow();
    assertDailyNativeReservationCommit(targetOptions, scope, now());
    const replay = {}; forwardDailyNativeReservation(original, replay);
    expect(() => assertDailyNativeReservationCommit(replay, scope, now())).toThrow('DAILY_NATIVE_RESERVATION_REPLAY');
  });
  it('holds before the click when actual list selectors/adapter are not verified', () => {
    const options = {};
    attachDailyNativeReservation(options, request);
    expect(() => assertDailyNativeReservationReady(options, now())).toThrow('DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED');
  });
  it('rejects late, mismatched or reused commit requests without changing the target', () => {
    for (const changed of [{ ...scope, mode: 'publish' }, { ...scope, categoryId: undefined }, { ...scope, title: '다른 제목' },
      { ...scope, blogId: 'other' }, { ...scope, scheduleDate: '2099-10-22 09:00' }]) {
      const options = {}; attachDailyNativeReservation(options, request, { adapter: adapter() });
      expect(() => assertDailyNativeReservationCommit(options, changed, now())).toThrow('DAILY_NATIVE_RESERVATION_SCOPE');
    }
    const options = {}; attachDailyNativeReservation(options, request, { adapter: adapter() });
    expect(() => assertDailyNativeReservationCommit(options, scope, new Date(target))).toThrow('DAILY_SCHEDULE_DEADLINE_MISSED');
    assertDailyNativeReservationCommit(options, scope, now());
    expect(() => assertDailyNativeReservationCommit(options, scope, now())).toThrow('DAILY_NATIVE_RESERVATION_REPLAY');
  });
  it('navigates to the actual list before reading and never clicks again after uncertainty', async () => {
    const options = {}, ui = adapter(); attachDailyNativeReservation(options, request, { adapter: ui });
    assertDailyNativeReservationCommit(options, scope, now());
    expect(await verifyDailyNativeReservation(options, page)).toMatchObject({ status: 'reserved' });
    expect(ui.open.mock.invocationCallOrder[0]).toBeLessThan(ui.read.mock.invocationCallOrder[0]);
    await expect(verifyDailyNativeReservation(options, page)).rejects.toThrow('SCHEDULE_PUBLISH_OUTCOME_UNKNOWN');
    expect(() => assertDailyNativeReservationReady(options, now())).toThrow('DAILY_NATIVE_RESERVATION_REPLAY');
    expect(ui.open).toHaveBeenCalledTimes(1);
  });
  it('cancellation or a bounded list read leaves the already attempted reservation unknown', async () => {
    const controller = new AbortController(), options = {}, ui = adapter();
    attachDailyNativeReservation(options, request, { adapter: ui, signal: controller.signal });
    assertDailyNativeReservationCommit(options, scope, now()); controller.abort();
    await expect(verifyDailyNativeReservation(options, page)).rejects.toMatchObject({ code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' });
    expect(ui.open).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const hung = {}; attachDailyNativeReservation(hung, request, { adapter: { open: async () => new Promise(() => {}), read: ui.read } });
    assertDailyNativeReservationCommit(hung, scope, now());
    const pending = expect(verifyDailyNativeReservation(hung, page, { timeoutMs: 100 })).rejects.toMatchObject({ code: 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN' });
    await vi.advanceTimersByTimeAsync(100); await pending;
    expect(ui.read).not.toHaveBeenCalled();
  });
});
