/**
 * The account:safety IPC accepts the 'check' action (no new channel) and still refuses unknown actions and untrusted senders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
const sessions = vi.hoisted(() => ({
  setExpectedBlogId: vi.fn(), openForUser: vi.fn(async () => {}), ensureSessionForUser: vi.fn(async () => {}),
  openPostListForUser: vi.fn(async () => {}), inspectServerSessionState: vi.fn(async () => ({ status: 'ready' })),
  verifyAccountForUser: vi.fn(async () => ({ status: 'ready', blogId: 'ipc_blog' })),
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
const ID = 'zz-connect-ipc-test-id';

beforeEach(() => {
  vi.clearAllMocks(); handlers.clear();
  registerAccountHandlers({ getMainWindow: () => window } as any, { blogAccountManager: { getAllAccounts: () => [] } as any, reportUserActivity: async () => {} });
});

describe("account:safety 'check'", () => {
  it('is accepted for the main-screen Naver ID and returns the connection in the state', async () => {
    const reply = await call(ID, 'check', undefined, undefined, undefined, 'naver-id');
    expect(reply.success).toBe(true);
    expect(sessions.ensureSessionForUser).toHaveBeenCalledWith(ID);
    expect(sessions.verifyAccountForUser).toHaveBeenCalledWith(ID, { allowRelearn: true });
    expect(reply.state.connection).toMatchObject({ state: 'connected', blogId: 'ipc_blog' });
    expect(reply.state.savedLogin).toEqual({ saved: false });
  });

  it('is not accepted from an untrusted sender, and similar action names stay refused', async () => {
    const stranger = await handlers.get('account:safety')!({ sender: {}, senderFrame: {} }, ID, 'check', undefined, undefined, undefined, 'naver-id');
    expect(stranger.success).toBe(false);
    expect((await call(ID, 'checks', undefined, undefined, undefined, 'naver-id')).success).toBe(false);
    expect(sessions.verifyAccountForUser).not.toHaveBeenCalled();
  });
});
