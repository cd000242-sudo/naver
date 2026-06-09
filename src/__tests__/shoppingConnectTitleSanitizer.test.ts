import { describe, expect, it } from 'vitest';
import { sanitizeReviewTitle } from '../contentKeywordPrefix';

describe('shopping connect review title sanitizer', () => {
  it('removes store metadata, price, awkward recipient wording, and duplicate review words', () => {
    const title = '오아 버블 디스펜서 자동 손세정기:스토어, 25,800원에 어떤 분께 가성비 후기 리뷰 총정리';
    const productName = '오아 버블 디스펜서 자동 손세정기';

    const sanitized = sanitizeReviewTitle(title, productName);

    expect(sanitized).toContain(productName);
    expect(sanitized).not.toContain('스토어');
    expect(sanitized).not.toContain('25,800원');
    expect(sanitized).not.toContain('어떤 분께');
    expect(sanitized).not.toContain('후기 리뷰');
    expect(sanitized).toBe('오아 버블 디스펜서 자동 손세정기, 가성비 후기 총정리');
  });

  it('falls back to a clean product review title when marketplace artifacts remain', () => {
    const sanitized = sanitizeReviewTitle(
      '테팔 매직핸즈 브랜드스토어 39,900원 네이버쇼핑 판매처 후기 리뷰',
      '테팔 매직핸즈'
    );

    expect(sanitized).not.toMatch(/스토어|네이버쇼핑|판매처|\d[\d,]*원|후기\s*리뷰/);
    expect(sanitized).toBe('테팔 매직핸즈, 실사용 장단점 정리');
  });

  it('keeps already natural shopping review titles readable', () => {
    const sanitized = sanitizeReviewTitle(
      '다이슨 무풍 공기청정기, 실사용 장단점 정리',
      '다이슨 무풍 공기청정기'
    );

    expect(sanitized).toBe('다이슨 무풍 공기청정기, 실사용 장단점 정리');
  });

  it('also cleans product names when crawler metadata leaks into the product field', () => {
    const sanitized = sanitizeReviewTitle(
      '가성비 후기 리뷰',
      '오아 버블 디스펜서 자동 손세정기:스토어, 25,800원'
    );

    expect(sanitized).toBe('오아 버블 디스펜서 자동 손세정기 가성비 후기');
    expect(sanitized).not.toMatch(/스토어|\d[\d,]*원|후기\s*리뷰/);
  });
});
