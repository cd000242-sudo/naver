import { afterEach, describe, expect, it, vi } from 'vitest';
const ipcOn = vi.hoisted(() => vi.fn());
const ipcRemove = vi.hoisted(() => vi.fn());
const exposed = vi.hoisted(() => new Map<string, any>());
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: (key: string, value: any) => exposed.set(key, value) }, ipcRenderer: { on: ipcOn, removeListener: ipcRemove, invoke: vi.fn() } }));
vi.mock('./mocks/electron', () => ({ contextBridge: { exposeInMainWorld: (key: string, value: any) => exposed.set(key, value) }, ipcRenderer: { on: ipcOn, removeListener: ipcRemove, invoke: vi.fn() } }));
import '../preload.js';

afterEach(() => { ipcOn.mockClear(); ipcRemove.mockClear(); });
describe('install progress preload boundary', () => {
  it('accepts only bounded provider/phase/message records and removes the exact listener', () => {
    const listener = vi.fn(); const cleanup = exposed.get('api').onAgentInstallProgress(listener);
    const handler = ipcOn.mock.calls[0][1]; expect(ipcOn.mock.calls[0][0]).toBe('agent:install-progress');
    const valid = { provider: 'claude', phase: 'installing', message: '공식 파일 확인 중', secret: 'must-not-cross' };
    handler({}, valid); expect(listener).toHaveBeenCalledWith({ provider: 'claude', phase: 'installing', message: valid.message });
    expect(Object.isFrozen(listener.mock.calls[0][0])).toBe(true);
    for (const invalid of [null, [], {}, { ...valid, provider: 'other' }, { ...valid, provider: ['claude'] }, { ...valid, phase: ['installing'] }, { ...valid, phase: 'raw-output' }, { ...valid, message: '' }, { ...valid, message: 'x'.repeat(301) }, { ...valid, message: 'token\nleak' }]) handler({}, invalid);
    expect(listener).toHaveBeenCalledOnce(); cleanup(); cleanup();
    expect(ipcRemove).toHaveBeenCalledOnce(); expect(ipcRemove).toHaveBeenCalledWith('agent:install-progress', handler);
    handler({}, valid); expect(listener).toHaveBeenCalledOnce();
  });
});
