import { describe, it, expect, vi } from 'vitest';
import { materializePublishingImages } from '../main/utils/materializePublishingImages.js';

function makeMockBlobStore(opts: { tempPath?: string | null; throws?: boolean } = {}) {
  return {
    materializeTempFile: vi.fn(async (_blobId: string) => {
      if (opts.throws) throw new Error('mock blob fail');
      return opts.tempPath ?? null;
    }),
  };
}

describe('materializePublishingImages', () => {
  it('empty input returns empty array', async () => {
    const store = makeMockBlobStore();
    expect(await materializePublishingImages([], store)).toEqual([]);
    expect(await materializePublishingImages(undefined, store)).toEqual([]);
  });

  it('image with filePath passes through without calling blob store', async () => {
    const store = makeMockBlobStore();
    const img = { filePath: 'C:\\Users\\foo\\img.png', heading: 'h1' };
    const result = await materializePublishingImages([img], store);
    expect(result[0]).toBe(img);  // same reference
    expect(store.materializeTempFile).not.toHaveBeenCalled();
  });

  it('image with blobId and no filePath materializes and sets filePath', async () => {
    const store = makeMockBlobStore({ tempPath: '/tmp/blob-x.png' });
    const img = { blobId: '01HX', heading: 'h1' };
    const result = await materializePublishingImages([img], store);
    expect(result[0].filePath).toBe('/tmp/blob-x.png');
    expect(result[0].blobId).toBe('01HX');  // preserved
    expect(result[0].heading).toBe('h1');
    expect(result[0]).not.toBe(img);  // new object (immutable)
    expect(store.materializeTempFile).toHaveBeenCalledWith('01HX');
  });

  it('blobId present but materialize returns null passes through original', async () => {
    const store = makeMockBlobStore({ tempPath: null });
    const img = { blobId: '01HX', heading: 'h1' };
    const result = await materializePublishingImages([img], store);
    expect(result[0].filePath).toBeUndefined();
    expect(result[0].blobId).toBe('01HX');
  });

  it('blob store throws warns and passes through original', async () => {
    const store = makeMockBlobStore({ throws: true });
    const img = { blobId: '01HX', heading: 'h1' };
    const result = await materializePublishingImages([img], store);
    expect(result[0].filePath).toBeUndefined();
    expect(result[0].blobId).toBe('01HX');
  });

  it('image with neither blobId nor filePath passes through', async () => {
    const store = makeMockBlobStore();
    const img = { heading: 'h1' };
    const result = await materializePublishingImages([img], store);
    expect(result[0]).toEqual(img);
  });

  it('mixed input processes each image by its own policy', async () => {
    const store = makeMockBlobStore({ tempPath: '/tmp/blob.png' });
    const imgs = [
      { filePath: 'C:\\legacy.png', heading: 'a' },   // pass through
      { blobId: 'b1', heading: 'b' },                  // materialize
      { heading: 'c' },                                // pass through (no source)
    ];
    const result = await materializePublishingImages(imgs, store);
    expect(result[0].filePath).toBe('C:\\legacy.png');
    expect(result[1].filePath).toBe('/tmp/blob.png');
    expect(result[2].filePath).toBeUndefined();
    expect(store.materializeTempFile).toHaveBeenCalledTimes(1);
  });

  it('does not mutate original array', async () => {
    const store = makeMockBlobStore({ tempPath: '/tmp/blob.png' });
    const imgs = [{ blobId: 'b1', heading: 'h' }];
    const original = JSON.parse(JSON.stringify(imgs));
    await materializePublishingImages(imgs, store);
    expect(imgs).toEqual(original);
  });
});
