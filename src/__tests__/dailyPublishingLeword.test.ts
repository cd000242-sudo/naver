import { describe, expect, it, vi } from 'vitest';
import { validateDailyPlans } from '../scheduler/dailyPublishingModel.js';
import { DAILY_LEWORD_TOPICS } from '../scheduler/dailyLewordTopics.js';
import { createDailyPublishingExecutor, getDailyPublishingContext } from '../main/services/dailyPublishingExecutor.js';
import { createDailyPublishingIpc } from '../main/ipc/dailyPublishingHandlers.js';

const plan = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'account-1', categoryId: '1', enabled: true, mode: 'publish',
  slots: [{ time: '07:00', count: 2 }], generator: 'app-settings', topic: '', ...overrides,
});
const leword = (topics: string[] = ['자동차']) => ({ type: 'leword-today-picks' as const, topics });

describe('daily plan LEWORD fields', () => {
  it('keeps old plans exactly as they were (no new keys appear)', () => {
    const [saved] = validateDailyPlans([plan()]);
    expect(saved).toEqual({ ...plan(), imageMode: 'ai-generated' });
    expect(saved).not.toHaveProperty('keywordSource');
    expect(saved).not.toHaveProperty('contentMode');
  });
  it('accepts keywordSource with an empty or missing topic and a content mode', () => {
    const [saved] = validateDailyPlans([plan({ keywordSource: leword(['자동차', '맛집']), contentMode: 'seo' })]);
    expect(saved.keywordSource).toEqual(leword(['자동차', '맛집']));
    expect(saved.contentMode).toBe('seo');
    const { topic: _topic, ...withoutTopic } = plan({ keywordSource: leword(), contentMode: 'homefeed' });
    expect(validateDailyPlans([withoutTopic])[0].topic).toBe('');
  });
  it('requires a topic when there is no keywordSource', () => {
    const { topic: _topic, ...withoutTopic } = plan();
    expect(() => validateDailyPlans([withoutTopic])).toThrow('DAILY_PLAN_INVALID');
  });
  it.each([
    { keywordSource: { type: 'other', topics: ['자동차'] } },
    { keywordSource: { type: 'leword-today-picks', topics: [] } },
    { keywordSource: { type: 'leword-today-picks', topics: ['자동차', '맛집', '게임', '영화'] } },
    { keywordSource: { type: 'leword-today-picks', topics: ['없는 주제'] } },
    { keywordSource: { type: 'leword-today-picks', topics: ['자동차', '자동차'] } },
    { keywordSource: { type: 'leword-today-picks', topics: [3] } },
    { keywordSource: { type: 'leword-today-picks', topics: ['자동차'], url: 'https://x.test' } },
    { keywordSource: 'leword-today-picks' }, { keywordSource: null },
    { contentMode: 'mate' }, { contentMode: '' },
  ])('rejects invalid LEWORD input: %j', (change) => {
    expect(() => validateDailyPlans([plan(change)])).toThrow('DAILY_PLAN_INVALID');
  });
  it('ships the 32 Naver topic names without duplicates', () => {
    expect(DAILY_LEWORD_TOPICS).toHaveLength(32);
    expect(new Set(DAILY_LEWORD_TOPICS).size).toBe(32);
  });
});

function setup(contentMode?: string) {
  const publish = vi.fn(async (_ids: string[], _options: Record<string, unknown>) => ({
    success: true, results: [{ accountId: 'a', success: true, publishMode: 'publish', url: 'https://blog.naver.com/myblog/12345' }],
  }));
  const lewordKeywords = vi.fn(async (_request: { topics: string[]; accountId: string; limit: number; includeUsed?: boolean }) => ['황금 키워드', '둘째 키워드']);
  const deps = {
    readConfig: async () => ({ defaultAiProvider: 'agent-codex', imageSource: 'openai-image' }),
    readAccount: async (_id: string) => ({ id: 'a', blogId: 'myblog', settings: { keywords: ['계정 키워드'], ...(contentMode ? { contentMode } : {}) } }),
    resolveCategory: async (_id: string, _category: string) => ({ categoryName: '자동차' }),
    reserveSource: vi.fn(async (_id: string, _fingerprint: string, _job: string) => true),
    lewordKeywords, publish,
  };
  const job = { id: 'day-slot-1', accountId: 'a', categoryId: '12', mode: 'publish' as const, generator: 'app-settings', keywordSource: leword(['자동차']) };
  return { deps, publish, lewordKeywords, job };
}

describe('executor with a LEWORD keyword source', () => {
  it('writes about the supplier keyword instead of the account keywords', async () => {
    const { deps, publish, lewordKeywords, job } = setup();
    await createDailyPublishingExecutor(deps)(job);
    expect(lewordKeywords).toHaveBeenCalledWith(expect.objectContaining({ topics: ['자동차'], accountId: 'a', includeUsed: false }));
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source).toEqual({ type: 'keyword', value: '황금 키워드' });
  });
  it('reserves through the same claim path and moves on when the keyword was claimed meanwhile', async () => {
    const { deps, publish, job } = setup();
    deps.reserveSource.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await createDailyPublishingExecutor(deps)(job);
    expect(deps.reserveSource).toHaveBeenCalledTimes(2);
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source.value).toBe('둘째 키워드');
  });
  it('ignores the free-text topic when a keyword source is set', async () => {
    const { deps, publish, job } = setup();
    await createDailyPublishingExecutor(deps)({ ...job, topic: '직접 입력한 줄' });
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source.value).toBe('황금 키워드');
  });
  it('lets the plan content mode win over the account setting', async () => {
    const seo = setup('homefeed');
    await createDailyPublishingExecutor(seo.deps)({ ...seo.job, contentMode: 'seo' });
    expect(seo.publish.mock.calls[0][1]).toMatchObject({ contentMode: 'seo' });
    const home = setup('seo');
    await createDailyPublishingExecutor(home.deps)({ ...home.job, contentMode: 'homefeed' });
    expect(home.publish.mock.calls[0][1]).toMatchObject({ contentMode: 'homefeed' });
    const legacy = setup('seo');
    await createDailyPublishingExecutor(legacy.deps)(legacy.job);
    expect(legacy.publish.mock.calls[0][1]).toMatchObject({ contentMode: 'seo' });
  });
  it('hands the effective content mode to source discovery', async () => {
    const { deps, job } = setup('homefeed');
    const discoverSources = vi.fn(async (keyword: string) => [{ type: 'keyword' as const, value: keyword }]);
    await createDailyPublishingExecutor({ ...deps, discoverSources })({ ...job, contentMode: 'seo' });
    expect(discoverSources).toHaveBeenCalledWith('황금 키워드', expect.anything(), expect.objectContaining({ contentMode: 'seo' }));
  });
  it('searches related keywords from used picks, then stops, when every pick was used (search mode)', async () => {
    const { deps, publish, lewordKeywords, job } = setup();
    lewordKeywords.mockImplementation(async request => request.includeUsed ? ['쓴 키워드'] : []);
    const expandKeywords = vi.fn(async (_keyword: string) => ['연관 검색어']);
    await createDailyPublishingExecutor({ ...deps, expandKeywords })({ ...job, contentMode: 'seo' });
    expect(expandKeywords).toHaveBeenCalledWith('쓴 키워드');
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source.value).toBe('연관 검색어');
  });
  it('ends in KEYWORDS_EXHAUSTED when picks are used up and the plan says stop', async () => {
    const { deps, publish, lewordKeywords, job } = setup();
    lewordKeywords.mockResolvedValue([]);
    const expandKeywords = vi.fn(async () => ['연관 검색어']);
    await expect(createDailyPublishingExecutor({ ...deps, expandKeywords })({ ...job, contentMode: 'seo', keywordExhaustion: 'stop' })).rejects.toThrow('KEYWORDS_EXHAUSTED');
    expect(expandKeywords).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it('ends in KEYWORDS_EXHAUSTED when picks and related searches are all gone', async () => {
    const { deps, lewordKeywords, job } = setup();
    lewordKeywords.mockResolvedValue([]);
    await expect(createDailyPublishingExecutor(deps)({ ...job, contentMode: 'seo' })).rejects.toThrow('KEYWORDS_EXHAUSTED');
  });
  it('uses the existing source-exhausted path for home-feed plans without news material', async () => {
    const { deps, publish, job } = setup();
    await expect(createDailyPublishingExecutor({ ...deps, discoverSources: async () => [] })({ ...job, contentMode: 'homefeed' })).rejects.toThrow('SOURCE_EXHAUSTED');
    expect(publish).not.toHaveBeenCalled();
  });
  it('bounds news lookups per post in home-feed mode', async () => {
    const { deps, lewordKeywords, job } = setup();
    await expect(createDailyPublishingExecutor({ ...deps, discoverSources: async () => [] })({ ...job, contentMode: 'homefeed' })).rejects.toThrow();
    expect(lewordKeywords.mock.calls[0][0].limit).toBeLessThanOrEqual(5);
  });
  it('plans without a keyword source never call the supplier', async () => {
    const { deps, lewordKeywords, job } = setup();
    const { keywordSource: _unused, ...legacy } = job;
    await createDailyPublishingExecutor(deps)(legacy);
    expect(lewordKeywords).not.toHaveBeenCalled();
  });
});

describe('LEWORD preview IPC', () => {
  const fixture = () => {
    const previewLeword = vi.fn(async (_request: { topics: string[]; accountId: string; limit: number }) => ({ builtAt: '2026-11-03T01:00:00.000Z', stale: false, candidates: [{ keyword: 'k', topic: '자동차' }] }));
    const request = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const ensure = vi.fn(async () => ({ request }));
    return { previewLeword, request, ensure, invoke: createDailyPublishingIpc({ trusted: (event) => event === 'main', ensure, previewLeword }) };
  };
  const path = '/v1/automations/leword-preview';
  it('denies untrusted senders', async () => {
    const f = fixture();
    expect((await f.invoke('iframe', 'POST', path, { accountId: 'a', topics: ['자동차'] })).status).toBe(403);
    expect(f.previewLeword).not.toHaveBeenCalled();
  });
  it('returns five candidates for the plan topics without touching the scheduler', async () => {
    const f = fixture();
    const reply = await f.invoke('main', 'POST', path, { accountId: 'a', topics: ['자동차', '맛집'] });
    expect(reply).toMatchObject({ status: 200, body: { ok: true, builtAt: '2026-11-03T01:00:00.000Z', stale: false } });
    expect(f.previewLeword).toHaveBeenCalledWith({ accountId: 'a', topics: ['자동차', '맛집'], limit: 5 });
    expect(f.ensure).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
  it.each([
    { accountId: 'a', topics: [] }, { accountId: 'a', topics: ['없는 주제'] }, { accountId: '../x', topics: ['자동차'] },
    { topics: ['자동차'] }, { accountId: 'a', topics: ['자동차'], limit: 500 }, 'text',
  ])('rejects a bad preview request: %j', async (body) => {
    const f = fixture();
    expect((await f.invoke('main', 'POST', path, body)).status).toBe(400);
    expect(f.previewLeword).not.toHaveBeenCalled();
  });
  it('only allows POST and reports an outage without leaking the cause', async () => {
    const f = fixture();
    expect((await f.invoke('main', 'GET', path)).status).toBe(400);
    f.previewLeword.mockRejectedValueOnce(new Error('secret-local-path'));
    const out = await f.invoke('main', 'POST', path, { accountId: 'a', topics: ['자동차'] });
    expect(out.status).toBe(503); expect(JSON.stringify(out)).not.toContain('secret-local-path');
  });
});
