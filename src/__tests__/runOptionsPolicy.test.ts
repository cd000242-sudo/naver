import { describe, expect, it, vi } from 'vitest';
import { normalizePublishHashtags, resolveNaverRunOptions } from '../automation/runOptionsPolicy';

describe('runOptionsPolicy', () => {
  it('merges hashtags from runOptions and structuredContent without mutating inputs', () => {
    const runOptions: any = { hashtags: ['A', '#b', 'a', 'c d'], title: '제목', content: '본문입니다.' };
    const structuredContent: any = { hashtags: ['B', 'e', 'f', 'g'], bodyPlain: '구조화 본문입니다.' };

    const resolved = resolveNaverRunOptions({
      runOptions: { ...runOptions, structuredContent },
      defaults: {},
      log: vi.fn(),
    });

    expect(resolved.hashtags).toEqual(['A', 'b', 'c', 'd', 'e']);
    expect(runOptions.hashtags).toEqual(['A', '#b', 'a', 'c d']);
    expect(structuredContent.hashtags).toEqual(['B', 'e', 'f', 'g']);
  });

  it('normalizes schedule date without changing the original runOptions object', () => {
    const runOptions: any = {
      title: '제목',
      content: '본문입니다.',
      publishMode: 'schedule',
      scheduleDate: '2026-06-17',
      scheduleTime: '09:30',
    };

    const resolved = resolveNaverRunOptions({ runOptions, defaults: {}, log: vi.fn() });

    expect(resolved.scheduleDate).toBe('2026-06-17 09:30');
    expect(runOptions.scheduleDate).toBe('2026-06-17');
  });

  it('uses saved local image paths without mutating original image records', () => {
    const image: any = {
      heading: '소제목',
      filePath: 'https://example.com/original.jpg',
      provider: 'crawler',
      savedToLocal: 'C:/tmp/local.jpg',
    };

    const resolved = resolveNaverRunOptions({
      runOptions: { title: '제목', content: '본문입니다.', images: [image] },
      defaults: {},
      log: vi.fn(),
    });

    expect(resolved.images[0].filePath).toBe('C:/tmp/local.jpg');
    expect(image.filePath).toBe('https://example.com/original.jpg');
  });

  it('preserves CTA, previous-post, thumbnail, and affiliate defaults', () => {
    const resolved = resolveNaverRunOptions({
      runOptions: {
        title: '**제목**',
        content: '1. 본문입니다.',
        ctaText: '확인하기',
        ctaLink: 'https://example.com',
        previousPostTitle: '이전글',
        previousPostUrl: 'https://blog.naver.com/a/1',
        contentMode: 'affiliate',
        includeThumbnailText: true,
      } as any,
      defaults: {},
      log: vi.fn(),
    });

    expect(resolved.title).toBe('제목');
    expect(resolved.ctas).toEqual([{ text: '확인하기', link: 'https://example.com' }]);
    expect(resolved.previousPostTitle).toBe('이전글');
    expect(resolved.previousPostUrl).toBe('https://blog.naver.com/a/1');
    expect(resolved.createProductThumbnail).toBe(true);
    expect(resolved.includeThumbnailText).toBe(true);
  });

  it('normalizes hashtag text consistently', () => {
    expect(normalizePublishHashtags('#SEO, 블로그  SEO', ['리뷰', '블로그'])).toEqual([
      'SEO',
      '블로그',
      '리뷰',
    ]);
  });
});
