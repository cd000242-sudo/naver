import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { materializeLdbImages } from '../main/ldb-images.js';
import { createLdbBridge } from '../main/ldb-bridge.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64');
const relativePath = 'LDB Image Ultra/테스트 원고-job01/00-썸네일.png';
const reference = (bytes = PNG, overrides: Record<string, unknown> = {}) => ({ relativePath,
  sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, mime: 'image/png', ...overrides });
const post = (downloadRef: unknown = reference()) => ({ id: 'ldb_job01', title: '테스트 원고', content: '내용',
  headings: [{ title: '첫 소제목' }], images: [{ downloadRef, heading: '첫 소제목', headingIndex: 0, prompt: 'A calm desk', slotId: 'section-1' }] });

describe('downloaded LDB image imports', () => {
  let temp: string, downloads: string, output: string;
  beforeEach(async () => {
    temp = await mkdtemp(path.join(tmpdir(), 'ldb-download-ref-'));
    downloads = path.join(temp, 'Downloads'); output = path.join(temp, 'app-images');
    await mkdir(path.dirname(path.join(downloads, relativePath)), { recursive: true });
    await mkdir(output); await writeFile(path.join(downloads, relativePath), PNG);
  });
  afterEach(async () => { await rm(temp, { recursive: true, force: true }); });

  it('reads actual saved bytes, copies them to app storage and preserves explicit placement', async () => {
    const input = post();
    const [result] = await materializeLdbImages([input], output, downloads) as any[];
    expect(await readFile(result.images[0].filePath)).toEqual(PNG);
    expect(result.images[0]).toMatchObject({ heading: '첫 소제목', headingIndex: 0, prompt: 'A calm desk',
      savedToLocal: true, previewDataUrl: `data:image/png;base64,${PNG.toString('base64')}` });
    expect(result.images[0]).not.toHaveProperty('downloadRef');
    expect(input.images[0]).not.toHaveProperty('savedToLocal');
    const [repeated] = await materializeLdbImages([input], output, downloads) as any[];
    expect(repeated.images[0].filePath).toBe(result.images[0].filePath);
    expect(await readdir(path.dirname(result.images[0].filePath))).toHaveLength(1);
  });

  it('repairs a corrupted existing app copy from verified download bytes', async () => {
    const [first] = await materializeLdbImages([post()], output, downloads) as any[];
    await writeFile(first.images[0].filePath, Buffer.from('damaged existing copy'));
    const [repaired] = await materializeLdbImages([post()], output, downloads) as any[];
    expect(repaired.images[0].filePath).toBe(first.images[0].filePath);
    expect(await readFile(repaired.images[0].filePath)).toEqual(PNG);
    expect(await readdir(path.dirname(repaired.images[0].filePath))).toHaveLength(1);
  });

  it('keeps an already verified app copy without rewriting it', async () => {
    const [first] = await materializeLdbImages([post()], output, downloads) as any[];
    const timestamp = new Date('2000-01-01T00:00:00.000Z');
    await utimes(first.images[0].filePath, timestamp, timestamp);
    await materializeLdbImages([post()], output, downloads);
    expect((await stat(first.images[0].filePath)).mtimeMs).toBe(timestamp.getTime());
  });

  it('atomically replaces a linked app copy without modifying its external target', async () => {
    const [first] = await materializeLdbImages([post()], output, downloads) as any[];
    const outside = path.join(temp, 'unrelated.png'); const original = Buffer.from('unrelated file must remain unchanged');
    await writeFile(outside, original); await rm(first.images[0].filePath); await link(outside, first.images[0].filePath);
    await materializeLdbImages([post()], output, downloads);
    expect(await readFile(first.images[0].filePath)).toEqual(PNG);
    expect(await readFile(outside)).toEqual(original);
    expect((await stat(first.images[0].filePath)).nlink).toBe(1);
    expect(await readdir(path.dirname(first.images[0].filePath))).toHaveLength(1);
  });

  it.each(['../secret.png', '/secret.png', 'C:/secret.png', 'LDB Image Ultra/../secret.png',
    'LDB Image Ultra/one/../../secret.png', 'LDB Image Ultra\\one\\secret.png', 'Other/one/image.png',
    'LDB Image Ultra/one/image.png:secret', 'LDB Image Ultra/one/image.svg', 'LDB Image Ultra/CON/image.png',
    'LDB Image Ultra/one./image.png', 'LDB Image Ultra/one/image.png ', 'LDB Image Ultra/one/%2e%2e.png'])(
    'rejects unsafe or noncanonical relative paths: %s', async value => {
    await expect(materializeLdbImages([post(reference(PNG, { relativePath: value }))], output, downloads)).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  });

  it.each([null, [], {}, { byteLength: 0 }, { byteLength: 1.1 }, { byteLength: 1536 * 1024 + 1 },
    { sha256: 'a'.repeat(63) }, { sha256: 'A'.repeat(64) }, { mime: 'image/gif' }])('rejects malformed reference metadata %#', async invalid => {
    const ref = invalid === null || Array.isArray(invalid) ? invalid : { ...reference(), ...invalid };
    if (invalid && Object.keys(invalid).length === 0) delete (ref as any).relativePath;
    await expect(materializeLdbImages([post(ref)], output, downloads)).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  });

  it('requires an explicitly configured downloads root and never falls back to inline bytes', async () => {
    const input = post(); Object.assign(input.images[0], { filePath: `data:image/png;base64,${PNG.toString('base64')}` });
    await expect(materializeLdbImages([input], output)).rejects.toThrow();
    await rm(path.join(downloads, relativePath));
    await expect(materializeLdbImages([input], output, downloads)).rejects.toThrow(/다운로드|저장/u);
    expect(await readdir(output)).toEqual([]);
  });

  it.each([{ sha256: '0'.repeat(64) }, { byteLength: PNG.length - 1 }, { mime: 'image/jpeg' }])('rejects changed hash, length or mime %#', async changed => {
    await expect(materializeLdbImages([post(reference(PNG, changed))], output, downloads)).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  });

  it('rejects non-raster file contents even with correct size and hash', async () => {
    const bytes = Buffer.from('<script>not an image</script>');
    await writeFile(path.join(downloads, relativePath), bytes);
    await expect(materializeLdbImages([post(reference(bytes))], output, downloads)).rejects.toThrow(/형식|이미지/u);
  });

  it('rejects a directory in place of the image', async () => {
    await rm(path.join(downloads, relativePath)); await mkdir(path.join(downloads, relativePath));
    await expect(materializeLdbImages([post()], output, downloads)).rejects.toThrow();
  });

  it('rejects junctions that redirect an article folder outside the dedicated downloads root', async () => {
    const folder = path.dirname(path.join(downloads, relativePath));
    const outside = path.join(temp, 'outside'); await mkdir(outside);
    await writeFile(path.join(outside, path.basename(relativePath)), PNG);
    await rm(folder, { recursive: true }); await symlink(outside, folder, 'junction');
    await expect(materializeLdbImages([post()], output, downloads)).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  });

  it('rejects redirection of the entire dedicated downloads folder', async () => {
    const folder = path.join(downloads, 'LDB Image Ultra'); const outside = path.join(temp, 'outside');
    await mkdir(path.join(outside, '테스트 원고-job01'), { recursive: true });
    await writeFile(path.join(outside, '테스트 원고-job01', '00-썸네일.png'), PNG);
    await rm(folder, { recursive: true }); await symlink(outside, folder, 'junction');
    await expect(materializeLdbImages([post()], output, downloads)).rejects.toThrow();
  });

  it('rejects hard-linked source files', async () => {
    const outside = path.join(temp, 'another-file.png');
    await link(path.join(downloads, relativePath), outside);
    await expect(materializeLdbImages([post()], output, downloads)).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  });

  it('rejects an oversized actual file and oversized aggregate manifest before writing', async () => {
    await writeFile(path.join(downloads, relativePath), Buffer.alloc(1536 * 1024 + 1));
    await expect(materializeLdbImages([post()], output, downloads)).rejects.toThrow();
    const big = post(reference(PNG, { byteLength: 1536 * 1024 }));
    await expect(materializeLdbImages([big, big, big], output, downloads)).rejects.toThrow(/전체 크기/u);
    expect(await readdir(output)).toEqual([]);
  });

  it('accepts the exact download byte limit without counting the synthesized data URL prefix as file bytes', async () => {
    const bytes = Buffer.alloc(1536 * 1024); PNG.copy(bytes);
    await writeFile(path.join(downloads, relativePath), bytes);
    const [result] = await materializeLdbImages([post(reference(bytes))], output, downloads) as any[];
    expect((await readFile(result.images[0].filePath)).equals(bytes)).toBe(true);
  });

  it('returns safe actionable HTTP errors for missing download files without exposing filesystem paths', async () => {
    await rm(path.join(downloads, relativePath));
    const server = createLdbBridge({ token: 'test-token', downloadImageFiles: true,
      deliver: async inputs => (await materializeLdbImages(inputs, output, downloads)).length });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${port}/v1/posts`, { method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [post()] }) });
      expect(response.status).toBe(409);
      const result = await response.json();
      expect(result).toMatchObject({ ok: false, code: 'DOWNLOAD_IMAGE_UNAVAILABLE' });
      expect(result.error).toContain('다시 저장');
      expect(JSON.stringify(result)).not.toContain(temp);
      expect(await readdir(output)).toEqual([]);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('handles authenticated HTTP image references using actual files before acknowledging delivery', async () => {
    let delivered: any[] = [];
    const server = createLdbBridge({ token: 'test-token', downloadImageFiles: true,
      deliver: async inputs => { delivered = await materializeLdbImages(inputs, output, downloads); return delivered.length; } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${port}/v1/posts`, { method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [post()] }) });
      expect(await response.json()).toMatchObject({ ok: true, imported: 1 });
      expect(await readFile(delivered[0].images[0].filePath)).toEqual(PNG);
      expect(delivered[0].images[0].headingIndex).toBe(0);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('validates all references before writing any image or article folder', async () => {
    const invalid = post(reference(PNG, { sha256: '0'.repeat(64) }));
    invalid.id = 'ldb_second';
    await expect(materializeLdbImages([post(), invalid], output, downloads)).rejects.toThrow();
    expect(await readdir(output)).toEqual([]);
  });

  it.each([['image/jpeg', 'jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/webp', 'webp', Buffer.from('RIFF1234WEBP')]] as const)('imports a saved %s image', async (mime, suffix, bytes) => {
    const relative = relativePath.replace(/png$/u, suffix);
    await writeFile(path.join(downloads, relative), bytes);
    const [result] = await materializeLdbImages([post(reference(bytes, { relativePath: relative, mime }))], output, downloads) as any[];
    expect(result.images[0].previewDataUrl).toBe(`data:${mime};base64,${bytes.toString('base64')}`);
  });
});

describe('download image bridge capability', () => {
  it.each([false, true])('advertises disk imports only when explicitly wired: %s', async enabled => {
    const server = createLdbBridge({ token: 'test-token', deliver: async () => 1, downloadImageFiles: enabled });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as { port: number };
      const result = await (await fetch(`http://127.0.0.1:${port}/v1/status`)).json();
      expect(result.capabilities.includes('download-image-files')).toBe(enabled);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
