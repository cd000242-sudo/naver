import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolvePublishedUrl } from '../scheduler/publishedUrlResolver';

describe('resolvePublishedUrl', () => {
  it('prefers the URL returned by automation.run()', () => {
    const url = resolvePublishedUrl(
      { success: true, url: 'https://blog.naver.com/test/223456789' },
      () => 'https://blog.naver.com/test/from-getter',
      'https://blog.naver.com/test',
    );

    expect(url).toBe('https://blog.naver.com/test/223456789');
  });

  it('falls back to getPublishedUrl() before the blog home URL', () => {
    const url = resolvePublishedUrl(
      { success: true },
      () => 'https://blog.naver.com/test/223000001',
      'https://blog.naver.com/test',
    );

    expect(url).toBe('https://blog.naver.com/test/223000001');
  });

  it('uses blog home only when no concrete post URL is available', () => {
    const url = resolvePublishedUrl(
      { success: true, url: '   ' },
      () => null,
      'https://blog.naver.com/test',
    );

    expect(url).toBe('https://blog.naver.com/test');
  });

  it('does not let an earlier blog home candidate hide a later concrete post URL', () => {
    const url = resolvePublishedUrl(
      { success: true, url: 'https://blog.naver.com/test' },
      () => 'https://blog.naver.com/test/223000001',
      'https://blog.naver.com/test',
    );

    expect(url).toBe('https://blog.naver.com/test/223000001');
  });

  it('rejects editor URLs when resolving scheduled published URLs', () => {
    const url = resolvePublishedUrl(
      { success: true, url: 'https://blog.naver.com/PostWriteForm.naver?blogId=test' },
      () => null,
      'https://blog.naver.com/test',
    );

    expect(url).toBe('https://blog.naver.com/test');
  });
});

describe('scheduler published URL wiring guard', () => {
  it('keeps both scheduler paths wired through resolvePublishedUrl()', () => {
    const mainPath = path.join(process.cwd(), 'src', 'main.ts');
    const mainSource = fs.readFileSync(mainPath, 'utf-8');

    expect(mainSource.match(/resolvePublishedUrl\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(mainSource).not.toMatch(/const publishedUrl = `https:\/\/blog\.naver\.com\/\$\{(?:naverId|accountNaverId)\}`/);
  });
});
