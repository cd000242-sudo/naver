import { beforeEach, describe, expect, it, vi } from 'vitest';
const collect = vi.hoisted(() => vi.fn());
vi.mock('../content/generationSourceBuilder.js', () => ({ collectKeywordMaterials: collect }));
import { discoverDailySources } from '../main/services/dailyPublishingDiscovery.js';
import type { AppConfig } from '../configManager.js';

const now = new Date('2026-10-20T09:00:00Z');
const source = { id: 'one', title: '행사 안내', url: 'https://news.example.com/one', sourceType: 'news',
  sourceTier: 'NEWS', dateStatus: 'KNOWN', pubDate: '2026-10-20', body: '행사 일정과 홍보 소식입니다. '.repeat(90) };

describe('daily discovery editorial boundary', () => {
  beforeEach(() => { collect.mockReset(); collect.mockResolvedValue({ success: true, sourceDocuments: [source] }); });
  it('does not treat fresh promotional material as an automatically selected homefeed topic', async () => {
    const complete = vi.fn(async () => JSON.stringify({ reviews: [{ sourceId: 'D1', decision: 'reject', reason: 'promotion', angle: null }] }));
    expect(await discoverDailySources('이슈', {} as AppConfig, { complete, now })).toEqual([]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('requires the chosen writer before search and never silently uses another provider', async () => {
    await expect(discoverDailySources('이슈', {} as AppConfig)).rejects.toThrow('DAILY_EDITORIAL_ENGINE_REQUIRED');
    expect(collect).not.toHaveBeenCalled();
  });
  // 2026-10-29: a search post answers the keyword — it is no longer swapped for a recent news URL.
  it('sends a non-homefeed plan to the keyword path without collecting news', async () => {
    expect(await discoverDailySources('검색', {} as AppConfig, { contentMode: 'seo', now })).toEqual([{ type: 'keyword', value: '검색' }]);
    expect(collect).not.toHaveBeenCalled();
  });
  it('respects cancellation before and during search', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(discoverDailySources('이슈', {} as AppConfig, { complete: vi.fn(), signal: controller.signal })).rejects.toThrow('DAILY_CANCELLED');
    expect(collect).not.toHaveBeenCalled();
    const late = new AbortController();
    collect.mockImplementationOnce(async () => { late.abort(); return { success: true, sourceDocuments: [source] }; });
    const complete = vi.fn();
    await expect(discoverDailySources('이슈', {} as AppConfig, { complete, signal: late.signal, now })).rejects.toThrow('DAILY_CANCELLED');
    expect(complete).not.toHaveBeenCalled();
  });
});
