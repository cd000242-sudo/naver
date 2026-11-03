import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDailyPublishingRuntime } from '../main/services/dailyPublishingRuntime.js';
import { getDailyPublishingContext } from '../main/services/dailyPublishingExecutor.js';
import type { DailyAccount } from '../main/services/dailyPublishingExecutor.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
const plan = { accountId: 'sports', categoryId: '10', enabled: true, mode: 'draft' as const,
  slots: [{ time: '07:00', count: 2 }], generator: 'app-settings', topic: 'sports news' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
interface FixtureOptions {
  ready?: boolean; paid?: boolean; busy?: boolean; paused?: boolean; safetyBusy?: boolean;
  missingAccount?: boolean; blockDiscovery?: boolean;
  config?: { defaultAiProvider?: string; imageSource?: string };
  settings?: DailyAccount['settings'];
}
async function fixture(options: FixtureOptions = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'daily-runtime-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'daily-publishing-v1.json'), JSON.stringify({ version: 1, revision: 0, plans: [plan], runs: [] }));
  const availability = vi.fn(async () => ({ ready: options.ready !== false, paid: options.paid !== false, label: 'ready' }));
  const gate = deferred();
  let discovered = 0;
  const discovery = vi.fn(async () => {
    discovered += 1;
    if (options.blockDiscovery) await gate.promise;
    return [{ type: 'url' as const, value: `https://example.com/news/${discovered}` }];
  });
  const publish = vi.fn(async (_ids: string[], supplied: Record<string, unknown>) => {
    expect(getDailyPublishingContext(supplied)?.signal?.aborted).toBe(false);
    return { success: true, results: [{ accountId: 'sports', success: true, publishMode: 'draft', draftSaved: true }] };
  });
  const assertAllowed = vi.fn(async () => { if (!(await availability()).ready) throw Error('unavailable'); });
  const runtime = createDailyPublishingRuntime({ storagePath: () => dir, availability,
    safety: () => ({ paused: options.paused === true, busy: options.safetyBusy === true, label: '' }),
    busy: () => options.busy === true, now: () => new Date('2026-10-19T22:00:00.000Z'),
    readConfig: async () => options.config || ({ defaultAiProvider: 'claude', imageSource: 'imagefx' }),
    readAccount: async id => options.missingAccount ? undefined : ({ id, blogId: 'leader_145', settings: options.settings || {} }),
    resolveCategory: async () => ({ categoryName: 'sports' }), discoverSources: discovery, publish, assertAllowed });
  cleanup.push(() => runtime.dispose());
  return { runtime, publish, discovery, gate, availability, assertAllowed, dir };
}

describe('daily publishing runtime integration', () => {
  it('discovers fresh sources and persists two actual draft acknowledgements', async () => {
    const f = await fixture(); f.runtime.start();
    await vi.waitFor(() => expect(f.publish).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs.every(run => run.status === 'confirmed')).toBe(true));
    expect(f.discovery).toHaveBeenCalledTimes(2);
    expect((await f.runtime.api.request('GET', '/v1/automations/status')).body.runs).toHaveLength(2);
  });
  it('keeps a saved plan enabled while the app is still loading', async () => {
    const f = await fixture({ ready: false }); f.runtime.start();
    await vi.waitFor(() => expect(f.availability).toHaveBeenCalled());
    expect(f.runtime.scheduler.getState().plans[0].enabled).toBe(true);
    expect(f.runtime.scheduler.getState().runs).toHaveLength(0);
    expect(f.discovery).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
  });
  it('waits for another app operation to finish without disabling the plan', async () => {
    const f = await fixture({ busy: true }); f.runtime.start();
    await vi.waitFor(() => expect(f.availability).toHaveBeenCalled());
    expect(f.runtime.scheduler.getState().plans[0].enabled).toBe(true);
    expect(f.runtime.scheduler.getState().runs).toHaveLength(0);
    expect(f.discovery).not.toHaveBeenCalled();
  });
  it.each(['stop', 'dispose'] as const)('aborts before publishing after %s during source discovery', async action => {
    const f = await fixture({ blockDiscovery: true }); f.runtime.start();
    await vi.waitFor(() => expect(f.discovery).toHaveBeenCalledOnce());
    if (action === 'stop') {
      const revision = f.runtime.scheduler.getState().revision;
      expect((await f.runtime.api.request('POST', '/v1/automations/stop', { revision, accountId: 'sports' })).status).toBe(200);
    } else f.runtime.dispose();
    f.gate.resolve();
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs[0].status).toBe('needs_review'));
    expect(f.publish).not.toHaveBeenCalled(); expect(f.discovery).toHaveBeenCalledOnce();
    // A stop cancels the rest; a closing app leaves them waiting for the next start the same day.
    expect(f.runtime.scheduler.getState().runs[1].status).toBe(action === 'stop' ? 'cancelled' : 'pending');
  });
  it('requires source and image settings before enabling a plan', async () => {
    const f = await fixture(); await f.runtime.scheduler.initialize();
    const result = await f.runtime.api.request('POST', '/v1/automations/plan', { revision: 0, plan: { ...plan, topic: '' } });
    expect(result.status).toBe(422); expect(result.body.code).toBe('DAILY_SOURCE_REQUIRED'); expect(f.publish).not.toHaveBeenCalled();
  });
  it.each([
    { paid: false }, { paused: true }, { safetyBusy: true }, { missingAccount: true },
  ])('does no source discovery or generation when a start guard fails, and keeps the posts waiting: %j', async options => {
    const f = await fixture(options); f.runtime.start();
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs).toHaveLength(2));
    expect(f.discovery).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
    expect(f.assertAllowed).not.toHaveBeenCalled();
    expect(f.runtime.scheduler.getState().plans[0].enabled).toBe(true);
    expect(f.runtime.scheduler.getState().runs.map(r => r.status)).toEqual(['pending', 'pending']);
  });
  it('keeps the PC awake only while a plan is enabled and releases it on dispose', async () => {
    const f = await fixture(); const keepAwake = vi.fn();
    const runtime = createDailyPublishingRuntime({ storagePath: () => f.dir, availability: async () => ({ ready: false, paid: true, label: '' }),
      safety: () => ({ paused: false, busy: false, label: '' }), busy: () => false, keepAwake,
      readConfig: async () => ({}), readAccount: async () => undefined, resolveCategory: async () => ({ categoryName: '' }), publish: vi.fn() });
    runtime.start();
    await vi.waitFor(() => expect(keepAwake).toHaveBeenLastCalledWith(true));
    runtime.dispose();
    expect(keepAwake).toHaveBeenLastCalledWith(false);
  });
  it.each([
    { failureCode: 'LOGIN_REQUIRED', enabled: false }, { failureCode: 'ACCOUNT_PROTECTED', enabled: false },
    { failureCode: 'IMAGE_REJECTED', enabled: true }, { failureCode: 'PUBLISH_OUTCOME_UNKNOWN', enabled: true },
  ])('stops the plan only for a block a person must clear: %j', async ({ failureCode, enabled }) => {
    const f = await fixture();
    f.publish.mockImplementation(async () => ({ success: false, results: [{ accountId: 'sports', success: false, failureCode }] }));
    f.runtime.start();
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs[0]?.status).toBe('needs_review'));
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs.some(r => r.status === 'pending' || r.status === 'inflight')).toBe(false));
    expect(f.runtime.scheduler.getState().plans[0].enabled).toBe(enabled);
    expect(f.publish).toHaveBeenCalledTimes(enabled ? 2 : 1);
  });
  it.each(['paid', 'ready', 'dispose'] as const)('rechecks %s after a durable claim before entering the executor', async guard => {
    const f = await fixture();
    let calls = 0;
    f.availability.mockImplementation(async () => {
      calls++;
      if (calls === 3 && guard === 'dispose') f.runtime.dispose();
      return { ready: guard !== 'ready' || calls < 3, paid: guard !== 'paid' || calls < 3, label: 'fixture' };
    });
    f.runtime.start();
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs[0]?.status).toBe('needs_review'));
    expect(f.discovery).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
    expect(f.assertAllowed).not.toHaveBeenCalled();
  });
  it.each([
    { missingAccount: true }, { paused: true }, { safetyBusy: true },
    { config: { imageSource: 'imagefx' } },
    { config: { defaultAiProvider: 'unsupported', imageSource: 'imagefx' } },
    { config: { defaultAiProvider: 'claude' } },
    { config: { defaultAiProvider: 'claude', imageSource: 'skip' } },
  ])('refuses an enabled plan with invalid account or provider settings: %j', async options => {
    const f = await fixture(options);
    const result = await f.runtime.api.request('POST', '/v1/automations/plan', { revision: 0, plan });
    expect(result.status).toBe(422);
    expect(f.runtime.scheduler.getState().revision).toBe(0);
    expect(f.discovery).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
  });
  it('allows disabling a saved plan despite invalid provider and source settings', async () => {
    const f = await fixture({ config: {}, paused: true });
    const result = await f.runtime.api.request('POST', '/v1/automations/plan', { revision: 0, plan: { ...plan, enabled: false, topic: '' } });
    expect(result.status).toBe(200);
    expect(f.runtime.scheduler.getState().plans[0].enabled).toBe(false);
    expect(f.publish).not.toHaveBeenCalled();
  });
  it.each([
    { keywords: [' ', 'sports'] }, { keywords: [' '], urls: [' ', 'https://example.com/news'] },
  ])('accepts configured source lists and an account image provider: %j', async settings => {
    const f = await fixture({ config: {}, settings: { ...settings, imageSource: 'imagefx' } });
    const result = await f.runtime.api.request('POST', '/v1/automations/plan', {
      revision: 0, plan: { ...plan, topic: '', generator: 'claude' },
    });
    expect(result.status).toBe(200); expect(f.publish).not.toHaveBeenCalled();
  });
  it.each([{ ready: false, status: 422 }, { ready: true, status: 200 }])('checks the image engine login before saving: %j', async ({ ready, status }) => {
    const f = await fixture(); const imageEngineReady = vi.fn(async () => ready);
    const runtime = createDailyPublishingRuntime({ storagePath: () => f.dir, availability: async () => ({ ready: true, paid: true, label: '' }),
      safety: () => ({ paused: false, busy: false, label: '' }), busy: () => false, imageEngineReady,
      readConfig: async () => ({ defaultAiProvider: 'claude', imageSource: 'flow' }),
      readAccount: async id => ({ id, blogId: 'leader_145', settings: {} }), resolveCategory: async () => ({ categoryName: 'sports' }), publish: vi.fn() });
    const result = await runtime.api.request('POST', '/v1/automations/plan', { revision: 0, plan });
    expect(result.status).toBe(status);
    expect(imageEngineReady).toHaveBeenCalledWith('flow');
    if (!ready) expect(result.body.code).toBe('DAILY_IMAGE_ENGINE_LOGIN_REQUIRED');
  });
  it('offers free engines first and never the closed ImageFX or unrouted engines', async () => {
    const f = await fixture();
    const ids = (await f.runtime.api.request('GET', '/v1/automations/status')).body.imageProviders.map((p: { id: string }) => p.id);
    expect(ids.slice(0, 3)).toEqual(['flow', 'genspark', 'dropshot']);
    for (const closed of ['imagefx', 'gemini', 'imagen', 'pexels', 'unsplash']) expect(ids).not.toContain(closed);
  });
  it('does not start a duplicate timer or a second batch on repeated start', async () => {
    const f = await fixture(); f.runtime.start(); f.runtime.start();
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs.filter(r => r.status === 'confirmed')).toHaveLength(2));
    expect(f.publish).toHaveBeenCalledTimes(2);
    f.runtime.dispose(); f.runtime.dispose();
  });
  it('remains stopped when the scheduler is manually ticked after dispose', async () => {
    const f = await fixture();
    await f.runtime.scheduler.initialize(); f.runtime.dispose();
    await f.runtime.scheduler.tick();
    expect(f.publish).not.toHaveBeenCalled(); expect(f.discovery).not.toHaveBeenCalled();
  });
  it('logs a safe warning and starts no paid work when durable state is corrupt', async () => {
    const f = await fixture();
    await writeFile(path.join(f.dir, 'daily-publishing-v1.json'), '{private-token');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cleanup.push(() => { warning.mockRestore(); });
    f.runtime.start();
    await vi.waitFor(() => expect(warning).toHaveBeenCalledOnce());
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private-token');
    expect(f.publish).not.toHaveBeenCalled(); expect(f.discovery).not.toHaveBeenCalled();
  });
  it.each(['stop', 'dispose'] as const)('checks cancellation after the final permission await on %s', async action => {
    const f = await fixture();
    const blocked = deferred();
    f.assertAllowed.mockResolvedValueOnce(undefined).mockImplementationOnce(() => blocked.promise);
    f.runtime.start();
    await vi.waitFor(() => expect(f.assertAllowed).toHaveBeenCalledTimes(2));
    if (action === 'stop') {
      const revision = f.runtime.scheduler.getState().revision;
      expect((await f.runtime.api.request('POST', '/v1/automations/stop', { revision, accountId: 'sports' })).status).toBe(200);
    } else f.runtime.dispose();
    blocked.resolve();
    await vi.waitFor(() => expect(f.runtime.scheduler.getState().runs[0].status).toBe('needs_review'));
    expect(f.publish).not.toHaveBeenCalled();
  });
});
