import { describe, it, expect, vi } from 'vitest';
import { extractDisplayUrl, validateBlobReferences } from '../renderer/utils/imageDisplayHelpers.js';

describe('extractDisplayUrl', () => {
  describe('safe URL preservation', () => {
    it('returns data:image previewDataUrl', () => {
      const url = 'data:image/png;base64,abc';
      expect(extractDisplayUrl({ previewDataUrl: url })).toBe(url);
    });

    it('returns http(s) URL', () => {
      const url = 'https://blogfiles.naver.net/img.png';
      expect(extractDisplayUrl({ url })).toBe(url);
    });

    it('falls back to url when previewDataUrl absent', () => {
      const url = 'https://example.com/a.png';
      expect(extractDisplayUrl({ url })).toBe(url);
    });

    it('returns http previewDataUrl (non-https)', () => {
      const url = 'http://cdn.example.com/img.png';
      expect(extractDisplayUrl({ previewDataUrl: url })).toBe(url);
    });

    it('prefers previewDataUrl over url when both present', () => {
      const preview = 'data:image/jpeg;base64,xyz';
      const remote = 'https://example.com/img.jpg';
      expect(extractDisplayUrl({ previewDataUrl: preview, url: remote })).toBe(preview);
    });
  });

  describe('absolute path blocking (Phase 4 core)', () => {
    it('windows absolute path -> null', () => {
      expect(extractDisplayUrl({ filePath: 'C:\\Users\\foo.png' })).toBeNull();
    });

    it('file:// URL -> null', () => {
      expect(extractDisplayUrl({ previewDataUrl: 'file:///C:/foo.png' })).toBeNull();
    });

    it('POSIX absolute path -> null', () => {
      expect(extractDisplayUrl({ url: '/foreign/path/img.png' })).toBeNull();
    });

    it('filePath only -> null (excluded from fallback)', () => {
      expect(extractDisplayUrl({ filePath: 'C:\\Users\\foo.png', previewDataUrl: '', url: '' })).toBeNull();
    });

    it('blob: URL in previewDataUrl -> null (not http/https/data)', () => {
      expect(extractDisplayUrl({ previewDataUrl: 'blob:null/some-uuid' })).toBeNull();
    });
  });

  describe('empty or invalid input', () => {
    it('null input -> null', () => {
      expect(extractDisplayUrl(null)).toBeNull();
    });

    it('undefined input -> null', () => {
      expect(extractDisplayUrl(undefined)).toBeNull();
    });

    it('empty object -> null', () => {
      expect(extractDisplayUrl({})).toBeNull();
    });

    it('non-string previewDataUrl -> falls through to url check', () => {
      expect(extractDisplayUrl({ previewDataUrl: 123, url: 'https://a.com/b.png' })).toBe('https://a.com/b.png');
    });
  });
});

describe('validateBlobReferences', () => {
  it('returns missingCount=0 when window.electronAPI.blobs absent (no-op)', async () => {
    (globalThis as any).window = {};
    const r = await validateBlobReferences([{ images: [{ blobId: 'x' }] }]);
    expect(r.missingCount).toBe(0);
  });

  it('does not validate images without blobId', async () => {
    const hasMany = vi.fn();
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const r = await validateBlobReferences([{ images: [{ filePath: 'C:\\x.png' }] }]);
    expect(r.missingCount).toBe(0);
    expect(hasMany).not.toHaveBeenCalled();
  });

  it('blobId exists + blob present -> blobId preserved on returned posts', async () => {
    const hasMany = vi.fn(async () => [true]);
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const img = { blobId: '01HX...' };
    const posts = [{ images: [img] }];
    const r = await validateBlobReferences(posts);
    expect(r.missingCount).toBe(0);
    expect((r.posts[0].images[0] as any).blobId).toBe('01HX...');
    // Caller's original input is unchanged (immutability).
    expect(img.blobId).toBe('01HX...');
  });

  it('blob missing -> blobId stripped on RETURN, original untouched', async () => {
    const hasMany = vi.fn(async () => [false]);
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const img: any = { blobId: '01HX...', previewDataUrl: 'data:image/png;base64,abc' };
    const posts = [{ images: [img] }];
    const r = await validateBlobReferences(posts);
    expect(r.missingCount).toBe(1);
    // Returned (cloned) image has blobId removed.
    expect((r.posts[0].images[0] as any).blobId).toBeUndefined();
    // previewDataUrl preserved on returned image.
    expect((r.posts[0].images[0] as any).previewDataUrl).toBe('data:image/png;base64,abc');
    // Caller's original input is unchanged (immutability).
    expect(img.blobId).toBe('01HX...');
  });

  it('partial blob missing -> correct split handling on returned posts', async () => {
    const hasMany = vi.fn(async () => [true, false, true]);
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const posts = [{
      images: [
        { blobId: 'a' },
        { blobId: 'b' },
        { blobId: 'c' },
      ],
    }];
    const r = await validateBlobReferences(posts);
    expect(r.missingCount).toBe(1);
    expect((r.posts[0].images[0] as any).blobId).toBe('a');
    expect((r.posts[0].images[1] as any).blobId).toBeUndefined();
    expect((r.posts[0].images[2] as any).blobId).toBe('c');
    // Original unchanged.
    expect((posts[0].images[1] as any).blobId).toBe('b');
  });

  it('hasMany throws -> returns posts unchanged, missingCount=0 (graceful degradation)', async () => {
    const hasMany = vi.fn(async () => { throw new Error('IPC fail'); });
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const r = await validateBlobReferences([{ images: [{ blobId: 'x' }] }]);
    expect(r.missingCount).toBe(0);
  });

  it('empty posts array -> returns missingCount=0', async () => {
    const hasMany = vi.fn();
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const r = await validateBlobReferences([]);
    expect(r.missingCount).toBe(0);
    expect(hasMany).not.toHaveBeenCalled();
  });

  it('spans multiple posts with mixed blob state', async () => {
    const hasMany = vi.fn(async () => [true, false]);
    (globalThis as any).window = { electronAPI: { blobs: { hasMany } } };
    const img1 = { blobId: 'aa' };
    const img2 = { blobId: 'bb' };
    const posts = [{ images: [img1] }, { images: [img2] }];
    const r = await validateBlobReferences(posts);
    expect(r.missingCount).toBe(1);
    expect((r.posts[0].images[0] as any).blobId).toBe('aa');
    expect((r.posts[1].images[0] as any).blobId).toBeUndefined();
    // Originals unchanged.
    expect((img1 as any).blobId).toBe('aa');
    expect((img2 as any).blobId).toBe('bb');
  });
});
