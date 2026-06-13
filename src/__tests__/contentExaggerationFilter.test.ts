import { describe, expect, it } from 'vitest';
import { filterExaggeratedContent } from '../contentExaggerationFilter.js';

describe('contentExaggerationFilter', () => {
  it('removes prompt leakage phrases before publishing text', () => {
    const result = filterExaggeratedContent('실제 경험을 바탕으로, 오늘은 사용감을 정리합니다.');

    expect(result).toBe('오늘은 사용감을 정리합니다.');
  });

  it('removes leaked internal setting values', () => {
    const result = filterExaggeratedContent("targetAge: '20대'\n본문만 남습니다.");

    expect(result).toBe('본문만 남습니다.');
  });

  it('softens exaggerated marketing expressions', () => {
    const result = filterExaggeratedContent('이건 100% 완벽한 필수 제품입니다.');

    expect(result).toBe('이건 대부분 좋은 추천할 만한 제품입니다.');
  });

  it('removes trailing CTA text from generated body content', () => {
    const result = filterExaggeratedContent('본문입니다.\n🔗 자세히 보기');

    expect(result).toBe('본문입니다.');
  });
});
