import { randomUUID } from 'crypto';
import type { LdbResolvedDestination } from './ldb-destinations.js';

interface DeliveryIpc {
  on: (channel: string, listener: (...args: any[]) => void) => unknown;
}
interface DeliveryTarget {
  id: number;
  isDestroyed: () => boolean;
  isLoading: () => boolean;
  send: (channel: string, ...args: any[]) => void;
}
interface PendingDelivery {
  senderId: number;
  acknowledge: (reply: any) => void;
}
const deliveryRouters = new WeakMap<DeliveryIpc, Map<string, PendingDelivery>>();

/** 앱의 register-once 가드를 지키면서 요청별 ACK를 하나의 수신기로 분배한다. */
function getDeliveryRouter(ipcMain: DeliveryIpc): Map<string, PendingDelivery> {
  const existing = deliveryRouters.get(ipcMain);
  if (existing) return existing;
  const pending = new Map<string, PendingDelivery>();
  ipcMain.on('ldb:import-posts-result', (event: any, reply: any) => {
    if (typeof reply?.requestId !== 'string') return;
    const request = pending.get(reply.requestId);
    if (!request || event?.sender?.id !== request.senderId) return;
    request.acknowledge(reply);
  });
  deliveryRouters.set(ipcMain, pending);
  return pending;
}

/** HTTP 성공은 해당 렌더러의 동일 요청·계정·카테고리 ACK가 있어야만 반환한다. */
export function deliverLdbPosts(target: DeliveryTarget | undefined, ipcMain: DeliveryIpc, posts: unknown[], timeoutMs = 12_000, destination?: LdbResolvedDestination): Promise<number> {
  if (!target || target.isDestroyed() || target.isLoading()) return Promise.reject(new Error('앱 화면이 준비되지 않았습니다.'));
  return new Promise((resolve, reject) => {
    const pending = getDeliveryRouter(ipcMain);
    const requestId = randomUUID();
    const expectedCount = posts.length;
    const expectedSelection = destination ? { accountId: destination.accountId, categoryId: destination.categoryId } : undefined;
    const cleanup = () => { clearTimeout(timer); pending.delete(requestId); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('앱 수신 확인 시간이 초과되었습니다.')); }, timeoutMs);
    pending.set(requestId, { senderId: target.id, acknowledge: (reply: any) => {
      cleanup();
      if (reply.ok === true && reply.imported === expectedCount && (!expectedSelection || (reply.selection?.accountId === expectedSelection.accountId && reply.selection?.categoryId === expectedSelection.categoryId))) resolve(reply.imported);
      else reject(new Error('앱에서 원고와 이미지 배치를 완료하지 못했습니다.'));
    } });
    try { target.send('ldb:import-posts', posts, requestId, destination); }
    catch (error) { cleanup(); reject(error); }
  });
}

interface DeliveryWindow {
  webContents: DeliveryTarget;
  isDestroyed: () => boolean;
  isMinimized: () => boolean;
  isVisible?: () => boolean;
  isFocused?: () => boolean;
  restore: () => void;
  show: () => void;
  moveTop: () => void;
  focus: () => void;
}

/**
 * [2026-10-11] The app window state when an LDB handoff arrives. A hidden app window is throttled by Chromium
 * (backgroundThrottling stays on for games), so the timing log records it next to the duration.
 */
export function describeLdbWindowState(window: Pick<DeliveryWindow, 'isMinimized' | 'isVisible' | 'isFocused'>): string {
  if (window.isMinimized()) return '최소화';
  if (window.isVisible && !window.isVisible()) return '숨김';
  return window.isFocused?.() ? '보임(앞)' : '보임(다른 창이 앞)';
}

/** Reveal only a completed article/image handoff, never a background account refresh. */
export async function deliverLdbPostsToWindow(window: DeliveryWindow | null | undefined, ipcMain: DeliveryIpc,
  posts: unknown[], timeoutMs = 20_000, destination?: LdbResolvedDestination): Promise<number> {
  if (!window || window.isDestroyed()) throw new Error('앱 화면이 준비되지 않았습니다.');
  const windowState = describeLdbWindowState(window);
  const startedAt = Date.now();
  const imported = await deliverLdbPosts(window.webContents, ipcMain, posts, timeoutMs, destination);
  if (posts.length) console.log(`[LDB 배치] 앱 화면 반영 ${Date.now() - startedAt}ms · 받을 때 앱 창: ${windowState}`);
  if (posts.length) {
    if (window.isDestroyed()) throw new Error('앱 화면이 닫혔습니다. 앱을 다시 열어주세요.');
    if (window.isMinimized()) window.restore();
    window.show();
    // Windows에서 다른 앱 뒤에 가려진 창도 수신 완료 후 한 번만 앞으로 올린다.
    window.moveTop();
    window.focus();
  }
  return imported;
}
