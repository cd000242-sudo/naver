import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateDailyPlans } from '../scheduler/dailyPublishingModel.js';
import { createDailyPublishingRuntime } from '../main/services/dailyPublishingRuntime.js';
import { createDailyPublishingExecutor, getDailyPublishingContext } from '../main/services/dailyPublishingExecutor.js';
import { createDailyPublishingApi } from '../main/ldb-daily-publishing.js';

const legacy = { accountId: 'issue', categoryId: '1', enabled: true, mode: 'draft',
  slots: [{ time: '09:00', count: 1 }], generator: 'agent-codex', topic: '공식 행사' };
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });

describe('daily image mode contract', () => {
  it('preserves old plans as AI generation and round trips the explicit capture choice', () => {
    expect(validateDailyPlans([legacy])[0].imageMode).toBe('ai-generated');
    const capture = { ...legacy, imageMode: 'official-capture', captureCategory: 'issue' };
    expect(validateDailyPlans(JSON.parse(JSON.stringify([capture])))[0]).toEqual(capture);
  });
  it('requires an explicit supported capture category for an enabled capture plan only', () => {
    expect(() => validateDailyPlans([{ ...legacy, imageMode: 'official-capture' }])).toThrow('DAILY_CAPTURE_CATEGORY_REQUIRED');
    expect(validateDailyPlans([{ ...legacy, enabled: false, imageMode: 'official-capture' }])[0]).not.toHaveProperty('captureCategory');
    expect(validateDailyPlans([legacy])[0]).not.toHaveProperty('captureCategory');
    for (const captureCategory of ['economy', 'news', '', null, true]) {
      expect(() => validateDailyPlans([{ ...legacy, imageMode: 'official-capture', captureCategory }])).toThrow('DAILY_PLAN_INVALID');
    }
  });
  it.each(['capture', 'news-capture', '', null, true, '../capture'])('refuses the invalid image mode %j', imageMode => {
    expect(() => validateDailyPlans([{ ...legacy, imageMode }])).toThrow('DAILY_PLAN_INVALID');
  });
  it('advertises the image choices (AI then photos first) and acknowledges the exact selected mode', async () => {
    let state = { version: 1, revision: 0, plans: [], runs: [] } as any;
    const api = createDailyPublishingApi({ scheduler: {
      initialize: async () => {}, getState: () => state,
      replacePlans: async (plans: unknown[]) => { state = { ...state, plans, revision: state.revision + 1 }; },
      stop: async (accountId: string) => { state = { ...state, revision: state.revision + 1,
        plans: state.plans.map((plan: any) => plan.accountId === accountId ? { ...plan, enabled: false } : plan) }; },
    } as never, availability: async () => ({ ready: true, paid: true, label: 'ready' }), validatePlan: async () => {} });
    const response = await api.request('POST', '/v1/automations/plan', { revision: 0, plan: { ...legacy, imageMode: 'official-capture', captureCategory: 'issue' } });
    expect(response.status).toBe(200);
    expect(response.body.plans[0].imageMode).toBe('official-capture');
    expect(response.body.imageModes).toEqual([
      { id: 'ai-first', label: 'AI 이미지 먼저 → 빈 칸은 실제 사진 수집' },
      { id: 'collect-first', label: '실제 사진 수집 먼저 → 모자라면 AI 이미지' },
      { id: 'ai-generated', label: 'AI 이미지만' },
      { id: 'official-capture', label: '공식 자료 자동 캡처' },
    ]);
    expect(response.body.captureCategories).toEqual([
      { id: 'issue', label: '이슈' }, { id: 'sports', label: '스포츠' }, { id: 'auto', label: '자동차' },
    ]);
    const denied = await api.request('POST', '/v1/automations/plan', { revision: 1,
      plan: { ...legacy, imageMode: 'official-capture' } });
    expect(denied.status).toBe(422); expect(denied.body.code).toBe('DAILY_CAPTURE_CATEGORY_REQUIRED');
    const staleClient = await api.request('POST', '/v1/automations/plan', { revision: 1, plan: legacy });
    expect(staleClient.status).toBe(422); expect(staleClient.body.code).toBe('DAILY_IMAGE_MODE_REQUIRED');
    expect(state.plans[0].imageMode).toBe('official-capture'); expect(state.revision).toBe(1);
    const stopped = await api.request('POST', '/v1/automations/stop', { revision: 1, accountId: 'issue' });
    expect(stopped.status).toBe(200);
    expect(stopped.body.plans[0]).toMatchObject({ imageMode: 'official-capture', enabled: false });
    const oldAi = await api.request('POST', '/v1/automations/plan', { revision: 2, plan: { ...legacy, accountId: 'old-ai' } });
    expect(oldAi.status).toBe(200);
    expect(oldAi.body.plans.find((plan: any) => plan.accountId === 'old-ai').imageMode).toBe('ai-generated');
  });
});

function executorFixture() {
  const publish = vi.fn(async (_accounts: string[], _options: Record<string, unknown>) => ({ success: true,
    results: [{ accountId: 'issue', success: true, publishMode: 'draft', draftSaved: true }] }));
  const deps = { publish, readConfig: vi.fn(async () => ({ defaultAiProvider: 'agent-codex' })),
    readAccount: () => ({ id: 'issue', blogId: 'leader_248', settings: {} }),
    resolveCategory: async () => ({ categoryName: '공식자료' }), reserveSource: vi.fn(async () => true) };
  const job = { id: 'job', accountId: 'issue', categoryId: '1', mode: 'draft' as const,
    source: { type: 'url' as const, value: 'https://official.example.com/article' } };
  return { deps, publish, job };
}
describe('daily image mode execution boundary', () => {
  it.each(['issue', 'sports', 'auto'] as const)('does not request an AI provider for %s capture and privately preserves its scope', async captureCategory => {
    const f = executorFixture();
    await createDailyPublishingExecutor(f.deps)({ ...f.job, imageMode: 'official-capture', captureCategory });
    const options = f.publish.mock.calls[0][1];
    expect(options).toMatchObject({ dailyImageMode: 'official-capture', useAiImage: false, skipImages: false });
    expect(options.imageSource).toBeUndefined();
    expect(getDailyPublishingContext(options)?.imageMode).toBe('official-capture');
    expect(options.dailyCaptureCategory).toBe(captureCategory);
    expect(getDailyPublishingContext(options)?.captureCategory).toBe(captureCategory);
    expect(getDailyPublishingContext({ ...options })).toBeUndefined();
    expect(options.generatedImages).toBeUndefined();
  });
  it('keeps AI generation opt in to the selected provider and never substitutes capture when missing', async () => {
    const f = executorFixture();
    await expect(createDailyPublishingExecutor(f.deps)(f.job)).rejects.toThrow('IMAGE_PROVIDER_REQUIRED');
    expect(f.publish).not.toHaveBeenCalled(); expect(f.deps.reserveSource).not.toHaveBeenCalled();
    await createDailyPublishingExecutor(f.deps)({ ...f.job, imageMode: 'ai-generated', imageSource: 'openai-image' });
    const options = f.publish.mock.calls[0][1];
    expect(options).toMatchObject({ dailyImageMode: 'ai-generated', useAiImage: true, imageSource: 'openai-image' });
    expect(getDailyPublishingContext(options)?.imageMode).toBe('ai-generated');
  });
  it('refuses an unvalidated mode before source claiming or publication', async () => {
    const f = executorFixture();
    await expect(createDailyPublishingExecutor(f.deps)({ ...f.job, imageMode: 'bad' as never })).rejects.toThrow('DAILY_PLAN_INVALID');
    expect(f.publish).not.toHaveBeenCalled(); expect(f.deps.reserveSource).not.toHaveBeenCalled();
  });
  it('refuses a capture job without explicit category before source claiming or publication', async () => {
    const f = executorFixture();
    await expect(createDailyPublishingExecutor(f.deps)({ ...f.job, imageMode: 'official-capture' })).rejects.toThrow('DAILY_CAPTURE_CATEGORY_REQUIRED');
    expect(f.publish).not.toHaveBeenCalled(); expect(f.deps.reserveSource).not.toHaveBeenCalled();
  });
});

describe('daily capture settings persistence', () => {
  it('enables capture without an AI image key, persists the mode, and restores it after restart', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'daily-image-mode-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    await writeFile(path.join(dir, 'daily-publishing-v1.json'), JSON.stringify({ version: 1, revision: 0, plans: [], runs: [] }));
    const publish = vi.fn(async () => ({ success: true, results: [] }));
    const deps = { storagePath: () => dir, availability: async () => ({ ready: true, paid: true, label: 'ready' }),
      safety: () => ({ paused: false, busy: false, label: '' }), busy: () => false,
      readConfig: async () => ({ defaultAiProvider: 'agent-codex' }),
      readAccount: (id: string) => ({ id, blogId: 'leader_248', settings: {} }),
      resolveCategory: async () => ({ categoryName: '공식자료' }), publish };
    const first = createDailyPublishingRuntime(deps); cleanup.push(() => first.dispose());
    const saved = await first.api.request('POST', '/v1/automations/plan', { revision: 0,
      plan: { ...legacy, imageMode: 'official-capture', captureCategory: 'issue' } });
    expect(saved.status).toBe(200); expect(saved.body.plans[0].imageMode).toBe('official-capture');
    expect(publish).not.toHaveBeenCalled(); first.dispose();
    const restarted = createDailyPublishingRuntime(deps); cleanup.push(() => restarted.dispose());
    const restored = await restarted.api.request('GET', '/v1/automations/status');
    expect(restored.body.plans[0].imageMode).toBe('official-capture');
    expect(restored.body.plans[0].captureCategory).toBe('issue');
    const denied = await restarted.api.request('POST', '/v1/automations/plan', { revision: restored.body.revision,
      plan: { ...legacy, imageMode: 'ai-generated' } });
    expect(denied.status).toBe(422); expect(denied.body.code).toBe('DAILY_IMAGE_PROVIDER_REQUIRED');
    expect(restarted.scheduler.getState().plans[0].imageMode).toBe('official-capture');
  });
});
