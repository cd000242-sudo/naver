import { describe, it, expect } from 'vitest';
import { normalizeImageForStorage } from '../renderer/utils/imageStorageNormalize.js';

describe('normalizeImageForStorage', () => {
  describe('absolute path propagation block (Phase 3 bug fix)', () => {
    it('windows absolute path is not propagated to previewDataUrl', () => {
      const out = normalizeImageForStorage({
        filePath: 'C:\\Users\\SAMSUNG\\Downloads\\image.png',
        previewDataUrl: '',
        url: '',
      });
      expect(out.previewDataUrl).toBe('');
      expect(out.url).toBe('');
      expect(out.filePath).toBe('C:\\Users\\SAMSUNG\\Downloads\\image.png');
    });

    it('file:// URL is not propagated to previewDataUrl', () => {
      const out = normalizeImageForStorage({
        filePath: 'file:///C:/Users/foo/image.png',
        previewDataUrl: 'file:///C:/Users/foo/image.png',
      });
      expect(out.previewDataUrl).toBe('');
      expect(out.url).toBe('');
    });

    it('POSIX absolute path is not propagated to url', () => {
      const out = normalizeImageForStorage({
        url: '/foreign/path/img.png',
        link: '/foreign/path/img.png',
      });
      expect(out.previewDataUrl).toBe('');
      expect(out.url).toBe('');
    });

    it('windows absolute path in url field is discarded', () => {
      const out = normalizeImageForStorage({
        url: 'C:\\Users\\foo\\img.jpg',
      });
      expect(out.url).toBe('');
      expect(out.previewDataUrl).toBe('');
    });
  });

  describe('safe URL preservation', () => {
    it('data:image base64 URL is preserved in previewDataUrl', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo...';
      const out = normalizeImageForStorage({ previewDataUrl: dataUrl });
      expect(out.previewDataUrl).toBe(dataUrl);
    });

    it('http(s) URL is preserved in url', () => {
      const out = normalizeImageForStorage({
        url: 'https://blogfiles.naver.net/img.png',
      });
      expect(out.url).toBe('https://blogfiles.naver.net/img.png');
    });

    it('previewDataUrl empty with http url falls back previewDataUrl to url', () => {
      const out = normalizeImageForStorage({
        url: 'https://example.com/a.png',
      });
      expect(out.previewDataUrl).toBe('https://example.com/a.png');
    });

    it('http URL in link field is preserved as url', () => {
      const out = normalizeImageForStorage({
        link: 'https://cdn.example.com/photo.jpg',
      });
      expect(out.url).toBe('https://cdn.example.com/photo.jpg');
    });
  });

  describe('blob field preservation (SPEC Phase 2 compatibility)', () => {
    it('all 7 blob fields are preserved when blobId is present', () => {
      const out = normalizeImageForStorage({
        blobId: '01HX...',
        sha256: 'abc',
        byteSize: 1234,
        mimeType: 'image/png',
        width: 100,
        height: 200,
        createdAt: 1700000000000,
      });
      expect(out.blobId).toBe('01HX...');
      expect(out.sha256).toBe('abc');
      expect(out.byteSize).toBe(1234);
      expect(out.mimeType).toBe('image/png');
      expect(out.width).toBe(100);
      expect(out.height).toBe(200);
      expect(out.createdAt).toBe(1700000000000);
    });

    it('no blob fields appear when blobId is absent', () => {
      const out = normalizeImageForStorage({ heading: 'h' });
      expect(out.blobId).toBeUndefined();
      expect(out.sha256).toBeUndefined();
    });

    it('empty string blobId is treated as absent', () => {
      const out = normalizeImageForStorage({ blobId: '' });
      expect(out.blobId).toBeUndefined();
    });
  });

  describe('isThumbnail preservation (block 1, 3 compatibility)', () => {
    it('isThumbnail true is preserved', () => {
      const out = normalizeImageForStorage({ isThumbnail: true });
      expect(out.isThumbnail).toBe(true);
    });

    it('isThumbnail false is preserved', () => {
      const out = normalizeImageForStorage({ isThumbnail: false });
      expect(out.isThumbnail).toBe(false);
    });

    it('isThumbnail absent in input results in absent in output (block 2 compatibility)', () => {
      const out = normalizeImageForStorage({});
      expect('isThumbnail' in out).toBe(false);
    });
  });

  describe('base field handling', () => {
    it('empty input produces safe defaults', () => {
      const out = normalizeImageForStorage({});
      expect(out.heading).toBe('');
      expect(out.provider).toBe('unknown');
      expect(out.filePath).toBe('');
      expect(out.previewDataUrl).toBe('');
      expect(out.url).toBe('');
    });

    it('recognizes provider alias keys (source, engine)', () => {
      expect(normalizeImageForStorage({ source: 'imagefx' }).provider).toBe('imagefx');
      expect(normalizeImageForStorage({ engine: 'flow' }).provider).toBe('flow');
    });

    it('savedToLocal false is default when absent', () => {
      const out = normalizeImageForStorage({});
      expect(out.savedToLocal).toBe(false);
    });

    it('savedToLocal truthy value is preserved', () => {
      const out = normalizeImageForStorage({ savedToLocal: true });
      expect(out.savedToLocal).toBe(true);
    });

    it('non-string filePath is replaced with empty string', () => {
      const out = normalizeImageForStorage({ filePath: 12345 });
      expect(out.filePath).toBe('');
    });
  });

  describe('null/undefined safety', () => {
    it('null input does not throw', () => {
      expect(() => normalizeImageForStorage(null)).not.toThrow();
    });

    it('undefined input does not throw', () => {
      expect(() => normalizeImageForStorage(undefined)).not.toThrow();
    });

    it('null input produces safe defaults', () => {
      const out = normalizeImageForStorage(null);
      expect(out.heading).toBe('');
      expect(out.provider).toBe('unknown');
      expect(out.previewDataUrl).toBe('');
      expect(out.url).toBe('');
    });
  });
});
