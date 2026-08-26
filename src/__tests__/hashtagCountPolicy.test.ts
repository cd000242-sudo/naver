import { describe, it, expect } from 'vitest';
import {
  resolveHashtagCountRange,
  clampHashtags,
  NAVER_HASHTAG_HARD_LIMIT,
} from '../content/hashtagCountPolicy';

const tags = (n: number) => Array.from({ length: n }, (_, i) => `#태그${i + 1}`);

describe('해시태그 개수 단일 출처 (2026-08-26)', () => {
  it('SEO는 프롬프트 HT-3대로 15개까지 살린다 — 예전 5개 절단이 사라진다', () => {
    const result = clampHashtags(tags(12), 'seo');
    expect(result.hashtags).toHaveLength(12);
    expect(result.droppedCount).toBe(0);
  });

  it('홈판은 7개까지만 — 모드마다 상한이 다르다', () => {
    expect(clampHashtags(tags(12), 'homefeed').hashtags).toHaveLength(7);
    expect(clampHashtags(tags(12), 'affiliate').hashtags).toHaveLength(12);
  });

  it('상한을 넘으면 뒤에서부터 버린다 — 핵심 태그가 앞에 있다', () => {
    const result = clampHashtags(tags(20), 'seo');
    expect(result.hashtags[0]).toBe('#태그1');
    expect(result.hashtags).not.toContain('#태그16');
    expect(result.droppedCount).toBe(5);
  });

  it('모자라도 채우지 않는다 (HT-2 변형 채우기 금지)', () => {
    const result = clampHashtags(tags(3), 'seo');
    expect(result.hashtags).toHaveLength(3);
  });

  it('어떤 모드도 네이버 상한 30개를 넘지 않는다', () => {
    for (const mode of ['seo', 'homefeed', 'affiliate', 'mate', 'unknown']) {
      expect(resolveHashtagCountRange(mode).max).toBeLessThanOrEqual(NAVER_HASHTAG_HARD_LIMIT);
    }
  });
});
