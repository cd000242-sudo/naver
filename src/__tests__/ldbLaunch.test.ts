import { describe, it, expect } from 'vitest';
import { isLdbConnectUrl, createUpdateStatus, createSerializedRefresh } from '../main/ldb-launch.js';
describe('LDB installed app launch boundary', () => {
 it('accepts only fixed connect URI without arbitrary arguments', () => {
  expect(isLdbConnectUrl('better-life-naver://ldb/connect')).toBe(true);
  for (const value of ['better-life-naver://ldb/connect?token=secret', 'better-life-naver://ldb/connect#x', 'better-life-naver://user@ldb/connect', 'https://ldb/connect', 'better-life-naver://ldb/publish', '', undefined]) expect(isLdbConnectUrl(value)).toBe(false);
 });
 it('does not call failed or unavailable update checks current', () => {
  const status = createUpdateStatus();
  expect(status.get()).toEqual({ state: 'unknown' });
  status.record('update-checking'); expect(status.get().state).toBe('checking');
  status.record('update-not-available', { reason: 'github-transient' }); expect(status.get().state).toBe('unavailable');
  status.record('update-not-available'); expect(status.get().state).toBe('current'); expect(status.get().checkedAt).toBeTruthy();
  status.record('update-available', { version: '2.11.316' }); expect(status.get()).toMatchObject({ state: 'available', latestVersion: '2.11.316' });
  status.record('update-download-progress'); expect(status.get().state).toBe('downloading');
  status.record('update-downloaded', { version: '2.11.316' }); expect(status.get().state).toBe('restart-required');
  status.record('update-error', { message: 'secret' }); expect(status.get().state).toBe('error'); expect(JSON.stringify(status.get())).not.toContain('secret');
  const copy = status.get(); copy.state = 'current'; expect(status.get().state).toBe('error');
  status.record('unrelated'); expect(status.get().state).toBe('error');
 });
});

it('reconciles again when settings change during an in-flight bridge start', async () => {
 let enabled = true; const applied: boolean[] = []; let release!: () => void;
 const wait = new Promise<void>(resolve => { release = resolve; });
 const refresh = createSerializedRefresh(async () => { const value = enabled; if (!applied.length) await wait; applied.push(value); });
 const first = refresh(); await Promise.resolve(); enabled = false; const second = refresh(); release();
 await Promise.all([first, second]); expect(applied).toEqual([true, false]);
 enabled = true; await refresh(); expect(applied).toEqual([true, false, true]);
});
it('allows retry after reconciliation fails', async () => {
 let fail = true; const refresh = createSerializedRefresh(async () => { if (fail) throw Error('failed'); });
 await expect(refresh()).rejects.toThrow('failed'); fail = false; await expect(refresh()).resolves.toBeUndefined();
});

it('preserves refresh queued during completion microtasks', async () => {
 let runs = 0; let second: Promise<void> | undefined;
 const refresh = createSerializedRefresh(async () => { if (++runs === 1) queueMicrotask(() => queueMicrotask(() => { second = refresh(); })); });
 await refresh(); await Promise.resolve(); await second; expect(runs).toBe(2);
});
