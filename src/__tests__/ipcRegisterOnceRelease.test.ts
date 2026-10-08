import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * [2026-10-09] Owner: "종료 버튼 눌렀는데 멈췄다". The quit flow registers a 'quit-confirm-response' listener per close
 * attempt and removes it afterwards. The double-registration guard remembered the channel forever, so after one
 * cancelled close the next close's listener was silently dropped and the [종료] answer reached nobody.
 * Real logs: 2026-09-15, 09-19, 09-21, 10-03, 10-08 ("이중 on 등록 차단 ... quit-confirm-response").
 */
const fake = vi.hoisted(() => {
  const state = { ipcMain: undefined as unknown as EventEmitter & { handle: (...args: unknown[]) => void } };
  // A fresh emitter per module load, so every test starts with an unpatched ipcMain.
  const factory = async () => {
    const { EventEmitter: Emitter } = await import('node:events');
    const ipcMain = Object.assign(new Emitter(), { handle: () => undefined });
    state.ipcMain = ipcMain;
    return { ipcMain, default: { ipcMain } };
  };
  return { state, factory };
});

vi.mock('electron', fake.factory);
vi.mock('./mocks/electron', fake.factory);

async function freshGuard(): Promise<EventEmitter> {
  vi.resetModules();
  await import('../main/ipc/registerOnce.js');
  return fake.state.ipcMain;
}

describe('IPC double-registration guard releases a removed channel', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));

  it('a listener registered again after removeListener receives the answer (second close attempt)', async () => {
    const ipcMain = await freshGuard();
    const first = vi.fn();
    ipcMain.on('quit-confirm-response', first);
    ipcMain.removeListener('quit-confirm-response', first);

    const second = vi.fn();
    ipcMain.on('quit-confirm-response', second);
    ipcMain.emit('quit-confirm-response', {}, true);
    expect(second).toHaveBeenCalledWith({}, true);
    expect(first).not.toHaveBeenCalled();
  });

  it('off and removeAllListeners release the channel too', async () => {
    const ipcMain = await freshGuard();
    const a = vi.fn();
    ipcMain.on('dialog-a', a);
    ipcMain.off('dialog-a', a);
    const b = vi.fn();
    ipcMain.on('dialog-a', b);
    ipcMain.removeAllListeners('dialog-a');
    const c = vi.fn();
    ipcMain.on('dialog-a', c);
    ipcMain.emit('dialog-a', {});
    expect(c).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('still blocks a second listener while the first one is registered (no accumulation)', async () => {
    const ipcMain = await freshGuard();
    const first = vi.fn();
    const second = vi.fn();
    ipcMain.on('long-lived', first);
    ipcMain.on('long-lived', second);
    ipcMain.emit('long-lived', {});
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(ipcMain.listenerCount('long-lived')).toBe(1);
  });
});
