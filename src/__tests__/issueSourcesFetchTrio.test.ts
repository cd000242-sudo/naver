// src/__tests__/issueSourcesFetchTrio.test.ts
// Pure-function unit tests for the DDG/Reddit/YouTube issue-harness adapters.
// No network calls — only the extraction/mapping helpers are exercised.

import { describe, it, expect } from 'vitest';
import { extractDdgVqd } from '../crawler/issueHarness/sources/duckduckgoSource.js';
import { mapRedditPosts } from '../crawler/issueHarness/sources/redditSource.js';
import { extractYoutubeVideoIds } from '../crawler/issueHarness/sources/youtubeThumbSource.js';

describe('extractDdgVqd', () => {
  it('vqd=... 패턴을 찾는다', () => {
    expect(extractDdgVqd('junk vqd=1234-5678&more=1 junk')).toBe('1234-5678');
  });

  it('vqd="..." 패턴을 찾는다', () => {
    expect(extractDdgVqd('window.x = { vqd: "9876-4321" }; vqd="9876-4321"')).toBe('9876-4321');
  });

  it('vqd=\'...\' 패턴을 찾는다', () => {
    expect(extractDdgVqd("data-vqd='555-666'")).toBe('555-666');
  });

  it('토큰이 없으면 null을 반환한다', () => {
    expect(extractDdgVqd('<html><body>no token here</body></html>')).toBeNull();
  });

  it('빈 입력이면 null을 반환한다', () => {
    expect(extractDdgVqd('')).toBeNull();
  });
});

describe('mapRedditPosts', () => {
  it('preview 이미지가 있는 게시물을 유지하고 &amp;를 언이스케이프한다', () => {
    const children = [
      {
        data: {
          preview: {
            images: [
              { source: { url: 'https://ex.com/a.jpg?w=100&amp;h=200', width: 100, height: 200 } },
            ],
          },
        },
      },
    ];
    const out = mapRedditPosts(children, '손흥민');
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://ex.com/a.jpg?w=100&h=200');
    expect(out[0].width).toBe(100);
    expect(out[0].sourceName).toBe('reddit');
    expect(out[0].query).toBe('손흥민');
  });

  it('NSFW(over_18) 게시물은 건너뛴다', () => {
    const children = [
      {
        data: {
          over_18: true,
          preview: { images: [{ source: { url: 'https://ex.com/nsfw.jpg' } }] },
        },
      },
    ];
    expect(mapRedditPosts(children, 'q')).toHaveLength(0);
  });

  it('비디오/갤러리 게시물은 건너뛴다', () => {
    const children = [
      { data: { is_video: true, preview: { images: [{ source: { url: 'https://ex.com/v.jpg' } }] } } },
      { data: { is_gallery: true, preview: { images: [{ source: { url: 'https://ex.com/g.jpg' } }] } } },
    ];
    expect(mapRedditPosts(children, 'q')).toHaveLength(0);
  });

  it('preview가 없어도 i.redd.it 직접 링크는 포함한다', () => {
    const children = [{ data: { url_overridden_by_dest: 'https://i.redd.it/abc123' } }];
    const out = mapRedditPosts(children, 'q');
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://i.redd.it/abc123');
  });

  it('빈/무효 children은 빈 배열을 반환한다', () => {
    expect(mapRedditPosts([], 'q')).toEqual([]);
    expect(mapRedditPosts([{ data: undefined }], 'q')).toEqual([]);
  });
});

describe('extractYoutubeVideoIds', () => {
  it('videoId 패턴을 추출하고 중복을 제거한다', () => {
    const html = `{"videoId":"abcdefghijk"}{"videoId":"abcdefghijk"}{"videoId":"zzzzzzzzzzz"}`;
    expect(extractYoutubeVideoIds(html, 10)).toEqual(['abcdefghijk', 'zzzzzzzzzzz']);
  });

  it('cap을 초과하지 않는다', () => {
    const html = `{"videoId":"aaaaaaaaaaa"}{"videoId":"bbbbbbbbbbb"}{"videoId":"ccccccccccc"}`;
    expect(extractYoutubeVideoIds(html, 2)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  });

  it('빈 입력이나 cap<=0이면 빈 배열을 반환한다', () => {
    expect(extractYoutubeVideoIds('', 10)).toEqual([]);
    expect(extractYoutubeVideoIds('{"videoId":"aaaaaaaaaaa"}', 0)).toEqual([]);
  });
});
