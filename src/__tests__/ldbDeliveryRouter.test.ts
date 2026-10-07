import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { deliverLdbPosts } from '../main/ldb-delivery.js';
class GuardedIpc extends EventEmitter {
  registered = new Set<string>();
  attempts = 0;
  override on(channel: string, listener: (...args: any[]) => void): this {
    this.attempts += 1;
    if (this.registered.has(channel)) return this;
    this.registered.add(channel);
    return super.on(channel, listener);
  }
}
function fixture(ipc = new GuardedIpc()) {
  const send = vi.fn(); const target = { id: 1, isDestroyed: () => false, isLoading: () => false, send };
  const ack = (index: number, imported: number, senderId = 1, extra = {}) => ipc.emit('ldb:import-posts-result', { sender: { id: senderId } }, { requestId: send.mock.calls[index][2], ok: true, imported, ...extra });
  return { ipc, send, target, ack };
}
describe('LDB delivery under application register-once IPC guard', () => {
  it('acknowledges selection then article without registering the channel twice', async () => {
    const { ipc, target, ack } = fixture();
    const selection = { accountId: 'a', categoryId: '2', categoryName: '분류', categories: [] };
    const first = deliverLdbPosts(target, ipc, [], 30, selection);
    ack(0, 0, 1, { selection }); await expect(first).resolves.toBe(0);
    const next = deliverLdbPosts(target, ipc, [{}], 30, selection);
    ack(1, 1, 1, { selection }); await expect(next).resolves.toBe(1);
    expect(ipc.attempts).toBe(1); expect(ipc.listenerCount('ldb:import-posts-result')).toBe(1);
  });
  it('routes concurrent requests by request and sender and ignores unrelated ACKs', async () => {
    const { ipc, target, ack } = fixture();
    const first = deliverLdbPosts(target, ipc, [{}], 30);
    void first.catch(() => undefined);
    const second = deliverLdbPosts(target, ipc, [{}, {}], 30);
    ack(0, 1, 2);
    ipc.emit('ldb:import-posts-result', { sender: { id: 1 } }, { requestId: 'unknown', ok: true, imported: 1 });
    ack(1, 2); await expect(second).resolves.toBe(2);
    ack(0, 1); await expect(first).resolves.toBe(1);
    expect(ipc.attempts).toBe(1);
  });
  it('cleans timed-out and failed requests without disabling later deliveries', async () => {
    const { ipc, target, ack } = fixture();
    await expect(deliverLdbPosts(target, ipc, [{}], 5)).rejects.toThrow('초과');
    const next = deliverLdbPosts(target, ipc, [{}, {}], 30);
    ack(0, 1); ack(1, 2); await expect(next).resolves.toBe(2);
    const failed = deliverLdbPosts(target, ipc, [], 30); ack(2, 0, 1, { ok: false }); await expect(failed).rejects.toThrow();
    const final = deliverLdbPosts(target, ipc, [], 30); ack(3, 0); await expect(final).resolves.toBe(0);
    expect(ipc.attempts).toBe(1);
  });
  it('cleans synchronous send failures and isolates different ipc instances', async () => {
    const { ipc, target, ack } = fixture();
    target.send.mockImplementationOnce(() => { throw new Error('send failed'); });
    await expect(deliverLdbPosts(target, ipc, [], 30)).rejects.toThrow('send failed');
    const next = deliverLdbPosts(target, ipc, [], 30); ack(1, 0); await expect(next).resolves.toBe(0);
    const other = fixture(); const pending = deliverLdbPosts(other.target, other.ipc, [], 30); other.ack(0, 0); await expect(pending).resolves.toBe(0);
    expect(ipc.attempts).toBe(1); expect(other.ipc.attempts).toBe(1);
  });
});
