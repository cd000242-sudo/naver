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

  /*
   * [2026-08-31] 이 케이스는 "100% -> 대부분" 치환을 정답으로 박제하고 있었다.
   * 그 치환은 수치를 뭉개서 사실을 바꾼다 — "제작비 100% 를 사비로" 가
   * "대부분 사비로" 가 되면 다른 말이다. 치환을 없앴으니 단언도 의도대로 고친다.
   *
   * 광고 표현 순화라는 이 테스트의 본래 목적은 그대로 지킨다:
   * 완벽한 · 필수는 계속 순화하고, 숫자만 건드리지 않는다.
   */
  it('softens exaggerated marketing expressions without destroying numbers', () => {
    const result = filterExaggeratedContent('이건 100% 완벽한 필수 제품입니다.');

    expect(result).toBe('이건 100% 좋은 추천할 만한 제품입니다.');
    expect(result).not.toMatch(/대부분/);
  });

  it('removes trailing CTA text from generated body content', () => {
    const result = filterExaggeratedContent('본문입니다.\n🔗 자세히 보기');

    expect(result).toBe('본문입니다.');
  });
});
