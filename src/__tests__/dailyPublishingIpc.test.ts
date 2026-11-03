import { describe, expect, it, vi } from 'vitest';
import { createDailyPublishingIpc } from '../main/ipc/dailyPublishingHandlers.js';

describe('app-owned daily publishing IPC', () => {
  const fixture = () => {
    const request = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const ensure = vi.fn(async () => ({ request }));
    return { ensure, request, invoke: createDailyPublishingIpc({ trusted: (event) => event === 'main', ensure }) };
  };
  it('denies foreign renderers before initializing a runtime', async () => {
    const f = fixture(); expect((await f.invoke('iframe', 'GET', '/v1/automations/status')).status).toBe(403);
    expect(f.ensure).not.toHaveBeenCalled();
  });
  it('only exposes fixed method/path combinations', async () => {
    const f = fixture();
    for (const [method, path] of [['DELETE', '/v1/automations/plan'], ['POST', '/v1/automations/status'], ['GET', '/v1/automations/stop'], ['POST', '/admin']]) {
      expect((await f.invoke('main', method, path)).status).toBe(400);
    }
    expect(f.ensure).not.toHaveBeenCalled();
  });
  it('dispatches to the same scheduler API without any HTTP bridge token', async () => {
    const f = fixture(), body = { revision: 1, accountId: 'issue' };
    expect((await f.invoke('main', 'POST', '/v1/automations/stop', body)).status).toBe(200);
    expect(f.request).toHaveBeenCalledWith('POST', '/v1/automations/stop', body);
  });
  it('bounds payload and does not disclose internal errors', async () => {
    const f = fixture();
    expect((await f.invoke('main', 'POST', '/v1/automations/plan', { text: 'a'.repeat(70000) })).status).toBe(400);
    f.ensure.mockRejectedValueOnce(Error('secret-local-path'));
    const out = await f.invoke('main', 'GET', '/v1/automations/status');
    expect(out.status).toBe(503); expect(JSON.stringify(out)).not.toContain('secret-local-path');
  });
});
