import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { AutomationService } from '../main/services/AutomationService';
import { createDailyPublishingExecutor, getDailyPublishingContext, assertDailyPublishingImages, bindDailyPublishingCancellation, assertDailyScheduleDeadline } from '../main/services/dailyPublishingExecutor';

function setup() {
  const publish = vi.fn(async (_ids: string[], _options: Record<string, unknown>) => ({
    success: true, results: [{ accountId: 'a', success: true, publishMode: 'publish', url: 'https://blog.naver.com/myblog/12345' }],
  }));
  const deps = {
    readConfig: async () => ({ defaultAiProvider: 'agent-codex', imageSource: 'openai-image' }),
    readAccount: async (_id: string) => ({ id: 'a', blogId: 'myblog', settings: { keywords: ['첫 소재', '다음 소재'] } }),
    resolveCategory: async (_id: string, _category: string) => ({ categoryName: '자동차' }),
    reserveSource: vi.fn(async (_id: string, _fingerprint: string, _job: string) => true),
    publish,
  };
  return { deps, publish, job: { id: 'day-slot-1', accountId: 'a', categoryId: '12', mode: 'publish' as const, generator: 'app-settings' } };
}

describe('daily publishing executor', () => {
  it('uses the explicitly configured app writer and private source context without changing account settings', async () => {
    const { deps, publish, job } = setup();
    const result = await createDailyPublishingExecutor(deps)(job);
    expect(result).toMatchObject({ confirmed: true, publishedUrl: 'https://blog.naver.com/myblog/12345' });
    const [ids, options] = publish.mock.calls[0];
    expect(ids).toEqual(['a']);
    expect(options).toMatchObject({ generator: 'agent-codex', publishMode: 'publish', categoryName: '자동차', categoryId: '12', scheduleDate: undefined, headingImageMode: 'all' });
    expect(getDailyPublishingContext(options)).toMatchObject({ jobId: job.id, source: { type: 'keyword', value: '첫 소재' } });
    expect(getDailyPublishingContext({ ...options, dailyPublishingJobID: job.id })).toBeUndefined();
  });

  it('skips used material and reserves the next source before publishing', async () => {
    const { deps, publish, job } = setup();
    deps.reserveSource.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await createDailyPublishingExecutor(deps)(job);
    expect(deps.reserveSource).toHaveBeenCalledTimes(2);
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source.value).toBe('다음 소재');
  });

  it('uses discovered concrete source URLs and skips already used articles', async () => {
    const { deps, publish, job } = setup();
    deps.reserveSource.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const discoverSources = vi.fn(async () => [{ type: 'url' as const, value: 'https://example.com/old' }, { type: 'url' as const, value: 'https://example.com/new' }]);
    await createDailyPublishingExecutor({ ...deps, discoverSources })({ ...job, topic: '자동차 신차' });
    expect(discoverSources).toHaveBeenCalledWith('자동차 신차', expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: job.id }));
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source).toEqual({ type: 'url', value: 'https://example.com/new' });
  });

  it('does not fall back to stale keywords when fresh discovery returns no article', async () => {
    const { deps, publish, job } = setup();
    await expect(createDailyPublishingExecutor({ ...deps, discoverSources: async () => [] })({ ...job, topic: '자동차' })).rejects.toThrow('SOURCE_EXHAUSTED');
    expect(publish).not.toHaveBeenCalled();
  });

  it('discovers fresh URLs for account keywords when topic is empty', async () => {
    const { deps, publish, job } = setup();
    const discoverSources = vi.fn(async (topic: string) => [{ type: 'url' as const, value: `https://example.com/${encodeURIComponent(topic)}` }]);
    await createDailyPublishingExecutor({ ...deps, discoverSources })(job);
    expect(discoverSources).toHaveBeenCalledWith('첫 소재', expect.objectContaining({ id: 'a' }), job);
    expect(getDailyPublishingContext(publish.mock.calls[0][1])?.source.type).toBe('url');
  });

  it('preserves a private abort signal through the main publishing boundary', async () => {
    const { deps, publish, job } = setup();
    const abort = new AbortController();
    await createDailyPublishingExecutor(deps)({ ...job, signal: abort.signal });
    const context = getDailyPublishingContext(publish.mock.calls[0][1]);
    expect(context?.signal).toBe(abort.signal);
    abort.abort();
    expect(context?.signal?.aborted).toBe(true);
  });

  it('uses a supplied article identity to deduplicate the same title across URLs', async () => {
    const { deps, job } = setup();
    const execute = createDailyPublishingExecutor(deps);
    await execute({ ...job, source: { type: 'url', value: 'https://example.com/one', identity: '동일 신차 발표' } });
    await execute({ ...job, source: { type: 'url', value: 'https://other.example.com/two', identity: '동일 신차 발표' } });
    expect(deps.reserveSource.mock.calls[0][1]).not.toBe(deps.reserveSource.mock.calls[2][1]);
    expect(deps.reserveSource.mock.calls[1][1]).toBe(deps.reserveSource.mock.calls[3][1]);
  });

  it('never reuses the same source URL when its title changes', async () => {
    const { deps, publish, job } = setup(); const used = new Set<string>();
    deps.reserveSource.mockImplementation(async (_account, fingerprint) => {
      if (used.has(fingerprint)) return false;
      used.add(fingerprint); return true;
    });
    const execute = createDailyPublishingExecutor(deps);
    await execute({ ...job, source: { type: 'url', value: 'https://example.com/article?utm_source=one', identity: '원래 제목' } });
    await expect(execute({ ...job, source: { type: 'url', value: 'https://example.com/article?utm_source=two', identity: '수정한 제목' } })).rejects.toThrow('SOURCE_EXHAUSTED');
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('reports exhausted material instead of reusing a topic', async () => {
    const { deps, publish, job } = setup();
    deps.reserveSource.mockResolvedValue(false);
    await expect(createDailyPublishingExecutor(deps)({ ...job, topic: '한 소재' })).rejects.toThrow('SOURCE_EXHAUSTED');
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not silently use Gemini when the app writer is missing or unsupported', async () => {
    const { deps, publish, job } = setup();
    deps.readConfig = async () => ({ defaultAiProvider: '', imageSource: 'openai-image' });
    await expect(createDailyPublishingExecutor(deps)(job)).rejects.toThrow('GENERATOR_REQUIRED');
    await expect(createDailyPublishingExecutor(deps)({ ...job, generator: 'unknown' })).rejects.toThrow('GENERATOR_REQUIRED');
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not default to a paid image provider when image settings are absent', async () => {
    const { deps, publish, job } = setup();
    deps.readConfig = async () => ({ defaultAiProvider: 'openai', imageSource: '' });
    await expect(createDailyPublishingExecutor(deps)(job)).rejects.toThrow('IMAGE_PROVIDER_REQUIRED');
    expect(publish).not.toHaveBeenCalled();
  });

  it('requires individual confirmed results and a concrete URL for the selected blog', async () => {
    const { deps, publish, job } = setup();
    publish.mockResolvedValueOnce({ success: true, results: [{ accountId: 'a', success: true, publishMode: 'publish', url: 'https://blog.naver.com/myblog' }] });
    expect((await createDailyPublishingExecutor(deps)(job)).confirmed).toBe(false);
    publish.mockResolvedValueOnce({ success: true, results: [{ accountId: 'a', success: true, publishMode: 'publish', url: 'https://blog.naver.com/other/12345' }] });
    expect((await createDailyPublishingExecutor(deps)(job)).confirmed).toBe(false);
  });

  it('normalizes a configured Naver blog URL before checking the actual publication target', async () => {
    const { deps, job } = setup();
    const readAccount = async () => ({ id: 'a', blogId: 'https://blog.naver.com/MyBlog', naverId: 'different-login', settings: { keywords: ['소재'] } });
    expect(await createDailyPublishingExecutor({ ...deps, readAccount })(job)).toMatchObject({ confirmed: true, publishedUrl: 'https://blog.naver.com/myblog/12345' });
  });

  it('rejects an unknown destination before reserving material or publishing', async () => {
    const { deps, publish, job } = setup();
    const readAccount = async () => ({ id: 'a', blogId: '', naverId: 'login-only', settings: { keywords: ['소재'] } });
    await expect(createDailyPublishingExecutor({ ...deps, readAccount })(job)).rejects.toThrow('DAILY_BLOG_ID_REQUIRED');
    expect(deps.reserveSource).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  });

  it.each(['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED'])('propagates %s as a stop of all daily accounts', async code => {
    const { deps, publish, job } = setup();
    publish.mockResolvedValueOnce({ success: true, results: [{ accountId: 'a', success: false, publishMode: 'publish', failureCode: code } as never] });
    expect(await createDailyPublishingExecutor(deps)(job)).toMatchObject({ confirmed: false, code, stopAll: true });
  });

  it('accepts draft completion only when the engine explicitly confirms saving', async () => {
    const { deps, publish, job } = setup();
    const execute = createDailyPublishingExecutor(deps);
    publish.mockResolvedValueOnce({ success: true, results: [{ accountId: 'a', success: true, publishMode: 'draft', url: '' }] });
    expect((await execute({ ...job, mode: 'draft' })).confirmed).toBe(false);
    publish.mockResolvedValueOnce({ success: true, results: [{ accountId: 'a', success: true, publishMode: 'draft', draftSaved: true } as never] });
    expect(await execute({ ...job, mode: 'draft' })).toMatchObject({ confirmed: true, draftSaved: true });
  });

  it('does not publish an aborted job', async () => {
    const { deps, publish, job } = setup();
    const abort = new AbortController(); abort.abort();
    await expect(createDailyPublishingExecutor(deps)({ ...job, signal: abort.signal })).rejects.toThrow('DAILY_CANCELLED');
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('daily image boundary', () => {
  const article = { selectedTitle: '제목', headings: ['하나', '둘', '셋', '넷'].map(title => ({ title })) };
  const images = [{ isThumbnail: true, heading: '제목' }, ...article.headings.map(h => ({ heading: h.title }))]
    .map((image, i) => ({ ...image, filePath: `/mock/${i}.png`, provider: 'openai-image', width: 800, height: 800 }));
  it('requires five distinct existing images and every final heading slot', () => {
    expect(() => assertDailyPublishingImages(article, images, () => true)).not.toThrow();
    expect(() => assertDailyPublishingImages(article, images.slice(0, 4), () => true)).toThrow('DAILY_IMAGE_REVIEW');
    expect(() => assertDailyPublishingImages(article, images, () => false)).toThrow('DAILY_IMAGE_REVIEW');
    expect(() => assertDailyPublishingImages(article, images.map(i => ({ ...i, filePath: '/same.png' })), () => true)).toThrow('DAILY_IMAGE_REVIEW');
    expect(() => assertDailyPublishingImages({ ...article, headings: [{ title: '바뀜' }, ...article.headings.slice(1)] }, images, () => true)).toThrow('DAILY_IMAGE_REVIEW');
  });
});

describe('main daily final execution boundary', () => {
  it('refuses an aborted job before image checking or saving/publishing', async () => {
    const source = readFileSync('src/main.ts', 'utf8').replace(/\r\n/gu, '\n');
    const start = source.indexOf('          execute: async (approvedPayload) => {', source.indexOf('const handleMultiAccountPublish = async'));
    const end = source.indexOf('          confirm: confirmContentPolicyManualReview', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const js = ts.transpile(`let dailyExecutionAccountKey; const config = { ${source.slice(start, end)} }; return config.execute(payload);`);
    const compiled = new Function('dailyContext', 'AutomationService', 'assertDailyPublishingImages', 'payload',
      'assertDailyPublishingAccess', 'dailyEditorialPublicationGuard', 'assertDailyScheduleDeadline', js);
    const run = (context: any, service: any, images: any, payload: any, access?: any, editorial?: any) =>
      compiled(context, service, images, payload, access, editorial, assertDailyScheduleDeadline);
    const executePostCycle = vi.fn(); const guard = vi.fn();
    const abort = new AbortController(); abort.abort();
    await expect(run({ signal: abort.signal }, { executePostCycle }, guard, {})).rejects.toThrow('DAILY_CANCELLED');
    expect(executePostCycle).not.toHaveBeenCalled(); expect(guard).not.toHaveBeenCalled();
    await run(undefined, { executePostCycle }, guard, {});
    expect(executePostCycle).toHaveBeenCalledTimes(1);
    executePostCycle.mockClear();
    const annual = vi.fn(async () => { throw Error('DAILY_ANNUAL_PLAN_REQUIRED'); });
    await expect(run({}, { executePostCycle }, guard, {}, annual)).rejects.toThrow('DAILY_ANNUAL_PLAN_REQUIRED');
    expect(executePostCycle).not.toHaveBeenCalled(); expect(guard).not.toHaveBeenCalled();
    const allowed = vi.fn(async () => {}), payload = { contentMode: 'homefeed' };
    await expect(run({}, { executePostCycle }, guard, payload, allowed)).rejects.toThrow('DAILY_EDITORIAL_REQUIRED');
    const editorial = vi.fn(() => { throw Error('DAILY_EDITORIAL_CHANGED'); });
    await expect(run({}, { executePostCycle }, guard, payload, allowed, editorial)).rejects.toThrow('DAILY_EDITORIAL_CHANGED');
    expect(executePostCycle).not.toHaveBeenCalled(); expect(guard).not.toHaveBeenCalled();
    await run({}, { executePostCycle }, guard, payload, allowed, vi.fn());
    expect(executePostCycle).toHaveBeenCalledOnce(); expect(guard).toHaveBeenCalledOnce();
  });
  it('restores cancellation after the engine resets its legacy cancellation flags', () => {
    const source = readFileSync('src/main/services/BlogExecutor.ts', 'utf8').replace(/\r\n/gu, '\n');
    const start = source.indexOf('        // 2. 상태 초기화');
    const end = source.indexOf("        sendLog('🚀 발행 사이클 시작')", start);
    const js = ts.transpile(source.slice(start, end));
    const run = new Function('AutomationService', 'context', js);
    const requestCancel = vi.fn(); const service = { startRunning() {}, updateLastRunTime() {}, resetCancelFlag() {}, requestCancel };
    const abort = new AbortController(); abort.abort();
    expect(() => run(service, { abortSignal: abort.signal })).toThrow('DAILY_CANCELLED');
    expect(requestCancel).toHaveBeenCalledWith(false);
    expect(() => run(service, {})).not.toThrow();
  });
});

describe('daily cancellation ownership', () => {
  it('sets cancellation without closing an unrelated current manual instance', () => {
    const previous = AutomationService.getCurrentInstance();
    const manual = { cancel: vi.fn(async () => {}) };
    try {
      AutomationService.setCurrentInstance(manual as never);
      AutomationService.requestCancel(false);
      expect(AutomationService.isCancelRequested()).toBe(true);
      expect(manual.cancel).not.toHaveBeenCalled();
      AutomationService.requestCancel();
      expect(manual.cancel).toHaveBeenCalledTimes(1);
    } finally { AutomationService.resetCancelFlag(); AutomationService.setCurrentInstance(previous); }
  });
  it('ignores an old daily abort after a manual owner has acquired execution', async () => {
    const abort = new AbortController(); const dailyOwner = {};
    let owner: object = dailyOwner; const cancel = vi.fn();
    const dispose = bindDailyPublishingCancellation({ signal: abort.signal }, { owns: () => owner === dailyOwner, cancel });
    owner = { manual: true }; abort.abort(); await dispose();
    expect(cancel).not.toHaveBeenCalled();
  });
  it('cancels its own job once and waits for cancellation before releasing its listener', async () => {
    const abort = new AbortController(); let finish!: () => void;
    const cancel = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const dispose = bindDailyPublishingCancellation({ signal: abort.signal }, { owns: () => true, cancel });
    abort.abort(); abort.abort(); expect(cancel).toHaveBeenCalledTimes(1);
    let disposed = false; const cleanup = dispose().then(() => { disposed = true; });
    await Promise.resolve(); expect(disposed).toBe(false);
    finish(); await cleanup; expect(disposed).toBe(true);
  });
  it('removes the listener before a later job starts', async () => {
    const abort = new AbortController(); const cancel = vi.fn();
    const dispose = bindDailyPublishingCancellation({ signal: abort.signal }, { owns: () => true, cancel });
    await dispose(); abort.abort(); expect(cancel).not.toHaveBeenCalled();
  });
});
