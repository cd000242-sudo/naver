import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDailyPublishingRuntime } from '../main/services/dailyPublishingRuntime.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
const NOW = new Date('2026-10-19T22:00:00.000Z'); // 2026-10-20 07:00 KST
const plan = { accountId: 'sports', categoryId: '10', enabled: true, mode: 'draft' as const,
  slots: [{ time: '07:00', count: 1 }], generator: 'app-settings', topic: 'sports news' };
const run = (key: string, date: string, time: string, status: string, reason?: string) => ({ key, accountId: 'sports', date, time, ordinal: 1,
  status, ...(reason ? { reason } : {}), createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z' });

async function fixture(options: { enabled?: boolean; runs?: unknown[]; busy?: boolean; paused?: boolean } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'daily-lane-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const saved = { version: 1, revision: 0, plans: [{ ...plan, enabled: options.enabled !== false }], runs: options.runs || [] };
  await writeFile(path.join(dir, 'daily-publishing-v1.json'), JSON.stringify(saved));
  const notify = vi.fn();
  const publish = vi.fn(async () => ({ success: true, results: [{ accountId: 'sports', success: true, publishMode: 'draft', draftSaved: true }] }));
  const runtime = createDailyPublishingRuntime({ storagePath: () => dir, availability: async () => ({ ready: true, paid: true, label: 'ready' }),
    safety: () => ({ paused: options.paused === true, busy: false, label: '' }), busy: () => options.busy === true, now: () => NOW, notify,
    readConfig: async () => ({ defaultAiProvider: 'claude', imageSource: 'imagefx' }),
    readAccount: async id => ({ id, blogId: 'leader_145', settings: {} }), resolveCategory: async () => ({ categoryName: 'sports' }),
    discoverSources: async () => [{ type: 'url' as const, value: 'https://example.com/news/1' }], publish, assertAllowed: async () => undefined });
  cleanup.push(() => runtime.dispose());
  await runtime.scheduler.initialize();
  return { runtime, notify, publish };
}

describe('daily runtime lane signals', () => {
  it('reports whether a plan is on and when the next post is due', async () => {
    const on = await fixture();
    expect(on.runtime.hasEnabledPlan()).toBe(true);
    expect(on.runtime.nextPublishAt()).not.toBeNull();
    const off = await fixture({ enabled: false });
    expect(off.runtime.hasEnabledPlan()).toBe(false);
    expect(off.runtime.nextPublishAt()).toBeNull();
  });

  it('a waiting post is "due" for the lane, but not when its account is paused', async () => {
    const waiting = [run('sports:2026-10-20:0700:1', '2026-10-20', '07:00', 'pending')];
    const f = await fixture({ runs: waiting, busy: true });
    expect(f.runtime.hasDuePending()).toBe(true);
    expect(f.runtime.isExecuting()).toBe(false);
    const paused = await fixture({ runs: waiting, paused: true });
    paused.runtime.start();
    await vi.waitFor(() => expect(paused.runtime.hasDuePending()).toBe(false));
    expect(paused.publish).not.toHaveBeenCalled();
  });

  it('announces a slot that expired while the lane was busy, once, and not slots missed before this run', async () => {
    const f = await fixture({ runs: [
      run('sports:2026-10-17:0600:1', '2026-10-17', '06:00', 'cancelled', 'deadline_missed'),
      run('sports:2026-10-18:0700:1', '2026-10-18', '07:00', 'pending'),
    ] });
    f.runtime.start();
    await vi.waitFor(() => expect(f.notify).toHaveBeenCalled());
    const missed = f.notify.mock.calls.filter(call => String(call[0]).includes('놓쳤습니다'));
    expect(missed).toHaveLength(1);
    expect(missed[0][1]).toContain('07:00');
    expect(missed[0][1]).not.toContain('06:00');
  });
});
