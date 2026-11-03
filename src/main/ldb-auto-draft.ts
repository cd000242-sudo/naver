/**
 * LDB 자동 임시저장(경로 A, 2026-10-21) — 확장이 `autoSave: 'draft'`로 보낸 글 1편을
 * 앱이 반자동 편집에 채운 뒤(렌더러 ACK 이후) 기존 반자동 임시저장 경로로 저장한다.
 *
 *   - 명시적으로 요청한 글만 저장한다. 발행·예약은 하지 않는다.
 *   - 다른 자동화가 돌고 있으면 시작하지 않고 'busy'로 남긴다.
 *   - 결과는 실제 자동화 결과로만 정한다. 모르는 결과는 실패로 본다.
 *   - 상태는 글 id별로 최근 100개만 메모리에 둔다.
 */
import { randomUUID } from 'crypto';

export type LdbAutoDraftStatus = 'queued' | 'saving' | 'saved' | 'failed' | 'busy';
export interface LdbAutoDraftRecord {
  id: string;
  status: LdbAutoDraftStatus;
  message: string;
  accountId: string;
  blogId?: string;
  draftConfirmed?: boolean;
  updatedAt: string;
}
export interface LdbAutoDraftRequest { postId: string; accountId: string; categoryId: string }
export interface LdbAutoDraftOutcome { status: 'saved' | 'failed' | 'busy'; message: string; draftConfirmed?: boolean; failureCode?: string }
export interface LdbAutoDraftApi {
  start: (request: LdbAutoDraftRequest) => LdbAutoDraftRecord;
  get: (id: string) => LdbAutoDraftRecord | undefined;
}

export const LDB_POST_ID_PATTERN = /^ldb_[\p{L}\p{N}_.-]{1,120}$/u;
const MAX_MESSAGE = 400;

type RecordInput = Omit<LdbAutoDraftRecord, 'id' | 'updatedAt'>;

export function createLdbAutoDraftStatusStore(limit = 100, now = () => new Date().toISOString()) {
  const records = new Map<string, LdbAutoDraftRecord>();
  return {
    set(id: string, value: RecordInput): LdbAutoDraftRecord {
      const record: LdbAutoDraftRecord = { ...value, id, updatedAt: now() };
      records.delete(id); // 최신 갱신을 맨 뒤로 보내 오래된 것부터 지운다.
      records.set(id, record);
      while (records.size > limit) records.delete(records.keys().next().value as string);
      return { ...record };
    },
    get(id: string): LdbAutoDraftRecord | undefined {
      const record = records.get(id);
      return record ? { ...record } : undefined;
    },
  };
}
export type LdbAutoDraftStatusStore = ReturnType<typeof createLdbAutoDraftStatusStore>;

/** 자동 저장 요청이 없으면 {}; 있으면 글 1편·ldb id·대상 계정을 모두 요구한다. */
export function parseLdbAutoSaveRequest(payload: unknown, posts: unknown[]): { request?: LdbAutoDraftRequest } | { error: string } {
  const flagged = posts.filter(post => (post as Record<string, unknown>)?.autoSave !== undefined);
  if (!flagged.length) return {};
  if (flagged.some(post => (post as Record<string, unknown>).autoSave !== 'draft')) return { error: '자동 저장은 임시저장(draft)만 지원합니다.' };
  if (posts.length !== 1) return { error: '자동 임시저장은 한 번에 글 1편만 보낼 수 있습니다.' };
  const id = (posts[0] as Record<string, unknown>).id;
  if (typeof id !== 'string' || !LDB_POST_ID_PATTERN.test(id)) return { error: '자동 임시저장 글의 id가 올바르지 않습니다.' };
  const destination = (payload as Record<string, unknown> | null)?.destination as Record<string, unknown> | undefined;
  const accountId = destination?.accountId;
  const categoryId = destination?.categoryId;
  if (typeof accountId !== 'string' || !/^[\w-]{1,120}$/.test(accountId) || typeof categoryId !== 'string' || !categoryId) {
    return { error: '자동 임시저장은 저장할 계정과 카테고리를 함께 보내야 합니다.' };
  }
  return { request: { postId: id, accountId, categoryId } };
}

function messageOf(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, MAX_MESSAGE);
}

/** 렌더러 응답을 믿지 않고 허용된 값만 남긴다. */
export function normalizeLdbAutoDraftOutcome(value: unknown): LdbAutoDraftOutcome {
  const reply = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const status = reply.status === 'saved' || reply.status === 'busy' ? reply.status : 'failed';
  const failureCode = typeof reply.failureCode === 'string' && /^[A-Z_]{1,60}$/.test(reply.failureCode) ? reply.failureCode : undefined;
  const fallback = status === 'saved' ? '네이버에 임시저장했습니다.' : status === 'busy' ? '다른 자동화가 실행 중이라 저장하지 않았습니다.' : '임시저장 결과를 확인하지 못했습니다.';
  return {
    status, message: messageOf(reply.message, fallback),
    ...(status === 'saved' && typeof reply.draftConfirmed === 'boolean' ? { draftConfirmed: reply.draftConfirmed } : {}),
    ...(failureCode ? { failureCode } : {}),
  };
}

interface RunnerDeps {
  store: LdbAutoDraftStatusStore;
  busy: () => boolean;
  run: (request: LdbAutoDraftRequest) => Promise<unknown>;
  blogIdFor?: (accountId: string) => string | undefined;
  defer?: (task: () => void) => void;
}

/** 한 번에 하나만 저장한다. start는 바로 'queued'를 기록하고 실제 실행은 다음 틱으로 미룬다. */
export function createLdbAutoDraftRunner(deps: RunnerDeps): LdbAutoDraftApi {
  const defer = deps.defer || ((task: () => void) => { setImmediate(task); });
  let running = false;
  async function execute(request: LdbAutoDraftRequest): Promise<void> {
    const base = { accountId: request.accountId };
    if (running || deps.busy()) {
      deps.store.set(request.postId, { ...base, status: 'busy', message: '다른 자동화가 실행 중이라 임시저장을 시작하지 않았습니다. 끝난 뒤 앱에서 직접 저장해 주세요.' });
      return;
    }
    running = true;
    deps.store.set(request.postId, { ...base, status: 'saving', message: '네이버에 임시저장하는 중입니다.' });
    let outcome: LdbAutoDraftOutcome;
    try { outcome = normalizeLdbAutoDraftOutcome(await deps.run(request)); }
    catch (error) { outcome = { status: 'failed', message: messageOf(error instanceof Error ? error.message : '', '임시저장을 실행하지 못했습니다.') }; }
    finally { running = false; }
    const mismatch = outcome.failureCode === 'ACCOUNT_MISMATCH' || outcome.message.includes('ACCOUNT_MISMATCH');
    const message = mismatch && !outcome.message.startsWith('ACCOUNT_MISMATCH') ? `ACCOUNT_MISMATCH: ${outcome.message}` : outcome.message;
    const blogId = outcome.status === 'saved' ? deps.blogIdFor?.(request.accountId) : undefined;
    deps.store.set(request.postId, {
      ...base, status: outcome.status, message: message.slice(0, MAX_MESSAGE),
      ...(blogId ? { blogId } : {}),
      ...(outcome.draftConfirmed !== undefined ? { draftConfirmed: outcome.draftConfirmed } : {}),
    });
  }
  return {
    start(request) {
      const record = deps.store.set(request.postId, { accountId: request.accountId, status: 'queued', message: '앱에 원고를 채웠습니다. 임시저장을 기다리는 중입니다.' });
      defer(() => { void execute(request); });
      return record;
    },
    get: id => deps.store.get(id),
  };
}

interface AutoDraftIpc { on: (channel: string, listener: (...args: any[]) => void) => unknown }
interface AutoDraftTarget { id: number; isDestroyed: () => boolean; isLoading: () => boolean; send: (channel: string, ...args: any[]) => void }
const autoDraftRouters = new WeakMap<AutoDraftIpc, Map<string, { senderId: number; settle: (reply: unknown) => void }>>();

/** 렌더러에 저장을 요청하고 같은 요청·같은 화면의 응답만 받는다. 시간이 지나면 실패로 끝낸다. */
export function requestLdbAutoDraftSave(target: AutoDraftTarget | undefined, ipcMain: AutoDraftIpc, request: LdbAutoDraftRequest, timeoutMs = 30 * 60_000): Promise<unknown> {
  if (!target || target.isDestroyed() || target.isLoading()) return Promise.reject(new Error('앱 화면이 준비되지 않아 임시저장을 시작하지 못했습니다.'));
  let pending = autoDraftRouters.get(ipcMain);
  if (!pending) {
    const routes = new Map<string, { senderId: number; settle: (reply: unknown) => void }>();
    ipcMain.on('ldb:auto-draft-save-result', (event: any, reply: any) => {
      const route = typeof reply?.requestId === 'string' ? routes.get(reply.requestId) : undefined;
      if (route && event?.sender?.id === route.senderId) route.settle(reply);
    });
    autoDraftRouters.set(ipcMain, routes);
    pending = routes;
  }
  const routes = pending;
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      routes.delete(requestId);
      reject(new Error('임시저장 결과 확인 시간이 지났습니다. 네이버 임시저장 글 목록에서 직접 확인해 주세요.'));
    }, timeoutMs);
    routes.set(requestId, { senderId: target.id, settle: reply => { clearTimeout(timer); routes.delete(requestId); resolve(reply); } });
    try { target.send('ldb:auto-draft-save', { ...request }, requestId); }
    catch (error) { clearTimeout(timer); routes.delete(requestId); reject(error); }
  });
}
