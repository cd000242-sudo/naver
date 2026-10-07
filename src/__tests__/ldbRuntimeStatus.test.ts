import { it, expect, vi } from 'vitest';
import { createLdbBridge } from '../main/ldb-bridge.js';
it('reports login/readiness/version without exposing accounts and blocks deliveries until ready', async () => {
 let ready = false;
 const deliver = vi.fn(async () => 1);
 const server = createLdbBridge({ token: 'private-token', deliver, status: () => ({ version: '2.11.316', auth: ready ? 'ready' : 'login-required', ready, update: { state: 'unknown' } }) });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + (server.address() as any).port;
 try {
  const status = await (await fetch(base + '/v1/status')).json();
  expect(status).toMatchObject({ version: '2.11.316', ready: false, auth: 'login-required' });
  expect(JSON.stringify(status)).not.toContain('private-token');
  const request = { method: 'POST', headers: { authorization: 'Bearer private-token' }, body: JSON.stringify({ posts: [{ title: '원고', content: '본문' }] }) };
  expect((await fetch(base + '/v1/posts', request)).status).toBe(503); expect(deliver).not.toHaveBeenCalled();
  ready = true; expect((await fetch(base + '/v1/posts', request)).status).toBe(200); expect(deliver).toHaveBeenCalledOnce();
 } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
