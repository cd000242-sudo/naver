/**
 * The account:safety IPC accepts a Naver ID lookup and the open-posts action, and the preload forwards them.
 * (No new channel: the existing, already registered channel carries both, so the preload/main contract lint is unchanged.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
const sessions = vi.hoisted(() => ({
  setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), ensureSessionForUser: vi.fn(async () => {}),
  openPostListForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })),
  verifyAccountForUser: vi.fn(async () => ({ status: 'ready' })),
}));
const electronMock = vi.hoisted(() => ({ ipcMain: { handle: (channel: string, fn: (...args: any[]) => Promise<any>) => { handlers.set(channel, fn); } } }));
vi.mock('electron', () => electronMock);
vi.mock('./mocks/electron', () => electronMock);
vi.mock('../browserSessionManager.js', () => ({ browserSessionManager: sessions }));

import { registerAccountHandlers } from '../main/ipc/accountHandlers';

const webContents = { mainFrame: {} };
const window = { isDestroyed: () => false, webContents };
const trustedEvent = { sender: webContents, senderFrame: webContents.mainFrame };
const call = (...args: unknown[]) => handlers.get('account:safety')!(trustedEvent, ...args);
const ID = 'zz-pause-ui-test-id';

beforeEach(() => {
  vi.clearAllMocks(); handlers.clear();
  registerAccountHandlers({ getMainWindow: () => window } as any, { blogAccountManager: { getAllAccounts: () => [] } as any, reportUserActivity: async () => {} });
});

describe('account:safety handler', () => {
  it('reads the status of the main-screen Naver ID', async () => {
    const reply = await call(ID, 'status', undefined, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(true);
    expect(reply.state.paused).toBe(false);
    expect(sessions.setExpectedBlogId).toHaveBeenCalledWith(ID, ID);
  });

  it('opens the post list through the session manager', async () => {
    const reply = await call(ID, 'open-posts', undefined, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(true);
    expect(sessions.openPostListForUser).toHaveBeenCalledWith(ID, ID);
  });

  it('keeps the registered-account lookup as the default (an unknown account id is reported, not guessed as a Naver ID)', async () => {
    const reply = await call(ID, 'status');
    expect(reply.success).toBe(false);
    expect(sessions.setExpectedBlogId).not.toHaveBeenCalled();
  });

  it.each(['both', 'NAVER-ID', 1, {}])('refuses an unknown lookup %j', async (lookup) => {
    const reply = await call(ID, 'status', undefined, undefined, undefined, lookup);
    expect(reply).toEqual({ success: false, message: '지원하지 않는 요청입니다.' });
  });

  it('refuses unknown actions and untrusted senders', async () => {
    expect((await call(ID, 'delete', undefined, undefined, undefined, 'naver-id')).success).toBe(false);
    const stranger = await handlers.get('account:safety')!({ sender: {}, senderFrame: {} }, ID, 'status', undefined, undefined, undefined, 'naver-id');
    expect(stranger.success).toBe(false);
    expect(sessions.setExpectedBlogId).not.toHaveBeenCalled();
  });
});

describe('preload bridge', () => {
  const preload = readFileSync(join(__dirname, '..', 'preload.ts'), 'utf8').replace(/\r\n/g, '\n');
  it('forwards the lookup as the sixth argument of the same channel', () => {
    expect(preload).toMatch(/accountSafety: \(accountId: string, action: string, version\?: number, outcome\?: string, token\?: string, lookup\?: string\) =>\s*\n\s*ipcRenderer\.invoke\('account:safety', accountId, action, version, outcome, token, lookup\)/);
  });
});
