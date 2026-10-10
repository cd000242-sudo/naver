import { describe, it, expect, vi } from 'vitest';
import { createLdbBridge } from '../main/ldb-bridge.js';
import { createLdbDestinations } from '../main/ldb-destinations.js';
import { deliverLdbPosts } from '../main/ldb-delivery.js';
import { EventEmitter } from 'events';
const selection = { accountId: 'a', categoryId: '2' };
describe('LDB authenticated account/category HTTP', () => {
  it('requires auth for all account endpoints and acknowledges exact selected destination', async () => {
    const delivered = vi.fn(async (posts: unknown[]) => posts.length);
    const destinations = createLdbDestinations({ accounts: () => [{ id: 'a', name: '공개 별명', blogId: 'blog' }], active: () => ({ id: 'a' }), fetchCategories: async () => ({ success: true, categories: [{ id: '2', name: '카테고리' }] }), deliver: delivered });
    const server = createLdbBridge({ token: 'test', deliver: delivered, destinations });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' };
    try {
      for (const url of ['/v1/accounts', '/v1/categories?accountId=a']) expect((await fetch(base + url)).status).toBe(401);
      expect((await fetch(base + '/v1/selection', { method: 'POST', body: JSON.stringify(selection) })).status).toBe(401);
      expect((await (await fetch(base + '/v1/status')).json()).capabilities).toContain('account-categories');
      const accounts = await (await fetch(base + '/v1/accounts', { headers })).json();
      expect(accounts.accounts).toEqual([{ id: 'a', label: '공개 별명', blogId: 'blog' }]);
      const categories = await (await fetch(base + '/v1/categories?accountId=a', { headers })).json();
      expect(categories.categories).toEqual([{ id: '2', name: '카테고리' }]);
      expect(await (await fetch(base + '/v1/selection', { method: 'POST', headers, body: JSON.stringify(selection) })).json()).toEqual({ ok: true, selection });
      const result = await (await fetch(base + '/v1/posts', { method: 'POST', headers, body: JSON.stringify({ posts: [{ title: '제목', content: '원고' }], destination: selection }) })).json();
      expect(result).toMatchObject({ ok: true, imported: 1, selection });
      expect((await fetch(base + '/v1/selection', { method: 'POST', headers, body: JSON.stringify({ ...selection, categoryId: '999' }) })).status).toBe(409);
      expect((await fetch(base + '/v1/accounts', { headers: { ...headers, Origin: 'https://evil.test' } })).status).toBe(403);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  // [2026-10-10 사장님 신고] 409 응답에 이유를 버리고 일반 문구만 실어 리모컨이 원인을 못 보여 줬다.
  it('carries the category failure reason in the 409 body', async () => {
    const destinations = createLdbDestinations({ accounts: () => [{ id: 'a', name: '이슈블로그', blogId: '이슈블로그', naverId: 'login_id' }], active: () => ({ id: 'a' }), fetchCategories: async () => ({ success: false, message: '카테고리 분석 실패: 블로그 화면을 열 크롬·엣지를 찾지 못했습니다.' }), deliver: vi.fn(async () => 0) });
    const server = createLdbBridge({ token: 'test', deliver: vi.fn(async () => 0), destinations });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const response = await fetch(base + '/v1/categories?accountId=a', { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/'login_id' 블로그에서 실제 발행 카테고리를 찾지 못했습니다/);
      expect(body.error).toMatch(/크롬·엣지를 찾지 못했습니다/);
      expect(body.error.length).toBeLessThanOrEqual(400);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('does not accept renderer ACK with another account or category', async () => {
    const ipc = new EventEmitter(); const send = vi.fn();
    const waiting = deliverLdbPosts({ id: 1, isDestroyed: () => false, isLoading: () => false, send }, ipc, [], 1000, { ...selection, categoryName: '카테고리', categories: [] });
    ipc.emit('ldb:import-posts-result', { sender: { id: 1 } }, { requestId: send.mock.calls[0][2], ok: true, imported: 0, selection: { accountId: 'a', categoryId: '3' } });
    await expect(waiting).rejects.toThrow();
  });
});
