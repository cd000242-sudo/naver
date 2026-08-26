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

    // [2026-08-26] 예전에는 여기서 5개로 잘린 결과(['A','b','c','d','e'])를 단언했다.
    // 그 5개 상한은 근거 기록이 없는 값이고, hashtag-strategy HT-3은 SEO 10~15를
    // 요구한다. 잘린 동작을 단언하고 있어서 계약대로 고치면 이 테스트가 막았다.
    expect(resolved.hashtags).toEqual(['A', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(runOptions.hashtags).toEqual(['A', '#b', 'a', 'c d']);
    expect(structuredContent.hashtags).toEqual(['B', 'e', 'f', 'g']);
  });

  it('모드 상한을 넘을 때만 잘라내고, 그 사실을 로그로 알린다', () => {
    const log = vi.fn();
    const many = Array.from({ length: 12 }, (_, i) => `tag${i + 1}`);
    const resolved = resolveNaverRunOptions({
      runOptions: { hashtags: many, title: '제목', content: '본문입니다.', contentMode: 'homefeed' },
      defaults: {},
      log,
    });

    expect(resolved.hashtags).toHaveLength(7); // 홈판 상한
    expect(log).toHaveBeenCalledWith(expect.stringContaining('7개만 사용'));
  });

  it('SEO 모드는 12개를 그대로 발행한다 (예전 5개 절단 없음)', () => {
    const many = Array.from({ length: 12 }, (_, i) => `tag${i + 1}`);
    const resolved = resolveNaverRunOptions({
      runOptions: { hashtags: many, title: '제목', content: '본문입니다.', contentMode: 'seo' },
      defaults: {},
      log: vi.fn(),
    });

    expect(resolved.hashtags).toHaveLength(12);
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
