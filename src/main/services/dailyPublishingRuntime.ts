import { DailyPublishingScheduler } from '../../scheduler/dailyPublishing.js';
import { createDailyPublishingApi, DAILY_IMAGE_PROVIDERS, DAILY_WRITERS, type DailyPublishingAvailability } from '../ldb-daily-publishing.js';
import { createDailyPublishingStore, createDailySourceClaims } from './dailyPublishingStore.js';
import { createDailyPublishingExecutor, dailyStopsAccount, type DailyPublishingExecutorDeps } from './dailyPublishingExecutor.js';
import { stopsAllAccounts } from '../../automation/publishFailureClassifier.js';
import type { DailyPublishingPlan } from '../../scheduler/dailyPublishingTypes.js';
import { resolveDailyCaptureCategory, resolveDailyImageMode, usesDailyAiImages } from '../../scheduler/dailyPublishingModel.js';
import path from 'node:path';

interface Dependencies extends Omit<DailyPublishingExecutorDeps, 'reserveSource'> {
  storagePath: () => string;
  availability: () => Promise<DailyPublishingAvailability>;
  safety: (accountId: string) => { paused: boolean; busy: boolean; label: string };
  busy: () => boolean;
  now?: () => Date;
  nativeReservationReady?: () => boolean;
  /** Keeps the PC from idle sleep while any plan is enabled, so a slot is not slept through. */
  keepAwake?: (on: boolean) => void;
  /** Tells the owner the plan stopped and why (desktop notification). */
  notify?: (title: string, body: string) => void;
  /** False only when the engine clearly reports a logged-out session; an unknown result must not block saving. */
  imageEngineReady?: (provider: string) => Promise<boolean>;
}
/** Both desktop and extension configure plans; only the running desktop app owns execution. */
export function createDailyPublishingRuntime(deps: Dependencies) {
  let running = false;
  const active = new Map<string, AbortController>();
  const executor = createDailyPublishingExecutor({ ...deps, assertAllowed: async () => {
    if (!running) throw Error('DAILY_RUNTIME_STOPPED');
    await deps.assertAllowed?.();
  }, reserveSource: (accountId, fingerprint, jobId) => {
    sourceClaims ??= createDailySourceClaims(path.join(deps.storagePath(), 'daily-source-claims-v1.json'));
    return sourceClaims(accountId, fingerprint, jobId);
  } });
  let sourceClaims: ReturnType<typeof createDailySourceClaims> | undefined;
  const store = () => createDailyPublishingStore(path.join(deps.storagePath(), 'daily-publishing-v1.json'));
  const available = async (plan: DailyPublishingPlan) => {
    const status = await deps.availability();
    if (!running || !status.ready || !status.paid || deps.busy()) return { available: false };
    const account = await deps.readAccount(plan.accountId);
    if (!account) return { available: false };
    const safety = deps.safety(plan.accountId);
    return { available: !safety.paused && !safety.busy };
  };
  const scheduler = new DailyPublishingScheduler({ load: () => store().load(), save: state => store().save(state),
    now: deps.now || (() => new Date()), checkAvailable: available,
    execute: async (plan, job) => {
      const status = await deps.availability();
      if (!running || !status.ready || !status.paid) return { confirmed: false };
      const controller = new AbortController();
      active.set(plan.accountId, controller);
      try { return await executor({ ...plan, id: job.key, scheduledFor: job.scheduledFor, prepareAt: job.prepareAt, signal: controller.signal }); }
      catch (error) {
        // A thrown login/protection block still stops the plan; any other error skips only this post.
        if (dailyStopsAccount(error) || stopsAllAccounts(error)) return { confirmed: false, stopAccount: true, stopAll: stopsAllAccounts(error) };
        // Every keyword of a search/mate plan (and, unless it says stop, every related search) was used: nothing left to write.
        if (error instanceof Error && error.message === 'KEYWORDS_EXHAUSTED') {
          deps.notify?.('매일 자동발행이 멈췄습니다', '이 계정의 키워드를 모두 썼습니다. 매일 발행 화면에서 키워드를 추가한 뒤 다시 시작해 주세요.');
          return { confirmed: false, stopAccount: true, code: 'KEYWORDS_EXHAUSTED' };
        }
        throw error;
      }
      finally { if (active.get(plan.accountId) === controller) active.delete(plan.accountId); }
    } });
  const validatePlan = async (plan: DailyPublishingPlan) => {
    const account = await deps.readAccount(plan.accountId);
    if (!account) throw Error('DAILY_ACCOUNT_NOT_FOUND');
    if (plan.enabled) {
      resolveDailyCaptureCategory(plan.captureCategory, resolveDailyImageMode(plan.imageMode), true);
      const safety = deps.safety(plan.accountId);
      if (safety.paused || safety.busy) throw Error('DAILY_ACCOUNT_PAUSED');
      const config = await deps.readConfig();
      const generator = plan.generator === 'app-settings' ? config.defaultAiProvider : plan.generator;
      if (!generator || !DAILY_WRITERS.includes(generator)) throw Error('DAILY_WRITER_REQUIRED');
      if (!plan.topic.trim() && !account.settings?.keywords?.some(v => v.trim()) && !account.settings?.urls?.some(v => v.trim())) throw Error('DAILY_SOURCE_REQUIRED');
      if (usesDailyAiImages(resolveDailyImageMode(plan.imageMode))) {
        const imageSource = plan.imageSource || account.settings?.imageSource || config.imageSource;
        if (!imageSource || !DAILY_IMAGE_PROVIDERS.includes(imageSource)) throw Error('DAILY_IMAGE_PROVIDER_REQUIRED');
        // Found at setup time, not at 3 a.m.: a logged-out free engine would fail every post.
        if (deps.imageEngineReady && !await deps.imageEngineReady(imageSource)) throw Error('DAILY_IMAGE_ENGINE_LOGIN_REQUIRED');
      }
    }
    await deps.resolveCategory(plan.accountId, plan.categoryId);
  };
  const api = createDailyPublishingApi({ scheduler, availability: deps.availability, validatePlan, now: deps.now,
    nativeReservationReady: deps.nativeReservationReady,
    onPlanChanged: accountId => active.get(accountId)?.abort() });
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastFailure = false;
  const tick = () => void scheduler.initialize().then(async () => {
    if (running) deps.keepAwake?.(scheduler.getState().plans.some(plan => plan.enabled));
    // Startup/loading and other app work are temporary; they must not disable saved plans.
    const status = await deps.availability();
    if (!running || !status.ready || deps.busy()) return;
    await scheduler.tick();
  }).then(() => { lastFailure = false; }).catch(() => {
    if (!lastFailure) console.warn('[DailyPublishing] 상태 확인이 필요합니다. 자동 실행을 시작하지 않았습니다.');
    lastFailure = true;
  });
  return { api, scheduler,
    start() { if (timer) return; running = true; tick(); timer = setInterval(tick, 15_000); timer.unref?.(); },
    dispose() { running = false; deps.keepAwake?.(false); for (const controller of active.values()) controller.abort(); if (timer) clearInterval(timer); timer = undefined; },
  };
}
