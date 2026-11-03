import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { createLdbBridge } from '../main/ldb-bridge.js';
import { createDailyPublishingApi } from '../main/ldb-daily-publishing.js';
import { DailyPublishingScheduler } from '../scheduler/dailyPublishing.js';
import type { DailyPublishingPlan } from '../scheduler/dailyPublishingTypes.js';

vi.mock('../main/ldb-download-images.js', () => ({ LdbDownloadImageError: class extends Error {} }));
const extension = `chrome-extension://${'a'.repeat(32)}`;
const headers = { Authorization: 'Bearer fixture-token', Origin: extension, 'Content-Type': 'application/json' };
const plan = (changes = {}): DailyPublishingPlan => ({
  accountId: 'account-1', categoryId: '1', enabled: true, mode: 'publish',
  slots: [{ time: '07:00', count: 2 }], generator: 'app-settings', topic: '새 소식', ...changes,
});
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => {
    server.closeAllConnections();
    return new Promise<void>(resolve => server.close(() => resolve()));
  }));
});
async function fixture(daily = true) {
  let readiness = true;
  let paid = true;
  const execute = vi.fn(async () => { throw Error('Real execution is forbidden in HTTP tests'); });
  const save = vi.fn(async () => {});
  const scheduler = new DailyPublishingScheduler({
    load: async () => ({ version: 1, revision: 0, plans: [plan()], runs: [] }), save, execute,
    checkAvailable: async () => ({ available: false }), now: () => new Date('2026-10-19T21:00:00Z'),
  });
  const api = createDailyPublishingApi({ scheduler, validatePlan: async () => {},
    availability: async () => ({ ready: readiness, paid, label: 'fixture availability' }),
    now: () => new Date('2026-10-19T21:00:00Z'),
  });
  const request = vi.spyOn(api, 'request');
  const deliver = vi.fn(async (posts: unknown[]) => posts.length);
  const server = createLdbBridge({ token: 'fixture-token', deliver, dailyPublishing: daily ? api : undefined,
    status: () => ({ version: 'test', auth: readiness ? 'ready' : 'login-required', ready: readiness, update: { state: 'idle' } as never }),
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture address');
  const base = `http://127.0.0.1:${address.port}`;
  return { base, server, scheduler, execute, request, deliver, save,
    readiness: (value: boolean) => { readiness = value; }, paid: (value: boolean) => { paid = value; },
    post: (path: string, body: unknown, extra = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) }),
  };
}

describe('daily publishing authenticated loopback HTTP boundary', () => {
  it('requires a bearer token on every daily endpoint before dispatch', async () => {
    const f = await fixture();
    for (const [method, path] of [['GET', '/v1/automations/status'], ['POST', '/v1/automations/plan'], ['POST', '/v1/automations/stop']]) {
      for (const authorization of ['', 'Bearer incorrect']) {
        const response = await fetch(f.base + path, { method, headers: { Origin: extension, Authorization: authorization } });
        expect(response.status).toBe(401);
      }
    }
    expect(f.request).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });
  it('rejects hostile browser origins even when the bearer is correct', async () => {
    const f = await fixture();
    for (const origin of ['https://evil.example', 'null', 'chrome-extension://invalid', `${extension}.evil.example`]) {
      expect((await f.post('/v1/automations/stop', { revision: 0, accountId: 'account-1' }, { Origin: origin })).status).toBe(403);
    }
    expect(f.request).not.toHaveBeenCalled();
    expect(f.scheduler.getState.bind(f.scheduler)).toThrow('DAILY_NOT_INITIALIZED');
  });
  it('advertises the capability and accepts extension preflight without executing', async () => {
    const f = await fixture();
    const response = await fetch(f.base + '/v1/status', { headers: { Origin: extension } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(extension);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ accepts: 'draft-only', capabilities: expect.arrayContaining(['daily-publishing', 'daily-publishing-annual-entitlement-v1']) });
    expect((await fetch(f.base + '/v1/automations/plan', { method: 'OPTIONS', headers: { Origin: extension } })).status).toBe(204);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('keeps status and stop available while the renderer is signed out', async () => {
    const f = await fixture();
    f.readiness(false);
    const status = await fetch(f.base + '/v1/automations/status', { headers });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ revision: 0, availability: { ready: false } });
    expect((await f.post('/v1/automations/plan', { revision: 0, plan: plan() })).status).toBe(503);
    const stopped = await f.post('/v1/automations/stop', { revision: 0, accountId: 'account-1' });
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toMatchObject({ revision: 1, plans: [expect.objectContaining({ enabled: false })] });
    expect((await f.post('/v1/posts', { posts: [{ title: '제목', content: '내용' }] })).status).toBe(503);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.deliver).not.toHaveBeenCalled();
  });
  it('denies unpaid enabling but allows an unpaid user to stop', async () => {
    const f = await fixture();
    f.paid(false);
    const denied = await f.post('/v1/automations/plan', { revision: 0, plan: plan() });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ ok: false, code: 'ANNUAL_PLAN_REQUIRED' });
    expect(f.save).not.toHaveBeenCalled();
    expect((await f.post('/v1/automations/stop', { revision: 0, accountId: 'account-1' })).status).toBe(200);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('persists a valid paid plan and rejects stale revisions without publication', async () => {
    const f = await fixture();
    const saved = await f.post('/v1/automations/plan', { revision: 0, plan: plan({ topic: '수정된 주제', imageSource: '' }) });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ revision: 1, plans: [expect.objectContaining({ topic: '수정된 주제' })] });
    expect((await f.post('/v1/automations/stop', { revision: 0, accountId: 'account-1' })).status).toBe(409);
    expect(f.scheduler.getState().plans[0].enabled).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized UTF-8 bodies before dispatch', async () => {
    const f = await fixture();
    const malformed = await fetch(f.base + '/v1/automations/plan', { method: 'POST', headers, body: '{' });
    expect(malformed.status).toBe(400);
    const oversized = await fetch(f.base + '/v1/automations/plan', { method: 'POST', headers, body: JSON.stringify({ topic: '가'.repeat(23_000) }) });
    expect(oversized.status).toBe(413);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });
  it('dispatches the exact 64 KiB boundary and sanitizes rejected API errors', async () => {
    const f = await fixture();
    const body = JSON.stringify({ padding: 'x'.repeat(65536 - JSON.stringify({ padding: '' }).length) });
    expect(Buffer.byteLength(body)).toBe(65536);
    expect((await fetch(f.base + '/v1/automations/plan', { method: 'POST', headers, body })).status).toBe(400);
    expect(f.request).toHaveBeenCalledOnce();
    f.request.mockRejectedValueOnce(Error('private-token'));
    const failed = await fetch(f.base + '/v1/automations/status', { headers });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('private-token');
  });
  it('ends a stalled body with a timeout before any configuration is dispatched', async () => {
    const f = await fixture();
    // Shorten only the fixture socket's idle wait; the actual timeout handler stays unchanged.
    f.server.once('request', req => req.setTimeout(20));
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const pending = httpRequest(f.base + '/v1/automations/plan', { method: 'POST', headers: { ...headers, 'Content-Length': '100' } }, incoming => {
        let body = '';
        incoming.on('data', chunk => { body += chunk.toString(); });
        incoming.on('end', () => resolve({ status: incoming.statusCode || 0, body }));
        incoming.on('error', reject);
      });
      pending.on('error', reject);
      pending.write('{');
    });
    expect(response.status).toBe(408);
    expect(JSON.parse(response.body)).toMatchObject({ ok: false });
    expect(f.request).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods and endpoint combinations without changing plans', async () => {
    const f = await fixture();
    const unsupported = await fetch(f.base + '/v1/automations/stop', { method: 'PUT', headers });
    expect(unsupported.status).toBe(404);
    expect(f.request).not.toHaveBeenCalled();
    expect((await fetch(f.base + '/v1/automations/stop', { headers })).status).toBe(404);
    expect((await f.post('/v1/automations/status', {})).status).toBe(404);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('returns a safe update response when an older bridge has no daily handler', async () => {
    const f = await fixture(false);
    const status = await (await fetch(f.base + '/v1/status')).json();
    expect(status.capabilities).not.toContain('daily-publishing');
    expect((await fetch(f.base + '/v1/automations/status', { headers })).status).toBe(404);
    expect(f.request).not.toHaveBeenCalled();
  });
  it('preserves the existing draft-only posts route and its authentication', async () => {
    const f = await fixture();
    const posts = [{ title: '기존 제목', content: '기존 원고', publishMode: 'draft' }];
    expect((await fetch(f.base + '/v1/posts', { method: 'POST', body: JSON.stringify({ posts }) })).status).toBe(401);
    expect((await f.post('/v1/posts', { posts })).status).toBe(200);
    expect(f.deliver).toHaveBeenCalledExactlyOnceWith(posts);
    for (const change of [{ isPublished: true }, { publishMode: 'publish' }]) {
      expect((await f.post('/v1/posts', { posts: [{ ...posts[0], ...change }] })).status).toBe(400);
    }
    expect(f.deliver).toHaveBeenCalledOnce();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
