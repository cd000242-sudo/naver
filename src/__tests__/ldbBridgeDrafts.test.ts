import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { prepareLdbDrafts, createLdbDraftReceiver } from '../renderer/modules/ldbDraftImport.js';
import { deliverLdbPosts } from '../main/ldb-delivery.js';
import { createLdbBridge } from '../main/ldb-bridge.js';
import { materializeLdbImages } from '../main/ldb-images.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
const draft = () => ({ id: 'ldb_job1', title: '제목', content: '도입부\n\n소제목\n내용', headings: [{ title: '소제목', content: '내용' }], hashtags: ['태그'], publishMode: 'draft', images: [{ heading: '썸네일', filePath: PNG }, { heading: '소제목', filePath: PNG }] });

describe('LDB draft and image delivery', () => {
  it('keeps received image directions through disk storage, heading previews and draft persistence', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ldb-prompt-test-'));
    try {
      const input = { ...draft(), structuredContent: { thumbnailPrompt: 'A calm desktop viewed from above' },
        headings: [{ title: '소제목', content: '내용', prompt: '원고에서 정한 책꽂이 배치' }],
        images: [{ heading: '썸네일', filePath: PNG, prompt: '이미지의 썸네일 방향' }, { heading: '소제목', filePath: PNG, prompt: 'A shelf seen from the side' }] };
      const materialized = await materializeLdbImages([input], directory) as any[];
      const { posts, drafts } = prepareLdbDrafts(materialized);
      expect(drafts[0].images.map((image: any) => image.prompt)).toEqual(['이미지의 썸네일 방향', 'A shelf seen from the side']);
      expect(drafts[0].headings[0].prompt).toBe('원고에서 정한 책꽂이 배치');
      expect(drafts[0].structuredContent.thumbnailPrompt).toBe('A calm desktop viewed from above');
      expect(posts[0].images[1].prompt).toBe('A shelf seen from the side');
      expect(posts[0].content).toBe(input.content);
      const relative = path.relative(directory, posts[0].images[0].filePath);
      expect(relative.startsWith('..')).toBe(false);
      expect(relative.split(path.sep)).toHaveLength(2);
      expect(path.basename(path.dirname(posts[0].images[0].filePath))).toContain('제목');
      expect(await readdir(path.dirname(posts[0].images[0].filePath))).toHaveLength(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('fills missing heading and thumbnail directions from their explicitly matched images', () => {
    const input = { ...draft(), images: draft().images.map((image, index) => ({ ...image, prompt: `원본 방향 ${index}` })) };
    const { drafts } = prepareLdbDrafts([input]);
    expect(drafts[0].structuredContent.thumbnailPrompt).toBe('원본 방향 0');
    expect(drafts[0].structuredContent.headings[0].prompt).toBe('원본 방향 1');
    expect(input.headings[0]).not.toHaveProperty('prompt');
  });
  it('keeps separate safe folders per article even for identical titles and image bytes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ldb-path-test-'));
    try {
      const input = { ...draft(), title: '../../CON:<bad>\\other' };
      const results = await materializeLdbImages([input, { ...input, id: 'ldb_other' }], directory) as any[];
      expect(await readdir(directory)).toHaveLength(2);
      expect(results[0].images[0].filePath).not.toBe(results[1].images[0].filePath);
      for (const result of results) {
        const relative = path.relative(directory, result.images[0].filePath);
        expect(relative.startsWith('..')).toBe(false);
        expect(relative.split(path.sep)).toHaveLength(2);
        expect(path.basename(path.dirname(result.images[0].filePath))).not.toMatch(/[<>:"/\\|?*]/u);
      }
      const repeated = await materializeLdbImages([input], directory) as any[];
      expect(repeated[0].images[0].filePath).toBe(results[0].images[0].filePath);
      expect(await readdir(path.dirname(repeated[0].images[0].filePath))).toHaveLength(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it.each([123, 'x'.repeat(12001)])('rejects malformed prompt metadata before storing image files', async (badPrompt) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ldb-invalid-prompt-'));
    try {
      const cases = [
        { ...draft(), images: [{ ...draft().images[0], prompt: badPrompt }] },
        { ...draft(), headings: [{ ...draft().headings[0], prompt: badPrompt }] },
        { ...draft(), structuredContent: { thumbnailPrompt: badPrompt } },
      ];
      for (const input of cases) {
        await expect(materializeLdbImages([input], directory)).rejects.toThrow(/프롬프트/u);
        expect(() => prepareLdbDrafts([input])).toThrow(/프롬프트/u);
      }
      expect(await readdir(directory)).toHaveLength(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('persists only validated image files, deduplicates bytes and keeps storage compact', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ldb-bridge-test-'));
    try {
      const materialized = await materializeLdbImages([draft()], directory) as any[];
      const { posts, drafts } = prepareLdbDrafts(materialized);
      expect(await readdir(directory)).toHaveLength(1);
      expect((await readFile(posts[0].images[0].filePath)).subarray(1, 4).toString()).toBe('PNG');
      expect(JSON.stringify(posts)).not.toContain('data:image');
      expect(drafts[0].images[1].previewDataUrl).toBe(PNG);
      await expect(materializeLdbImages([{ ...draft(), images: [{ filePath: 'http://example.test/image.png' }] }], directory)).rejects.toThrow();
      await expect(materializeLdbImages([{ ...draft(), images: [{ filePath: 'data:image/png;base64,PHNjcmlwdD4=' }] }], directory)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('validates every received article before writing and leaves no directories for text-only drafts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ldb-input-boundary-'));
    try {
      const badInputs = [null, { ...draft(), id: '../../outside' }, { ...draft(), headings: {} },
        { ...draft(), images: {} }, { ...draft(), images: Array(9).fill(draft().images[0]) },
        { ...draft(), images: [{}] }, { ...draft(), images: [{ filePath: 'x'.repeat(2 * 1024 * 1024 + 1) }] },
        { ...draft(), images: [{ filePath: 'data:image/png;base64,abc' }] }];
      for (const bad of badInputs) await expect(materializeLdbImages([draft(), bad], directory)).rejects.toThrow();
      expect(await readdir(directory)).toHaveLength(0);
      await expect(materializeLdbImages([{ ...draft(), images: [] }], directory)).resolves.toHaveLength(1);
      expect(await readdir(directory)).toHaveLength(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('accepts supported raster signatures and preserves optional empty directions without using title paths', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ldb-raster-boundary-'));
    try {
      const headers = [
        ['jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])], ['gif', Buffer.from('GIF89a')],
        ['webp', Buffer.from('RIFF1234WEBP')],
      ] as const;
      for (const [mime, bytes] of headers) {
        const input = { ...draft(), title: '... ', images: [{ heading: '썸네일', prompt: '', previewDataUrl: `data:image/${mime};base64,${bytes.toString('base64')}` }] };
        const [result] = await materializeLdbImages([input], directory) as any[];
        expect(await readFile(result.images[0].filePath)).toEqual(bytes);
        expect(result.images[0].prompt).toBe('');
        expect(path.basename(path.dirname(result.images[0].filePath))).toMatch(/^원고-/u);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('upserts one stable draft without reconstructing its authored body', () => {
    const first = prepareLdbDrafts([draft()]);
    const second = prepareLdbDrafts([{ ...draft(), title: '수정 제목' }], first.posts);
    expect(second.posts).toHaveLength(1);
    expect(second.posts[0].id).toBe('ldb_job1');
    expect(second.posts[0].structuredContent.bodyPlain).toBe(draft().content);
    expect(second.posts[0].structuredContent._preferBodyPlain).toBe(true);
    expect(second.posts[0].images[0]).toMatchObject({ heading: '🖼️ 썸네일', isThumbnail: true });
    expect(second.posts[0].images[1]).toMatchObject({ heading: '소제목', headingIndex: 0 });
    expect(first.posts[0].title).toBe('제목');
  });
  it('preserves a cover-only article body as its single introductory section', () => {
    const input = { ...draft(), headings: [], images: [draft().images[0]] };
    const { drafts } = prepareLdbDrafts([input]);
    expect(drafts[0].structuredContent.introduction).toBe(input.content);
    expect(drafts[0].structuredContent.selectedTitle).toBe(input.title);
    expect(drafts[0].structuredContent.bodyPlain).toBe(input.content);
    expect(drafts[0].headings).toEqual([]);
    expect(drafts[0].images[0].isThumbnail).toBe(true);
  });
  it('never overwrites another draft even when the titles are identical', () => {
    const previous = { ...draft(), id: 'unrelated_draft', content: '사용자가 편집한 원고', category: '여행' };
    const { posts } = prepareLdbDrafts([draft()], [previous]);
    expect(posts).toHaveLength(2);
    expect(posts.find(post => post.id === previous.id)).toEqual(previous);
  });
  it('rejects incorrect image placement, remote paths, duplicate headings and published updates', () => {
    expect(() => prepareLdbDrafts([{ ...draft(), images: [{ heading: '다른 제목', filePath: PNG }] }])).toThrow();
    expect(() => prepareLdbDrafts([{ ...draft(), images: [{ heading: '소제목', filePath: 'file:///secret' }] }])).toThrow();
    expect(() => prepareLdbDrafts([{ ...draft(), headings: [{ title: '같음' }, { title: '같음' }] }])).toThrow();
    expect(() => prepareLdbDrafts([draft()], [{ ...draft(), isPublished: true }])).toThrow();
  });
  it('serializes receiver writes and reports storage/display errors', async () => {
    let stored: any[] = [];
    const displayed: string[] = [];
    const receive = createLdbDraftReceiver({ read: () => stored, write: value => { stored = value; }, display: async post => { await Promise.resolve(); displayed.push(post.title); } });
    await Promise.all([receive([draft()]), receive([{ ...draft(), title: '수정 제목' }])]);
    expect(stored).toHaveLength(1);
    expect(displayed).toEqual(['제목', '수정 제목']);
    await expect(createLdbDraftReceiver({ read: () => [], write: () => { throw new Error('quota'); }, display: vi.fn() })([draft()])).rejects.toThrow('quota');
  });
  it('acknowledges only the same request and renderer, then retains its single router', async () => {
    const ipc = new EventEmitter();
    const send = vi.fn();
    const pending = deliverLdbPosts({ id: 10, isDestroyed: () => false, isLoading: () => false, send }, ipc, [draft()]);
    const requestId = send.mock.calls[0][2];
    ipc.emit('ldb:import-posts-result', { sender: { id: 11 } }, { requestId, ok: true, imported: 1 });
    expect(ipc.listenerCount('ldb:import-posts-result')).toBe(1);
    ipc.emit('ldb:import-posts-result', { sender: { id: 10 } }, { requestId, ok: true, imported: 1 });
    await expect(pending).resolves.toBe(1);
    expect(ipc.listenerCount('ldb:import-posts-result')).toBe(1);
  });
  it('missing acknowledgement fails instead of claiming imported', async () => {
    const ipc = new EventEmitter();
    await expect(deliverLdbPosts({ id: 1, isDestroyed: () => false, isLoading: () => false, send: () => {} }, ipc, [draft()], 5)).rejects.toThrow();
    expect(ipc.listenerCount('ldb:import-posts-result')).toBe(1);
  });
  it('rejects a renderer failure acknowledgement', async () => {
    const ipc = new EventEmitter();
    const send = vi.fn();
    const pending = deliverLdbPosts({ id: 10, isDestroyed: () => false, isLoading: () => false, send }, ipc, [draft()]);
    ipc.emit('ldb:import-posts-result', { sender: { id: 10 } }, { requestId: send.mock.calls[0][2], ok: false });
    await expect(pending).rejects.toThrow();
    expect(ipc.listenerCount('ldb:import-posts-result')).toBe(1);
  });
  it('HTTP bridge waits for delivery and propagates failure', async () => {
    let release: (value: number) => void = () => {};
    let delivered = false;
    const server = createLdbBridge({ token: 'test-token', deliver: () => new Promise<number>(resolve => { delivered = true; release = resolve; }) });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      let replied = false;
      const request = fetch(`http://127.0.0.1:${address.port}/v1/posts`, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [draft()] }) }).then(value => { replied = true; return value; });
      while (!delivered) await new Promise(resolve => setTimeout(resolve, 2));
      expect(replied).toBe(false);
      release(1);
      expect(await (await request).json()).toMatchObject({ ok: true, imported: 1 });
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
