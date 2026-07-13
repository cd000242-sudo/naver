import { describe, it, expect } from 'vitest';
import {
  extractLabeledPrice,
  parsePrice,
  formatPrice,
  hasValidPrice,
  formatPriceOrEmpty,
} from '../services/priceNormalizer';

describe('extractLabeledPrice', () => {
  it('restores the collected price from assembled shopping source text', () => {
    const sourceText = [
      '상품명: 차량용 통풍시트',
      '가격: 45,800원',
      '수집 시점 표시 가격: 45,800원',
    ].join('\n');

    expect(extractLabeledPrice(sourceText)).toBe('45,800원');
  });

  it('ignores unlabeled numbers and invalid labeled prices', () => {
    expect(extractLabeledPrice('상품번호 2884318642')).toBeNull();
    expect(extractLabeledPrice('가격: 0원')).toBeNull();
    expect(extractLabeledPrice('가격 정보 없음')).toBeNull();
  });
});

describe('parsePrice — reproduction cases for "0원에 판매중" bug', () => {
  it('returns null for number 0 (품절/단종 상품)', () => {
    expect(parsePrice(0)).toBeNull();
  });

  it('returns null for string "0"', () => {
    expect(parsePrice('0')).toBeNull();
  });

  it('returns null for string "0원"', () => {
    expect(parsePrice('0원')).toBeNull();
  });

  it('returns null for string "0,000원" (formatted zero)', () => {
    expect(parsePrice('0,000원')).toBeNull();
  });

  it('returns null for legacy fallback "가격 정보 없음"', () => {
    expect(parsePrice('가격 정보 없음')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePrice('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parsePrice('   ')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parsePrice(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for negative number', () => {
    expect(parsePrice(-100)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(parsePrice(NaN)).toBeNull();
  });

  it('returns null for "문의" (contact-for-price)', () => {
    expect(parsePrice('문의')).toBeNull();
  });

  it('returns null for "무료"', () => {
    expect(parsePrice('무료')).toBeNull();
  });

  it('returns null for "품절"', () => {
    expect(parsePrice('품절')).toBeNull();
  });
});

describe('parsePrice — valid inputs', () => {
  it('parses plain number 15370', () => {
    expect(parsePrice(15370)).toBe(15370);
  });

  it('parses formatted string "15,370원"', () => {
    expect(parsePrice('15,370원')).toBe(15370);
  });

  it('parses string with spaces " 12345 "', () => {
    expect(parsePrice(' 12345 ')).toBe(12345);
  });

  it('parses string with currency symbol "₩12,345"', () => {
    expect(parsePrice('₩12,345')).toBe(12345);
  });

  it('parses stringified number "32900"', () => {
    expect(parsePrice('32900')).toBe(32900);
  });

  it('floors fractional numbers', () => {
    expect(parsePrice(15370.9)).toBe(15370);
  });

  it('treats a JSON-LD decimal suffix as decimals instead of concatenating it', () => {
    expect(parsePrice('47158.00')).toBe(47158);
    expect(parsePrice('47,158.00원')).toBe(47158);
  });

  it('rejects text containing multiple different numeric values', () => {
    expect(parsePrice('47,158원 20% 할인')).toBeNull();
    expect(parsePrice('정가 55,000원 판매가 47,158원')).toBeNull();
  });
});

describe('formatPrice', () => {
  it('returns null for zero', () => {
    expect(formatPrice(0)).toBeNull();
  });

  it('returns null for "0원"', () => {
    expect(formatPrice('0원')).toBeNull();
  });

  it('formats 15370 as "15,370원"', () => {
    expect(formatPrice(15370)).toBe('15,370원');
  });

  it('formats "15370" as "15,370원"', () => {
    expect(formatPrice('15370')).toBe('15,370원');
  });

  it('preserves existing formatting "15,370원" as-is', () => {
    expect(formatPrice('15,370원')).toBe('15,370원');
  });

  it('formats JSON-LD decimal prices without multiplying them by 100', () => {
    expect(formatPrice('47158.00')).toBe('47,158원');
  });
});

describe('hasValidPrice', () => {
  it('returns false for zero', () => {
    expect(hasValidPrice(0)).toBe(false);
  });

  it('returns false for "0원"', () => {
    expect(hasValidPrice('0원')).toBe(false);
  });

  it('returns false for "가격 정보 없음"', () => {
    expect(hasValidPrice('가격 정보 없음')).toBe(false);
  });

  it('returns true for valid positive price', () => {
    expect(hasValidPrice(15370)).toBe(true);
  });

  it('returns true for formatted valid price', () => {
    expect(hasValidPrice('15,370원')).toBe(true);
  });
});

describe('formatPriceOrEmpty — legacy compatibility', () => {
  it('returns empty string for invalid price', () => {
    expect(formatPriceOrEmpty(0)).toBe('');
    expect(formatPriceOrEmpty('0원')).toBe('');
    expect(formatPriceOrEmpty('가격 정보 없음')).toBe('');
  });

  it('returns formatted string for valid price', () => {
    expect(formatPriceOrEmpty(15370)).toBe('15,370원');
  });
});
