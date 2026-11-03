import type { Page } from 'puppeteer';
import { createSchedulePublishOutcomeUnknownError } from './schedulePublishCommitPolicy.js';

export interface NativeReservationRequest {
  readonly blogId: string; readonly categoryId: string; readonly title: string; readonly scheduledFor: string;
}
export interface NativeReservationRow {
  readonly title: string; readonly scheduledAt: string; readonly categoryId?: string;
  readonly blogId?: string; readonly state: 'scheduled' | 'published' | 'unknown';
}
export interface NativeReservationSnapshot {
  readonly url: string; readonly blogId: string; readonly listVisible: boolean; readonly rows: readonly NativeReservationRow[];
}
export interface NativeReservationProof {
  readonly status: 'reserved'; readonly scheduledFor: string; readonly scheduledForUTC: string;
  readonly blogId: string; readonly categoryId: string; readonly title: string;
  readonly verification: 'naver-reservation-list';
}
/** Main-only product adapters must navigate actual UI controls and read visible rows, never APIs or cookies. */
export interface NativeReservationAdapter {
  open(page: Page, request: Readonly<NativeReservationRequest>, signal?: AbortSignal): Promise<void>;
  read(page: Page, request: Readonly<NativeReservationRequest>, signal?: AbortSignal): Promise<NativeReservationSnapshot>;
}
interface Binding {
  readonly request: Readonly<NativeReservationRequest>; readonly adapter?: NativeReservationAdapter; readonly signal?: AbortSignal;
}
const bindings = new WeakMap<object, Binding>();
const phases = new WeakMap<Binding, 'bound' | 'commit-checked' | 'reading' | 'finished'>();
const hold = (code: string): never => { throw Object.assign(new Error(code), { code }); };
const text = (value: unknown, limit = 300): string => {
  if (typeof value !== 'string' || value.length > limit || /[\x00-\x1f\x7f]/u.test(value)) return hold('DAILY_NATIVE_RESERVATION_INVALID');
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
};

/** Parse explicit UI dates as KST; never infer a missing date from a nearby row or the OS timezone. */
export function parseNativeReservationTime(value: string): string {
  if (typeof value !== 'string' || value.length > 80) return hold('DAILY_NATIVE_RESERVATION_TIME');
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/u.test(value)) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString() === value) return value;
  }
  const match = value.trim().match(/^(\d{4})[.-]\s*(\d{1,2})[.-]\s*(\d{1,2})\.?\s+(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})$/u);
  if (!match) return hold('DAILY_NATIVE_RESERVATION_TIME');
  const [year, month, day, hour, minute] = [match[1], match[2], match[3], match[5], match[6]].map(Number);
  if (year < 2000 || month < 1 || month > 12 || minute > 59 || hour > (match[4] ? 12 : 23) || (match[4] && hour < 1)) return hold('DAILY_NATIVE_RESERVATION_TIME');
  const hours = match[4] ? hour % 12 + (match[4] === '오후' ? 12 : 0) : hour;
  const result = new Date(Date.UTC(year, month - 1, day, hours - 9, minute));
  const local = new Date(result.getTime() + 9 * 3_600_000);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return hold('DAILY_NATIVE_RESERVATION_TIME');
  return result.toISOString();
}

function requestCopy(value: NativeReservationRequest): Readonly<NativeReservationRequest> {
  const blogId = text(value?.blogId).toLowerCase(), categoryId = text(value?.categoryId), title = text(value?.title, 200);
  if (!/^[a-z0-9_-]{1,100}$/u.test(blogId) || !/^[1-9]\d{0,15}$/u.test(categoryId) || !title
    || parseNativeReservationTime(value.scheduledFor) !== value.scheduledFor) return hold('DAILY_NATIVE_RESERVATION_INVALID');
  return Object.freeze({ blogId, categoryId, title, scheduledFor: value.scheduledFor });
}

export function attachDailyNativeReservation(options: object, request: NativeReservationRequest,
  deps: { adapter?: NativeReservationAdapter; signal?: AbortSignal } = {}): void {
  if (!options || typeof options !== 'object' || bindings.has(options)) return hold('DAILY_NATIVE_RESERVATION_REPLAY');
  const binding = Object.freeze({ request: requestCopy(request), ...deps });
  bindings.set(options, binding); phases.set(binding, 'bound');
}
export function forwardDailyNativeReservation(source: object, target: object): void {
  const binding = bindings.get(source);
  if (!binding) return;
  if (bindings.has(target) && bindings.get(target) !== binding) return hold('DAILY_NATIVE_RESERVATION_REPLAY');
  bindings.set(target, binding);
}
export function hasDailyNativeReservation(options: object | undefined): boolean { return Boolean(options && bindings.has(options)); }
/** Availability preflight only; it does not certify a live connection or an actual NAVER reservation. */
export function assertDailyNativeReservationAdapterReady(adapter?: NativeReservationAdapter): void {
  if (!adapter || typeof adapter.open !== 'function' || typeof adapter.read !== 'function') return hold('DAILY_NATIVE_RESERVATION_ADAPTER_REQUIRED');
}
export function assertDailyNativeReservationReady(options: object, now = new Date(), allowCommitChecked = false): void {
  const binding = bindings.get(options);
  if (!binding) return;
  if (phases.get(binding) !== 'bound' && !(allowCommitChecked && phases.get(binding) === 'commit-checked')) return hold('DAILY_NATIVE_RESERVATION_REPLAY');
  if (binding.signal?.aborted) return hold('DAILY_CANCELLED');
  assertDailyNativeReservationAdapterReady(binding.adapter);
  if (!Number.isFinite(now.getTime()) || now.getTime() >= Date.parse(binding.request.scheduledFor)) return hold('DAILY_SCHEDULE_DEADLINE_MISSED');
  if (now.getTime() < Date.parse(binding.request.scheduledFor) - 3_600_000) return hold('DAILY_SCHEDULE_NOT_READY');
}

/** Rechecks copied payloads without consuming the final-click permission. */
export function assertDailyNativeReservationScope(options: object, actual: {
  mode: string; title?: string; blogId?: string; categoryId?: string; scheduleDate?: string; scheduleType?: string;
}, now = new Date()): void {
  const binding = bindings.get(options);
  if (!binding) return;
  assertDailyNativeReservationReady(options, now);
  if (phases.get(binding) !== 'bound') return hold('DAILY_NATIVE_RESERVATION_REPLAY');
  const expected = binding.request;
  let time = '';
  try { time = parseNativeReservationTime(actual.scheduleDate || ''); } catch { /* Scope mismatch stays held. */ }
  if (actual.mode !== 'schedule' || (actual.scheduleType !== undefined && actual.scheduleType !== 'naver-server') || text(actual.title || '', 200) !== expected.title
    || text(actual.blogId || '').toLowerCase() !== expected.blogId || actual.categoryId !== expected.categoryId
    || time !== expected.scheduledFor) return hold('DAILY_NATIVE_RESERVATION_SCOPE');
}
/** Called immediately before the one irreversible native confirm click. */
export function assertDailyNativeReservationCommit(options: object,
  actual: Parameters<typeof assertDailyNativeReservationScope>[1], now = new Date()): void {
  assertDailyNativeReservationScope(options, actual, now);
  const binding = bindings.get(options);
  if (!binding) return;
  phases.set(binding, 'commit-checked');
}

/** Every field must come from the same observed row. Toasts, home URLs and neighboring rows are insufficient. */
export function attestNativeReservationList(snapshot: NativeReservationSnapshot, request: NativeReservationRequest): NativeReservationProof {
  try {
    const expected = requestCopy(request), url = new URL(snapshot.url);
    const pathId = url.pathname.split('/').filter(Boolean)[0] || '';
    const urlBlog = url.searchParams.get('blogId') || (/^[a-z0-9_-]+$/iu.test(pathId) ? pathId : '');
    if (url.protocol !== 'https:' || !['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) || url.port || url.username || url.password
      || url.searchParams.getAll('blogId').length > 1 || (/^[a-z0-9_-]+$/iu.test(pathId) && pathId.toLowerCase() !== expected.blogId)
      || urlBlog.toLowerCase() !== expected.blogId || snapshot.listVisible !== true || text(snapshot.blogId).toLowerCase() !== expected.blogId
      || !Array.isArray(snapshot.rows) || snapshot.rows.length > 500) throw Error();
    const matches = snapshot.rows.filter(row => {
      try { return row.state === 'scheduled' && text(row.title, 200) === expected.title && row.categoryId === expected.categoryId
        && (!row.blogId || text(row.blogId).toLowerCase() === expected.blogId) && parseNativeReservationTime(row.scheduledAt) === expected.scheduledFor; }
      catch { return false; }
    });
    if (matches.length !== 1) throw Error();
    return Object.freeze({ status: 'reserved', scheduledFor: expected.scheduledFor, scheduledForUTC: expected.scheduledFor,
      blogId: expected.blogId, categoryId: expected.categoryId, title: expected.title, verification: 'naver-reservation-list' });
  } catch { throw createSchedulePublishOutcomeUnknownError(); }
}

/** Open/read once through a verified product adapter; uncertainty never triggers another publish attempt. */
export async function verifyDailyNativeReservation(options: object, page: Page,
  config: { timeoutMs?: number } = {}): Promise<NativeReservationProof> {
  const binding = bindings.get(options);
  if (!binding || phases.get(binding) !== 'commit-checked' || !binding.adapter) throw createSchedulePublishOutcomeUnknownError();
  phases.set(binding, 'reading');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const controller = new AbortController();
  try {
    const timeout = config.timeoutMs ?? 15_000;
    if (!Number.isInteger(timeout) || timeout < 50 || timeout > 30_000 || binding.signal?.aborted) throw Error();
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => { controller.abort(); reject(Error()); };
      binding.signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, timeout);
    });
    return await Promise.race([(async () => {
      await binding.adapter!.open(page, binding.request, controller.signal);
      if (controller.signal.aborted) throw Error();
      const observed = await binding.adapter!.read(page, binding.request, controller.signal);
      if (controller.signal.aborted || observed.url !== page.url()) throw Error();
      return attestNativeReservationList(observed, binding.request);
    })(), cancelled]);
  } catch { throw createSchedulePublishOutcomeUnknownError(); }
  finally {
    if (timer) clearTimeout(timer);
    if (abort) binding.signal?.removeEventListener('abort', abort);
    controller.abort();
    phases.set(binding, 'finished');
  }
}
