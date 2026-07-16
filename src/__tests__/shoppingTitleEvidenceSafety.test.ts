import { describe, expect, it } from 'vitest';

import {
  filterShoppingTitleEvidenceSafeKeywords,
  sanitizeShoppingConnectFallbackTitle,
  SHOPPING_TITLE_FALLBACK_KEYWORDS,
} from '../naverSearchApi';

describe('shopping title evidence safety', () => {
  it('removes unsupported experience terms from autocomplete and deterministic fallbacks', () => {
    expect(filterShoppingTitleEvidenceSafeKeywords([
      '가격', '솔직후기', '내돈내산', '실사용 리뷰', '선택 기준', '가격',
    ])).toEqual(['가격', '선택 기준']);

    expect(SHOPPING_TITLE_FALLBACK_KEYWORDS.join(' ')).not.toMatch(/후기|리뷰|내돈내산|실사용|체험/);
    expect(SHOPPING_TITLE_FALLBACK_KEYWORDS.join(' ')).not.toMatch(/가격|스펙|기능|구성|크기/);
  });

  it('strips unsupported experience and promotional claims from a fallback product title', () => {
    expect(sanitizeShoppingConnectFallbackTitle('고요아 냉풍기 솔직 후기 내돈내산 최고 추천'))
      .toBe('고요아 냉풍기 추천');
  });
});
