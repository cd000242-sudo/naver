import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDailyPublishingExecutor, getDailyPublishingContext } from '../main/services/dailyPublishingExecutor';
import { discoverDailySources, expandDailyKeywords } from '../main/services/dailyPublishingDiscovery';
import { createDailyPublishingRuntime } from '../main/services/dailyPublishingRuntime';
import { validateDailyPlans } from '../scheduler/dailyPublishingModel';

/**
 * 2026-10-29: search (seo) and mate plans write from the keyword itself; once every keyword was used they either
 * expand with related searches or stop and notify — the plan chooses (사장님 "둘 다 가능하도록").
 */
function executorSetup(contentMode: string, keywords: string[] = ['전세대출 조건']) {
  const used = new Set<string>();
  const publish = vi.fn(async () => ({ success: true, results: [{ accountId: 'a', success: true, publishMode: 'publish', url: 'https://blog.naver.com/myblog/1' }] }));
  const deps = {
    readConfig: async () => ({ defaultAiProvider: 'agent-codex', imageSource: 'flow' }),
    readAccount: async () => ({ id: 'a', blogId: 'myblog', settings: { contentMode } }),
    resolveCategory: async () => ({ categoryName: '부동산' }),
    reserveSource: vi.fn(async (_id: string, fingerprint: string) => { if (used.has(fingerprint)) return false; used.add(fingerprint); return true; }),
    discoverSources: vi.fn(async (topic: string) => (contentMode === 'homefeed' ? [] : [{ type: 'keyword' as const, value: topic }])),
    expandKeywords: vi.fn(async () => ['전세대출 조건 2026', '전세대출 한도']),
    publish,
  };
  const job = (id: string, extra: Record<string, unknown> = {}) => ({ id, accountId: 'a', categoryId: '12', mode: 'publish' as const, generator: 'app-settings', topic: keywords.join('\n'), ...extra });
  return { deps, publish, job };
}

describe('search and mate daily sources', () => {
  it('a search/mate plan is written from the keyword itself, without news collection', async () => {
    for (const contentMode of ['seo', 'mate']) {
      expect(await discoverDailySources(' 전세대출 조건 ', {} as never, { contentMode })).toEqual([{ type: 'keyword', value: '전세대출 조건' }]);
    }
  });
  it('homefeed still needs the editorial engine', async () => {
    await expect(discoverDailySources('주제', {} as never, { contentMode: 'homefeed' })).rejects.toThrow('DAILY_EDITORIAL_ENGINE_REQUIRED');
  });
  it('expands with real autocomplete queries two levels deep, without the keyword or repeats', async () => {
    const suggest = vi.fn(async (keyword: string) => ({
      '전세대출': ['전세대출 조건', '전세대출', '전세대출 금리'],
      '전세대출 조건': ['전세대출 조건 2026', '전세대출  금리'],
      '전세대출 금리': ['전세대출 금리 비교'],
    } as Record<string, string[]>)[keyword] || []);
    expect(await expandDailyKeywords('전세대출', suggest)).toEqual(['전세대출 조건', '전세대출 금리', '전세대출 조건 2026', '전세대출 금리 비교']);
    expect(await expandDailyKeywords('전세대출', suggest, 2)).toHaveLength(2);
    expect(await expandDailyKeywords('x', async () => { throw new Error('offline'); })).toEqual([]);
  });
});

describe('when every keyword was used', () => {
  it('expand: uses the listed keyword first, then related searches in order', async () => {
    const f = executorSetup('seo');
    const run = createDailyPublishingExecutor(f.deps);
    await run(f.job('1'));
    await run(f.job('2'));
    await run(f.job('3'));
    expect(f.publish.mock.calls.map(call => getDailyPublishingContext((call as any)[1])?.source.value)).toEqual(['전세대출 조건', '전세대출 조건 2026', '전세대출 한도']);
    await expect(run(f.job('4'))).rejects.toThrow('KEYWORDS_EXHAUSTED');
  });
  it('stop: never expands and reports the keywords as used up', async () => {
    const f = executorSetup('mate');
    const run = createDailyPublishingExecutor(f.deps);
    await run(f.job('1', { keywordExhaustion: 'stop' }));
    await expect(run(f.job('2', { keywordExhaustion: 'stop' }))).rejects.toThrow('KEYWORDS_EXHAUSTED');
    expect(f.deps.expandKeywords).not.toHaveBeenCalled();
  });
  it('homefeed keeps its news-based meaning: no keyword expansion, ordinary source exhaustion', async () => {
    const f = executorSetup('homefeed');
    await expect(createDailyPublishingExecutor(f.deps)(f.job('1'))).rejects.toThrow('SOURCE_EXHAUSTED');
    expect(f.deps.expandKeywords).not.toHaveBeenCalled();
  });
  it('the plan stops with the reason shown and the owner is notified', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'daily-keywords-'));
    try {
      const plan = { accountId: 'a', categoryId: '10', enabled: true, mode: 'draft', slots: [{ time: '07:00', count: 1 }], generator: 'app-settings', topic: '전세대출 조건', keywordExhaustion: 'stop' };
      await writeFile(path.join(dir, 'daily-publishing-v1.json'), JSON.stringify({ version: 1, revision: 0, plans: [plan], runs: [] }));
      await writeFile(path.join(dir, 'daily-source-claims-v1.json'), '{}');
      const notify = vi.fn();
      const runtime = createDailyPublishingRuntime({ storagePath: () => dir, availability: async () => ({ ready: true, paid: true, label: '' }),
        safety: () => ({ paused: false, busy: false, label: '' }), busy: () => false, now: () => new Date('2026-10-19T22:00:00.000Z'), notify,
        readConfig: async () => ({ defaultAiProvider: 'claude', imageSource: 'flow' }),
        readAccount: async id => ({ id, blogId: 'myblog', settings: { contentMode: 'seo' } }), resolveCategory: async () => ({ categoryName: 'x' }),
        discoverSources: async () => [], assertAllowed: async () => {}, publish: vi.fn() });
      runtime.start();
      // Real file I/O + scheduler tick: the 1s default budget flaked under the full parallel suite (2026-11-03).
      await vi.waitFor(() => expect(runtime.scheduler.getState().runs[0]?.reason).toBe('keywords_exhausted'), { timeout: 10_000 });
      expect(runtime.scheduler.getState().plans[0].enabled).toBe(false);
      expect(notify).toHaveBeenCalledWith('매일 자동발행이 멈췄습니다', expect.stringContaining('키워드를 모두 썼습니다'));
      runtime.dispose();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('accepts only expand or stop', () => {
    const plan = { accountId: 'a', categoryId: '1', enabled: true, mode: 'draft', slots: [{ time: '20:00', count: 1 }], generator: 'app-settings', topic: 't' };
    expect(validateDailyPlans([{ ...plan, keywordExhaustion: 'stop' }])[0].keywordExhaustion).toBe('stop');
    expect(validateDailyPlans([plan])[0]).not.toHaveProperty('keywordExhaustion');
    expect(() => validateDailyPlans([{ ...plan, keywordExhaustion: 'forever' }])).toThrow('DAILY_PLAN_INVALID');
  });
});
