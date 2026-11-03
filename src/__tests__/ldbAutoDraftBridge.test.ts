import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createLdbBridge, validatePosts } from '../main/ldb-bridge.js';
import { createLdbDestinations } from '../main/ldb-destinations.js';
import {
  createLdbAutoDraftRunner, createLdbAutoDraftStatusStore, parseLdbAutoSaveRequest, requestLdbAutoDraftSave,
} from '../main/ldb-auto-draft.js';

const selection = { accountId: 'a', categoryId: '2' };
const post = (extra: Record<string, unknown> = {}) => ({ id: 'ldb_job1', title: '제목', content: '원고', publishMode: 'draft', ...extra });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

async function serve(options: { autoDraft?: boolean; run?: (request: any) => Promise<unknown>; busy?: () => boolean } = {}) {
  const delivered = vi.fn(async (posts: unknown[]) => posts.length);
  const destinations = createLdbDestinations({ accounts: () => [{ id: 'a', name: '이슈', blogId: 'leader_248' }], active: () => ({ id: 'a' }), fetchCategories: async () => ({ success: true, categories: [{ id: '2', name: '카테고리' }] }), deliver: delivered });
  const run = vi.fn(options.run || (async () => ({ status: 'saved', message: '임시저장 완료' })));
  const runner = createLdbAutoDraftRunner({ store: createLdbAutoDraftStatusStore(), busy: options.busy || (() => false), run, blogIdFor: () => 'leader_248' });
  const server = createLdbBridge({ token: 'test', deliver: delivered, destinations, ...(options.autoDraft === false ? {} : { autoDraft: runner }) });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const close = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); };
  return { base, delivered, run, runner, close };
}
const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' };
const sendPosts = (base: string, body: unknown, extraHeaders: Record<string, string> = {}) => fetch(base + '/v1/posts', { method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });

describe('LDB auto draft request validation', () => {
  it('rejects autoSave values other than draft', () => {
    expect(validatePosts({ posts: [post({ autoSave: 'publish' })] })).toHaveProperty('error');
    expect(validatePosts({ posts: [post({ autoSave: true })] })).toHaveProperty('error');
    expect(validatePosts({ posts: [post({ autoSave: 'draft' })] })).toEqual({ posts: [post({ autoSave: 'draft' })] });
  });
  it('requires one post with an ldb id and an explicit destination account', () => {
    expect(parseLdbAutoSaveRequest({ destination: selection }, [post()])).toEqual({});
    expect(parseLdbAutoSaveRequest({ destination: selection }, [post({ autoSave: 'draft' })])).toEqual({ request: { postId: 'ldb_job1', ...selection } });
    expect(parseLdbAutoSaveRequest({}, [post({ autoSave: 'draft' })])).toHaveProperty('error');
    expect(parseLdbAutoSaveRequest({ destination: { categoryId: '2' } }, [post({ autoSave: 'draft' })])).toHaveProperty('error');
    expect(parseLdbAutoSaveRequest({ destination: selection }, [post({ autoSave: 'draft' }), post({ id: 'ldb_job2' })])).toHaveProperty('error');
    expect(parseLdbAutoSaveRequest({ destination: selection }, [post({ autoSave: 'draft', id: 'job1' })])).toHaveProperty('error');
  });
});

describe('LDB auto draft status store', () => {
  it('keeps only the latest 100 records and returns copies', () => {
    const store = createLdbAutoDraftStatusStore(100, () => '2026-10-21T00:00:00.000Z');
    for (let index = 0; index < 105; index += 1) store.set(`ldb_${index}`, { status: 'queued', message: '', accountId: 'a' });
    expect(store.get('ldb_0')).toBeUndefined();
    expect(store.get('ldb_4')).toBeUndefined();
    expect(store.get('ldb_5')).toMatchObject({ id: 'ldb_5', status: 'queued', updatedAt: '2026-10-21T00:00:00.000Z' });
    const copy = store.get('ldb_104')!;
    (copy as any).status = 'saved';
    expect(store.get('ldb_104')!.status).toBe('queued');
  });
});

describe('LDB auto draft runner', () => {
  it('records busy without running when another automation is in progress', async () => {
    const run = vi.fn();
    const runner = createLdbAutoDraftRunner({ store: createLdbAutoDraftStatusStore(), busy: () => true, run });
    expect(runner.start({ postId: 'ldb_a', ...selection }).status).toBe('queued');
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(runner.get('ldb_a')).toMatchObject({ status: 'busy', accountId: 'a' });
  });
  it('marks saved only from a saved automation outcome and keeps draftConfirmed from the result', async () => {
    let finish!: (value: unknown) => void;
    const runner = createLdbAutoDraftRunner({ store: createLdbAutoDraftStatusStore(), busy: () => false, run: () => new Promise(resolve => { finish = resolve; }), blogIdFor: () => 'leader_248' });
    runner.start({ postId: 'ldb_a', ...selection });
    await flush();
    expect(runner.get('ldb_a')!.status).toBe('saving');
    runner.start({ postId: 'ldb_b', ...selection });
    await flush();
    expect(runner.get('ldb_b')!.status).toBe('busy');
    finish({ status: 'saved', message: '완료', draftConfirmed: true });
    await flush();
    expect(runner.get('ldb_a')).toMatchObject({ status: 'saved', blogId: 'leader_248', draftConfirmed: true, accountId: 'a' });
  });
  it('fails closed on unknown, thrown and account-mismatch outcomes', async () => {
    const outcomes: unknown[] = [{ status: 'published' }, undefined, { status: 'failed', message: '계정이 다릅니다', failureCode: 'ACCOUNT_MISMATCH' }];
    const runner = createLdbAutoDraftRunner({ store: createLdbAutoDraftStatusStore(), busy: () => false, run: async () => {
      const next = outcomes.shift();
      if (next === undefined) throw new Error('앱 화면이 닫혔습니다.');
      return next;
    } });
    for (const id of ['ldb_x', 'ldb_y', 'ldb_z']) { runner.start({ postId: id, ...selection }); await flush(); await flush(); }
    expect(runner.get('ldb_x')).toMatchObject({ status: 'failed' });
    expect(runner.get('ldb_x')!.blogId).toBeUndefined();
    expect(runner.get('ldb_y')).toMatchObject({ status: 'failed', message: expect.stringContaining('앱 화면이 닫혔습니다') });
    expect(runner.get('ldb_z')).toMatchObject({ status: 'failed', message: expect.stringContaining('ACCOUNT_MISMATCH') });
  });
});

describe('LDB auto draft renderer request', () => {
  it('waits for the matching renderer reply only', async () => {
    const ipc = new EventEmitter();
    const target = { id: 7, isDestroyed: () => false, isLoading: () => false, send: vi.fn() };
    const reply = requestLdbAutoDraftSave(target, ipc, { postId: 'ldb_a', ...selection }, 1000);
    const [channel, request, requestId] = target.send.mock.calls[0];
    expect(channel).toBe('ldb:auto-draft-save');
    expect(request).toEqual({ postId: 'ldb_a', ...selection });
    ipc.emit('ldb:auto-draft-save-result', { sender: { id: 8 } }, { requestId, status: 'saved' });
    ipc.emit('ldb:auto-draft-save-result', { sender: { id: 7 } }, { requestId, status: 'saved', message: '완료' });
    await expect(reply).resolves.toMatchObject({ status: 'saved', message: '완료' });
  });
  it('times out instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      const target = { id: 7, isDestroyed: () => false, isLoading: () => false, send: vi.fn() };
      const reply = requestLdbAutoDraftSave(target, new EventEmitter(), { postId: 'ldb_a', ...selection }, 50).catch(error => error.message);
      await vi.advanceTimersByTimeAsync(50);
      expect(await reply).toContain('시간');
    } finally { vi.useRealTimers(); }
  });
});

describe('LDB auto draft bridge HTTP', () => {
  it('advertises the capability only when wired', async () => {
    const wired = await serve();
    const plain = await serve({ autoDraft: false });
    try {
      expect((await (await fetch(wired.base + '/v1/status')).json()).capabilities).toContain('auto-draft-save');
      expect((await (await fetch(plain.base + '/v1/status')).json()).capabilities).not.toContain('auto-draft-save');
      const refused = await sendPosts(plain.base, { posts: [post({ autoSave: 'draft' })], destination: selection });
      expect(refused.status).toBe(409);
      expect(plain.delivered).not.toHaveBeenCalled();
    } finally { await wired.close(); await plain.close(); }
  });
  it('rejects invalid autoSave requests before delivery', async () => {
    const app = await serve();
    try {
      expect((await sendPosts(app.base, { posts: [post({ autoSave: 'publish' })], destination: selection })).status).toBe(400);
      expect((await sendPosts(app.base, { posts: [post({ autoSave: 'draft' })] })).status).toBe(400);
      expect((await sendPosts(app.base, { posts: [post({ autoSave: 'draft' }), post({ id: 'ldb_job2' })], destination: selection })).status).toBe(400);
      expect(app.delivered).not.toHaveBeenCalled();
      expect(app.run).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('responds after the import ACK, then saves and reports status through the authenticated route', async () => {
    let finish!: (value: unknown) => void;
    const app = await serve({ run: () => new Promise(resolve => { finish = resolve; }) });
    try {
      const response = await sendPosts(app.base, { posts: [post({ autoSave: 'draft' })], destination: selection });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, imported: 1, selection, autoSave: { id: 'ldb_job1', status: 'queued' } });
      expect(app.delivered).toHaveBeenCalledOnce();
      const statusUrl = app.base + '/v1/posts/status?id=ldb_job1';
      expect((await fetch(statusUrl)).status).toBe(401);
      expect((await fetch(statusUrl, { headers: { ...headers, Origin: 'https://evil.test' } })).status).toBe(403);
      expect((await fetch(app.base + '/v1/posts/status?id=bad id', { headers })).status).toBe(400);
      expect((await fetch(app.base + '/v1/posts/status?id=ldb_unknown', { headers })).status).toBe(404);
      await flush();
      expect(app.run).toHaveBeenCalledWith({ postId: 'ldb_job1', ...selection });
      expect((await (await fetch(statusUrl, { headers })).json())).toMatchObject({ ok: true, record: { id: 'ldb_job1', status: 'saving', accountId: 'a' } });
      finish({ status: 'saved', message: '임시저장 완료' });
      await flush();
      expect((await (await fetch(statusUrl, { headers })).json()).record).toMatchObject({ status: 'saved', blogId: 'leader_248' });
    } finally { await app.close(); }
  });
  it('keeps the no-flag delivery unchanged and never starts a save', async () => {
    const app = await serve();
    try {
      const response = await sendPosts(app.base, { posts: [post()], destination: selection });
      const body = await response.json();
      expect(body).toEqual({ ok: true, imported: 1, selection });
      await flush();
      expect(app.run).not.toHaveBeenCalled();
      expect((await fetch(app.base + '/v1/posts/status?id=ldb_job1', { headers })).status).toBe(404);
    } finally { await app.close(); }
  });
  it('does not start a save when the import is not acknowledged', async () => {
    const delivered = vi.fn(async () => { throw new Error('앱 화면이 준비되지 않았습니다.'); });
    const destinations = createLdbDestinations({ accounts: () => [{ id: 'a', name: '이슈', blogId: 'b' }], active: () => ({ id: 'a' }), fetchCategories: async () => ({ success: true, categories: [{ id: '2', name: '카테고리' }] }), deliver: delivered });
    const run = vi.fn();
    const runner = createLdbAutoDraftRunner({ store: createLdbAutoDraftStatusStore(), busy: () => false, run });
    const server = createLdbBridge({ token: 'test', deliver: delivered, destinations, autoDraft: runner });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      expect((await sendPosts(base, { posts: [post({ autoSave: 'draft' })], destination: selection })).status).toBe(500);
      await flush();
      expect(run).not.toHaveBeenCalled();
      expect(runner.get('ldb_job1')).toBeUndefined();
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
