import { randomUUID } from 'crypto';

interface DeliveryIpc {
  on: (channel: string, listener: (...args: any[]) => void) => unknown;
  removeListener: (channel: string, listener: (...args: any[]) => void) => unknown;
}
interface DeliveryTarget {
  id: number;
  isDestroyed: () => boolean;
  isLoading: () => boolean;
  send: (channel: string, ...args: any[]) => void;
}

/**
 * HTTP success is contingent on the intended renderer acknowledging its update.
 * The parameter is named ipcMain on purpose: the IPC contract lint (scripts/lint-ipc.mjs,
 * ipcWiringIntegrity.test.ts) only recognises literal ipcMain.on(...) registrations.
 */
export function deliverLdbPosts(target: DeliveryTarget | undefined, ipcMain: DeliveryIpc, posts: unknown[], timeoutMs = 12_000): Promise<number> {
  if (!target || target.isDestroyed() || target.isLoading()) return Promise.reject(new Error('앱 화면이 준비되지 않았습니다.'));
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const cleanup = () => { clearTimeout(timer); ipcMain.removeListener('ldb:import-posts-result', listener); };
    const listener = (event: any, reply: any) => {
      if (event.sender?.id !== target.id || reply?.requestId !== requestId) return;
      cleanup();
      if (reply.ok === true && reply.imported === posts.length) resolve(reply.imported);
      else reject(new Error('앱에서 원고와 이미지 배치를 완료하지 못했습니다.'));
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('앱 수신 확인 시간이 초과되었습니다.')); }, timeoutMs);
    ipcMain.on('ldb:import-posts-result', listener);
    try { target.send('ldb:import-posts', posts, requestId); }
    catch (error) { cleanup(); reject(error); }
  });
}
