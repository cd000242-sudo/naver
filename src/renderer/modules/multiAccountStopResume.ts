// src/renderer/modules/multiAccountStopResume.ts
// Multi-account side of the stop window: the light queue copy kept in the saved record (no credentials), what the
// stopped item carries across a stop (finished article / finished images), and putting a saved queue back after the app
// was closed and opened. The queue itself lives inside initMultiAccountPublishModal; that closure registers hooks here.
// Renderer bundle note: one shared scope, so every top-level name carries the multiAccountStopResume prefix.

import { gstopCreateLedger } from '../../generationStop/stageGate.js';
import { gstopParseRecords } from '../../generationStop/resumeRecord.js';
import type { GstopQueueEntry, GstopRecord } from '../../generationStop/resumeRecord.js';
import type { GenerationStopContext } from './generationStopGate.js';

declare const toastManager: any;

export type MultiAccountStopResumeItem = { id: string; pipelineStatus?: string; accountId?: string; accountName?: string; [key: string]: unknown };
type MultiAccountStopResumeLedger = ReturnType<typeof gstopCreateLedger>;
type MultiAccountStopResumeLevel = 'info' | 'warning' | 'error';

/** What the multi-account window lends to a resume. `start` is the same handler the [대기열 발행 시작] button runs. */
export interface MultiAccountStopResumeHooks {
  readonly getQueue: () => readonly MultiAccountStopResumeItem[];
  readonly setQueue: (items: MultiAccountStopResumeItem[]) => void;
  readonly render: () => void;
  readonly start: () => Promise<void>;
  readonly isRunning: () => boolean;
  /** True once the start handler got past its checks (pause scan, run lease) and the queue loop is running. */
  readonly hasStarted: () => boolean;
  readonly listAccounts: () => Promise<readonly { readonly id: string }[]>;
}

export interface MultiAccountStopResumeStartDeps {
  readonly notify?: (message: string, level: MultiAccountStopResumeLevel) => void;
  readonly pollMs?: number;
  readonly timeoutMs?: number;
}

/** Fields of a queue item that a resume needs. Everything else (generated payloads, thumbnails, run-only flags) is left out. */
const MULTI_ACCOUNT_STOP_RESUME_FIELDS: readonly string[] = [
  'id', 'accountId', 'accountName', 'sourceUrl', 'sourceKeyword', 'imageSource', 'toneStyle', 'category', 'contentMode',
  'customPrompt', 'businessInfo', 'ctaType', 'ctaUrl', 'ctaText', 'includeThumbnailText', 'useAiImage', 'createProductThumbnail',
  'publishMode', 'scheduleDate', 'scheduleTime', 'scheduleType', 'scheduleInterval', 'scheduleUserModified', 'affiliateLink',
  'videoOption', 'realCategoryId', 'realCategoryName', 'keywordAsTitle', 'keywordTitlePrefix', 'urlAutoCollect', 'fillGapWithAI',
  'failureCode',
];
/** Nested values (businessInfo, videoOption) are copied without anything that looks like a credential. */
const MULTI_ACCOUNT_STOP_RESUME_SECRET = /password|passwd|cookie|token|secret|api[_-]?key|credential|session/i;

let multiAccountStopResumeHooks: MultiAccountStopResumeHooks | null = null;

export function multiAccountStopResumeRegister(hooks: MultiAccountStopResumeHooks): void { multiAccountStopResumeHooks = hooks; }
export function multiAccountStopResumeBusy(): boolean { return multiAccountStopResumeHooks?.isRunning() === true; }

function multiAccountStopResumeScrub(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  if (depth > 4) return undefined;
  if (Array.isArray(value)) return value.map((entry) => multiAccountStopResumeScrub(entry, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => !MULTI_ACCOUNT_STOP_RESUME_SECRET.test(key) && entry !== undefined && typeof entry !== 'function')
    .map(([key, entry]) => [key, multiAccountStopResumeScrub(entry, depth + 1)]));
}

/** Card status for a pipelineStatus. "uncertain" (maybe published) is in no bucket: it is never published again. */
export function multiAccountStopResumeStatusOf(pipelineStatus: unknown): 'completed' | 'pending' | 'failed' | 'uncertain' {
  if (pipelineStatus === 'completed' || pipelineStatus === 'failed') return pipelineStatus;
  if (pipelineStatus === 'uncertain' || pipelineStatus === 'publishing') return 'uncertain';
  return 'pending';
}

/** Light copy of the queue for the saved record (whitelist; never passwords, cookies, tokens or keys). */
export function multiAccountStopResumeSnapshot(queue: readonly MultiAccountStopResumeItem[]): GstopQueueEntry[] {
  return queue.map((item) => {
    const picked = MULTI_ACCOUNT_STOP_RESUME_FIELDS
      .filter((key) => item[key] !== undefined && !MULTI_ACCOUNT_STOP_RESUME_SECRET.test(key))
      .map((key) => [key, multiAccountStopResumeScrub(item[key])]);
    return {
      ...Object.fromEntries(picked),
      id: String(item.id),
      status: multiAccountStopResumeStatusOf(item.pipelineStatus),
      maPipelineStatus: String(item.pipelineStatus ?? 'pending'),
      ...(item.manualThumbnail ? { manualThumbnailDropped: true } : {}),
    } as GstopQueueEntry;
  });
}

/** The ledger of finished images stays on the item, so a retry or a resume of the same post only makes the open slots. */
export function multiAccountStopResumeLedger(item: MultiAccountStopResumeItem): MultiAccountStopResumeLedger {
  const held = item._maStopLedger as MultiAccountStopResumeLedger | undefined;
  if (held) return held;
  const created = gstopCreateLedger();
  item._maStopLedger = created;
  return created;
}

export function multiAccountStopResumeContext(
  item: MultiAccountStopResumeItem,
  queue: () => readonly MultiAccountStopResumeItem[],
  article: () => unknown,
  progressLine: string,
): GenerationStopContext {
  return {
    kind: 'multi',
    label: String(item.accountName || '').slice(0, 40),
    recordId: `multi-${item.id}`,
    article: () => article() ?? undefined,
    ledger: multiAccountStopResumeLedger(item),
    queue: () => multiAccountStopResumeSnapshot(queue()),
    stoppedItemId: item.id,
    shopping: item.contentMode === 'affiliate',
    progressLine,
  };
}

/** The finished article handed over by a resume (once): the writing stage returns it instead of writing again. */
export function multiAccountStopResumeTakeArticle(item: MultiAccountStopResumeItem): unknown {
  const article = item._maStopArticle;
  delete item._maStopArticle;
  return article ?? undefined;
}

/** The post finished: drop what it carried and its saved record. */
export function multiAccountStopResumeClear(item: MultiAccountStopResumeItem): void {
  delete item._maStopArticle;
  delete item._maStopLedger;
  if (typeof window === 'undefined') return;
  void Promise.resolve((window as any).api?.generationStopRemove?.(`multi-${item.id}`)).catch(() => undefined);
}

export interface MultiAccountStopResumeRestored {
  readonly queue: MultiAccountStopResumeItem[];
  readonly resumable: number;
  readonly missingAccounts: string[];
  readonly thumbnailDropped: string[];
}

function multiAccountStopResumeRunStatus(original: string, stopped: boolean): string {
  const status = multiAccountStopResumeStatusOf(original);
  if (status === 'uncertain' || status === 'completed') return status;
  return stopped ? 'pending' : status;
}

/**
 * The queue to put back (new array, inputs untouched). Finished posts stay "completed", maybe-published posts stay
 * "uncertain" (never published twice), the stopped post starts again with its article and ledger. Items whose account
 * is not in the saved account list now are left out. Items of this session keep their full live object.
 */
export function multiAccountStopResumeRestore(
  live: readonly MultiAccountStopResumeItem[],
  record: Pick<GstopRecord, 'queue' | 'stoppedItemId' | 'article' | 'ledger'>,
  accountIds: ReadonlySet<string>,
): MultiAccountStopResumeRestored {
  if (!Array.isArray(record.queue) || record.queue.length === 0 || !record.stoppedItemId) {
    return { queue: [...live], resumable: 0, missingAccounts: [], thumbnailDropped: [] };
  }
  const liveById = new Map(live.map((item) => [item.id, item]));
  const savedIds = new Set(record.queue.map((entry) => entry.id));
  const missing = new Set<string>();
  const dropped: string[] = [];
  const restored: MultiAccountStopResumeItem[] = [];
  for (const entry of record.queue) {
    const { status, maPipelineStatus, manualThumbnailDropped, ...saved } = entry as Record<string, unknown>;
    const isStopped = entry.id === record.stoppedItemId;
    const pipelineStatus = multiAccountStopResumeRunStatus(String(maPipelineStatus ?? status ?? 'pending'), isStopped);
    const runs = pipelineStatus !== 'completed' && pipelineStatus !== 'uncertain';
    const name = String(saved.accountName || saved.accountId || entry.id);
    if (runs && !accountIds.has(String(saved.accountId ?? ''))) { missing.add(name); continue; }
    const held = liveById.get(entry.id);
    if (!held && manualThumbnailDropped && runs) dropped.push(name);
    const item: MultiAccountStopResumeItem = { ...(held ?? (saved as MultiAccountStopResumeItem)), id: entry.id, pipelineStatus };
    if (isStopped && runs) {
      if (record.article !== undefined && record.article !== null) item._maStopArticle = record.article;
      item._maStopLedger = held?._maStopLedger ?? gstopCreateLedger((record.ledger as never) ?? []);
    }
    restored.push(item);
  }
  const queue = [...restored, ...live.filter((item) => !savedIds.has(item.id))];
  const resumable = queue.filter((item) => item.pipelineStatus !== 'completed' && item.pipelineStatus !== 'uncertain').length;
  return { queue, resumable, missingAccounts: [...missing], thumbnailDropped: dropped };
}

function multiAccountStopResumeToast(message: string, level: MultiAccountStopResumeLevel): void {
  try {
    if (typeof toastManager !== 'undefined' && typeof toastManager?.[level] === 'function') { toastManager[level](message); return; }
  } catch { /* fall through to the log */ }
  console.warn('[MultiAccountStopResume]', message);
}

/** Runs the start handler without waiting for the run to end: true as soon as the queue loop is running. */
async function multiAccountStopResumeKick(
  hooks: MultiAccountStopResumeHooks,
  notify: (message: string, level: MultiAccountStopResumeLevel) => void,
  deps: MultiAccountStopResumeStartDeps,
): Promise<boolean> {
  let settled = false;
  void (async () => { try { await hooks.start(); } catch (error) { console.warn('[MultiAccountStopResume] 발행 시작 오류:', (error as Error)?.message); } finally { settled = true; } })();
  const deadline = Date.now() + (deps.timeoutMs ?? 30000);
  while (!settled && !hooks.hasStarted() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, deps.pollMs ?? 200));
  if (hooks.hasStarted()) return true;
  notify('대기열은 되살려 두었지만 발행이 시작되지 않았습니다. 화면 안내를 확인한 뒤 다중계정 창에서 [대기열 발행 시작]을 눌러 주세요.', 'warning');
  return false;
}

/** "이어서 발행" on the resume card: restore the saved queue and start it the way the start button does. */
export async function multiAccountStopResumeStart(record: unknown, deps: MultiAccountStopResumeStartDeps = {}): Promise<boolean> {
  const notify = deps.notify ?? multiAccountStopResumeToast;
  const saved = gstopParseRecords([record])[0];
  if (!saved || saved.kind !== 'multi' || !saved.queue || !saved.stoppedItemId) {
    notify('다중계정 멈춤 기록에 대기열이 없어 이어서 발행할 수 없습니다.', 'error');
    return false;
  }
  const hooks = multiAccountStopResumeHooks;
  if (!hooks) { notify('다중계정 발행 창이 아직 준비되지 않았습니다. 다중계정 창을 한 번 연 뒤 다시 눌러 주세요.', 'warning'); return false; }
  if (hooks.isRunning()) { notify('다중계정 발행이 이미 진행 중입니다. 끝난 뒤 다시 눌러 주세요.', 'warning'); return false; }
  let accountIds: Set<string>;
  try { accountIds = new Set((await hooks.listAccounts()).map((account) => String(account.id))); }
  catch (error) { notify(`저장된 계정 목록을 불러오지 못해 이어서 발행하지 않았습니다: ${(error as Error)?.message || error}`, 'error'); return false; }
  const restored = multiAccountStopResumeRestore(hooks.getQueue(), saved, accountIds);
  if (restored.missingAccounts.length > 0) {
    notify(`지금 저장된 계정 목록에 없는 계정의 글은 시작하지 않습니다: ${restored.missingAccounts.join(', ')}`, 'warning');
  }
  if (restored.resumable === 0) { notify('이어서 발행할 글이 없습니다. (끝난 글이나 발행 결과를 확정하지 못한 글만 남았습니다)', 'warning'); return false; }
  if (restored.thumbnailDropped.length > 0) {
    notify(`미리 만든 썸네일은 기록에 저장되지 않아 이번 발행에서는 빠집니다: ${restored.thumbnailDropped.join(', ')}`, 'warning');
  }
  hooks.setQueue(restored.queue);
  hooks.render();
  return multiAccountStopResumeKick(hooks, notify, deps);
}
