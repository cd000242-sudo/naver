import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePreviousPostUrl } from '../../shared/previousPostPolicy.js';
import { extractAccountStopCode, stopsAllAccounts } from '../../automation/publishFailureClassifier.js';
import { normalizeBlogId } from '../../automation/expectedBlogIdentity.js';
import { resolveFullAutoImagePolicy } from '../../image/fullAuto/fullAutoImagePolicy.js';
import { buildFullAutoImageSlots, reconcileFullAutoSlotsWithImages } from '../../image/fullAuto/fullAutoImageSlots.js';
import { fullAutoFinalHeadingTitles, type FullAutoArticleLike } from '../../image/fullAuto/fullAutoImageRequest.js';
import { evaluateFullAutoImageReadiness, verifyFullAutoHeadingMapping } from '../../image/fullAuto/fullAutoPublishDecision.js';
import type { DailyEditorialAngle } from './dailyHomefeedEditorialContract.js';
import type { DailyCaptureCategory, DailyImageMode, DailyPublishingPlan } from '../../scheduler/dailyPublishingTypes.js';
import { dailyKst, resolveDailyCaptureCategory, resolveDailyImageMode, usesDailyAiImages } from '../../scheduler/dailyPublishingModel.js';

export interface DailySource { type: 'keyword' | 'url'; value: string; identity?: string; readonly editorial?: Readonly<DailyEditorialAngle>;
  /** 소재 선정 때 쓴 블로그 설정 고정본(2026-10-21) — 작성 단계까지 같은 버전을 쓴다. */
  readonly blogProfileSnapshot?: Readonly<{ profileVersion: number; boundBlogId: string; editorial: unknown; prompt: string }> }
export interface DailyPublishingJob {
  id: string;
  accountId: string;
  categoryId: string;
  mode: DailyPublishingPlan['mode'];
  scheduledFor?: string;
  prepareAt?: string;
  generator?: string;
  imageSource?: string;
  imageMode?: DailyImageMode;
  captureCategory?: DailyCaptureCategory;
  topic?: string;
  source?: DailySource;
  keywordExhaustion?: DailyPublishingPlan['keywordExhaustion'];
  signal?: AbortSignal;
}
export interface DailyAccount {
  id: string;
  blogId?: string;
  naverId?: string;
  settings?: { keywords?: string[]; urls?: string[]; imageSource?: string; contentMode?: string; toneStyle?: string };
}
export interface DailyPublishingExecutorDeps {
  readConfig(): Promise<{ defaultAiProvider?: string; imageSource?: string }>;
  readAccount(id: string): DailyAccount | undefined | Promise<DailyAccount | undefined>;
  resolveCategory(accountId: string, categoryId: string): Promise<{ categoryName: string }>;
  reserveSource(accountId: string, fingerprint: string, jobId: string): Promise<boolean>;
  discoverSources?(topic: string, account: DailyAccount, job: DailyPublishingJob): Promise<DailySource[]>;
  /** Related searches people actually type (search/mate plans, once every listed keyword was used). */
  expandKeywords?(keyword: string): Promise<string[]>;
  publish(accountIds: string[], options: Record<string, unknown>): Promise<unknown>;
  assertAllowed?(): Promise<void>;
  now?(): Date;
}
export interface DailyPublishingOutcome {
  confirmed: boolean;
  publishedUrl?: string;
  draftSaved?: boolean;
  code?: string;
  message?: string;
  stopAll?: boolean;
  stopAccount?: boolean;
  scheduleVerified?: boolean;
  scheduledFor?: string;
}
export interface DailyPublishingContext {
  readonly jobId: string; readonly source: Readonly<DailySource>; readonly signal?: AbortSignal;
  readonly imageMode: DailyImageMode; readonly captureCategory?: DailyCaptureCategory;
  readonly mode: DailyPublishingPlan['mode']; readonly scheduledFor?: string; readonly prepareAt?: string;
}
const dailyContexts = new WeakMap<object, DailyPublishingContext>();
const writers = new Set(['gemini', 'openai', 'claude', 'perplexity', 'agent-codex', 'agent-claude', 'agent-gemini']);
/** Blocks a person must clear in Naver itself. Every other failure skips one post and the plan keeps running. */
const PERSON_REQUIRED_CODES = new Set(['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'ACCOUNT_MISMATCH']);
export function dailyStopsAccount(input: unknown): boolean {
  const code = extractAccountStopCode(input);
  return code !== undefined && PERSON_REQUIRED_CODES.has(code);
}

/** Object identity is private to main; JSON fields received over IPC cannot opt into this path. */
export function getDailyPublishingContext(options: unknown): DailyPublishingContext | undefined {
  return options !== null && typeof options === 'object' ? dailyContexts.get(options) : undefined;
}
/** A passed target is held for review; it is never changed to immediate publication or tomorrow. */
export function assertDailyScheduleDeadline(context: Pick<DailyPublishingContext, 'mode' | 'scheduledFor' | 'prepareAt'> | undefined, now = new Date()): void {
  if (context?.mode !== 'schedule') return;
  const { scheduledFor, prepareAt } = context;
  if (!scheduledFor || !prepareAt || !Number.isFinite(Date.parse(scheduledFor)) || !Number.isFinite(Date.parse(prepareAt))
    || !scheduledFor.endsWith(':00.000Z') || !prepareAt.endsWith(':00.000Z')
    || new Date(scheduledFor).toISOString() !== scheduledFor || new Date(prepareAt).toISOString() !== prepareAt
    || Date.parse(scheduledFor) - Date.parse(prepareAt) !== 3_600_000) throw Error('DAILY_SCHEDULE_TARGET_REQUIRED');
  if (!Number.isFinite(now.getTime())) throw Error('DAILY_CLOCK_INVALID');
  if (now.getTime() >= Date.parse(scheduledFor)) throw Error('DAILY_SCHEDULE_DEADLINE_MISSED');
  if (now.getTime() < Date.parse(prepareAt)) throw Error('DAILY_SCHEDULE_NOT_READY');
}

/** A late abort can only affect the lease that installed this listener. Cleanup waits before release. */
export function bindDailyPublishingCancellation(
  context: Pick<DailyPublishingContext, 'signal'> | undefined,
  deps: { owns: () => boolean; cancel: () => Promise<void> | void },
): () => Promise<void> {
  const signal = context?.signal;
  let active = true; let invoked = false; let pending = Promise.resolve();
  const abort = () => {
    if (!active || invoked || !deps.owns()) return;
    invoked = true;
    try { pending = Promise.resolve(deps.cancel()); } catch (error) { pending = Promise.reject(error); }
    void pending.catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return async () => { active = false; signal?.removeEventListener('abort', abort); await pending; };
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('DAILY_CANCELLED');
}
export function dailySourceFingerprints(source: DailySource): string[] {
  let value = source.value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (source.type === 'url') {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('DAILY_SOURCE_INVALID');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/iu.test(key)) url.searchParams.delete(key);
    url.searchParams.sort(); value = url.toString();
  } else value = value.toLocaleLowerCase('ko-KR');
  const identity = String(source.identity || '').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase('ko-KR');
  const hash = (input: string) => createHash('sha256').update(input).digest('hex');
  return [hash(`${source.type}:${value}`), ...(identity ? [hash(`${source.type}:identity:${identity}`)] : [])];
}
function sourceCandidates(job: DailyPublishingJob, account: DailyAccount): DailySource[] {
  if (job.source) return [{ ...job.source, value: String(job.source.value || '').trim() }];
  const topics = String(job.topic || '').split(/\r?\n/u).map(value => value.trim()).filter(Boolean);
  if (topics.length) return topics.map(value => ({ type: /^https?:\/\//iu.test(value) ? 'url' : 'keyword', value }));
  return [
    ...(account.settings?.keywords || []).map(value => ({ type: 'keyword' as const, value: value.trim() })),
    ...(account.settings?.urls || []).map(value => ({ type: 'url' as const, value: value.trim() })),
  ].filter(source => source.value);
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Resolve only existing app settings. Missing providers stop before any paid work. */
export function createDailyPublishingExecutor(deps: DailyPublishingExecutorDeps) {
  return async (job: DailyPublishingJob): Promise<DailyPublishingOutcome> => {
    abortIfNeeded(job.signal);
    assertDailyScheduleDeadline(job, deps.now?.());
    await deps.assertAllowed?.();
    abortIfNeeded(job.signal);
    if (!job.id || !job.accountId || !/^[1-9]\d{0,15}$/u.test(job.categoryId) || !['draft', 'publish', 'schedule'].includes(job.mode)) throw new Error('DAILY_JOB_INVALID');
    const account = await deps.readAccount(job.accountId);
    if (!account || account.id !== job.accountId) throw new Error('DAILY_ACCOUNT_NOT_FOUND');
    const expectedBlog = normalizeBlogId(account.blogId);
    if (!expectedBlog) throw new Error('DAILY_BLOG_ID_REQUIRED');
    const config = await deps.readConfig();
    const generator = job.generator && job.generator !== 'app-settings' ? job.generator : config.defaultAiProvider;
    if (!generator || !writers.has(generator)) throw new Error('GENERATOR_REQUIRED');
    const imageMode = resolveDailyImageMode(job.imageMode);
    const captureCategory = resolveDailyCaptureCategory(job.captureCategory, imageMode, true);
    const imageSource = usesDailyAiImages(imageMode) ? job.imageSource || account.settings?.imageSource || config.imageSource : undefined;
    if (usesDailyAiImages(imageMode) && (!imageSource || ['skip', 'none'].includes(imageSource))) throw new Error('IMAGE_PROVIDER_REQUIRED');
    const category = await deps.resolveCategory(job.accountId, job.categoryId);
    if (!category.categoryName?.trim()) throw new Error('DAILY_CATEGORY_INVALID');
    let source: DailySource | undefined;
    for (const seed of sourceCandidates(job, account)) {
      abortIfNeeded(job.signal);
      const candidates = seed.type === 'keyword' && deps.discoverSources
        ? await deps.discoverSources(seed.value, account, job) : [seed];
      for (const candidate of candidates) {
        abortIfNeeded(job.signal);
        if (!candidate.value || !['keyword', 'url'].includes(candidate.type)) continue;
        let reserved = true;
        for (const fingerprint of dailySourceFingerprints(candidate)) {
          if (!await deps.reserveSource(job.accountId, fingerprint, job.id)) { reserved = false; break; }
        }
        if (reserved) { source = candidate; break; }
      }
      if (source) break;
    }
    // Search/mate: every listed keyword was used — unless the plan says stop, try related searches of each, in order.
    const searchMode = (account.settings?.contentMode || 'homefeed') !== 'homefeed';
    if (!source && searchMode && !job.source && job.keywordExhaustion !== 'stop' && deps.expandKeywords) {
      for (const seed of sourceCandidates(job, account).filter(candidate => candidate.type === 'keyword')) {
        abortIfNeeded(job.signal);
        for (const value of await deps.expandKeywords(seed.value).catch(() => [] as string[])) {
          const candidate: DailySource = { type: 'keyword', value };
          let reserved = true;
          for (const fingerprint of dailySourceFingerprints(candidate)) {
            if (!await deps.reserveSource(job.accountId, fingerprint, job.id)) { reserved = false; break; }
          }
          if (reserved) { source = candidate; break; }
        }
        if (source) break;
      }
    }
    if (!source) throw new Error(searchMode ? 'KEYWORDS_EXHAUSTED' : 'SOURCE_EXHAUSTED');
    abortIfNeeded(job.signal);
    await deps.assertAllowed?.();
    abortIfNeeded(job.signal);
    assertDailyScheduleDeadline(job, deps.now?.());
    const target = job.mode === 'schedule' ? dailyKst(new Date(job.scheduledFor!)) : undefined;
    const options: Record<string, unknown> = {
      generator, imageSource, publishMode: job.mode, scheduleDate: target?.date, scheduleTime: target?.time,
      ...(target ? { scheduleType: 'naver-server' } : {}),
      categoryId: job.categoryId, categoryName: category.categoryName,
      contentMode: account.settings?.contentMode || 'homefeed', toneStyle: account.settings?.toneStyle,
      postId: job.id, dailyImageMode: imageMode, dailyCaptureCategory: captureCategory,
      skipImages: false, useAiImage: usesDailyAiImages(imageMode), headingImageMode: 'all', thumbnailOnly: false,
      thumbnailImageRatio: '1:1', subheadingImageRatio: '1:1', imageFallbackPolicy: 'engine-only',
    };
    dailyContexts.set(options, Object.freeze({ jobId: job.id, source: Object.freeze({ ...source }), signal: job.signal, imageMode, captureCategory,
      mode: job.mode, ...(target ? { scheduledFor: job.scheduledFor, prepareAt: job.prepareAt } : {}) }));
    const response = record(await deps.publish([job.accountId], options));
    const results = Array.isArray(response.results) ? response.results : [];
    const item = record(results.find(value => record(value).accountId === job.accountId));
    const fail = (): DailyPublishingOutcome => {
      const code = String(item.failureCode || response.code || 'PUBLISH_OUTCOME_UNKNOWN');
      const message = String(item.message || response.message || '실제 완료 결과를 확인하지 못했습니다.');
      return { confirmed: false, code, stopAll: stopsAllAccounts({ code }),
        stopAccount: dailyStopsAccount({ code }) || dailyStopsAccount(message), message };
    };
    if (response.success !== true || item.success !== true || item.publishMode !== job.mode) return fail();
    if (job.mode === 'draft') return item.draftSaved === true ? { confirmed: true, draftSaved: true } : fail();
    if (job.mode === 'schedule') {
      const proof = record(item.scheduledPublication);
      return proof.status === 'reserved' && proof.verification === 'naver-reservation-list' && proof.scheduledFor === job.scheduledFor
        && normalizeBlogId(proof.blogId) === expectedBlog
        ? { confirmed: true, scheduleVerified: true, scheduledFor: job.scheduledFor } : fail();
    }
    const parsed = parsePreviousPostUrl(item.url);
    if (!parsed || !expectedBlog || parsed.blogId.toLowerCase() !== expectedBlog) return fail();
    return { confirmed: true, publishedUrl: `https://blog.naver.com/${parsed.blogId}/${parsed.postId}` };
  };
}

interface DailyImage {
  filePath?: string; url?: string; isThumbnail?: boolean; heading?: string; provider?: string;
  width?: number; height?: number; fallbackUsed?: boolean; actualProvider?: string;
}
function existingFile(file: string): boolean {
  try { const stat = statSync(file); return stat.isFile() && stat.size > 0; } catch { return false; }
}
/** Daily runs never enter the editor with missing, duplicated or mismatched image slots. */
export function assertDailyPublishingImages(
  article: FullAutoArticleLike, images: readonly DailyImage[], fileExists: (file: string) => boolean = existingFile,
): void {
  const files = new Set<string>();
  const usable = images.filter(image => {
    const file = String(image.filePath || '').trim();
    const key = resolve(file).toLowerCase();
    if (!file || files.has(key) || !fileExists(file)) return false;
    files.add(key); return true;
  });
  const policy = resolveFullAutoImagePolicy({ strategy: 'naver-homefeed', headingScope: 'all' });
  const headings = fullAutoFinalHeadingTitles(article);
  const slots = reconcileFullAutoSlotsWithImages(buildFullAutoImageSlots({
    title: String(article.selectedTitle || article.title || ''), headings, policy,
  }), usable);
  const readiness = evaluateFullAutoImageReadiness(slots, policy);
  const mapping = verifyFullAutoHeadingMapping(slots, headings);
  if (usable.length < 5 || readiness.status !== 'IMAGE_READY' || mapping.length) {
    throw new Error(`DAILY_IMAGE_REVIEW: 최소 5장과 썸네일·소제목 이미지가 필요합니다. ${[...readiness.reasons, ...mapping].join('; ')}`);
  }
}
