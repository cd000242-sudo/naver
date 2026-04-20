// Reproduction smoke tests for the "0원에 판매 중" bug (2026-04-20).
//
// The bug chain was:
//   1. bestProductCollector / sourceAssembler returned "0원" or "가격 정보 없음"
//      when the price extraction failed (out-of-stock, API schema change, etc).
//   2. promptLoader.buildFullPrompt unconditionally injected
//         💰 가격: ${productInfo.price}
//         - 가격 정보는 "현재 XX원에 판매 중" 형식으로 언급하세요.
//      without validating the price string.
//   3. The LLM obediently produced "현재 0원에 판매 중" in the published post.
//
// After the fix these tests assert:
//   A. Invalid prices (0, "0원", "가격 정보 없음", "", undefined) never appear
//      in the rendered prompt.
//   B. The "현재 XX원에 판매 중" directive is replaced with an explicit
//      price-omission instruction when the price is invalid.
//   C. Valid prices flow through untouched.

import { describe, it, expect } from 'vitest';
import { buildFullPrompt } from '../../promptLoader';

const BASE_ARGS = {
  mode: 'homefeed' as const,
  categoryHint: 'it',
  isFullAuto: false,
  toneStyle: 'friendly',
};

describe('Price-zero bug reproduction — prompt must not render invalid prices', () => {
  const invalidPrices: Array<readonly [string, unknown]> = [
    ['number 0', 0],
    ['string "0원"', '0원'],
    ['string "0"', '0'],
    ['legacy "가격 정보 없음"', '가격 정보 없음'],
    ['empty string', ''],
    ['undefined', undefined],
    ['품절', '품절'],
    ['문의', '문의'],
  ];

  for (const [label, badPrice] of invalidPrices) {
    it(`omits price line and swaps directive when price is ${label}`, () => {
      const prompt = buildFullPrompt(
        BASE_ARGS.mode,
        BASE_ARGS.categoryHint,
        BASE_ARGS.isFullAuto,
        BASE_ARGS.toneStyle,
        {
          name: '테스트 상품',
          spec: '용량 500ml',
          price: badPrice as string | undefined,
          reviews: [],
        },
      );

      // A. The bug signature literally cannot appear.
      expect(prompt).not.toContain('0원에 판매');
      expect(prompt).not.toMatch(/💰 가격:\s*0/);
      expect(prompt).not.toContain('가격 정보 없음');
      expect(prompt).not.toMatch(/💰 가격:\s*$/m);

      // B. The "현재 XX원에 판매 중" directive must NOT be active.
      expect(prompt).not.toContain('"현재 XX원에 판매 중" 형식');

      // The replacement directive should forbid any price mention.
      expect(prompt).toContain('가격 정보가 수집되지 않았습니다');
      expect(prompt).toContain('가격 관련 언급을 절대 포함하지 마세요');
    });
  }
});

describe('hookHint — user-provided 1-sentence hook injection (W2)', () => {
  it('injects the hook block when provided', () => {
    const prompt = buildFullPrompt(
      'homefeed',
      'it',
      false,
      'friendly',
      undefined,
      '3주 써보니 아이 코막힘이 사라졌어요',
    );
    expect(prompt).toContain('[사용자 후킹 1문장');
    expect(prompt).toContain('3주 써보니 아이 코막힘이 사라졌어요');
    expect(prompt).toContain('QUMA/DIA+');
  });

  it('omits the hook block when hookHint is empty string', () => {
    const prompt = buildFullPrompt('homefeed', 'it', false, 'friendly', undefined, '');
    expect(prompt).not.toContain('[사용자 후킹 1문장');
  });

  it('omits the hook block when hookHint is undefined', () => {
    const prompt = buildFullPrompt('homefeed', 'it', false, 'friendly', undefined, undefined);
    expect(prompt).not.toContain('[사용자 후킹 1문장');
  });

  it('trims whitespace and caps the hook at 40 chars', () => {
    const longHook = '   ' + 'A'.repeat(80) + '   ';
    const prompt = buildFullPrompt('homefeed', 'it', false, 'friendly', undefined, longHook);
    expect(prompt).toContain('[사용자 후킹 1문장');
    // After trim + slice(0, 40), only 40 'A's should appear.
    expect(prompt).toContain('A'.repeat(40));
    expect(prompt).not.toContain('A'.repeat(41));
  });

  it('omits when hookHint is whitespace only', () => {
    const prompt = buildFullPrompt('homefeed', 'it', false, 'friendly', undefined, '   \n\t  ');
    expect(prompt).not.toContain('[사용자 후킹 1문장');
  });
});

describe('Price-zero bug — valid prices must still render', () => {
  const validPrices: Array<readonly [string, unknown, string]> = [
    ['number 15370', 15370, '15,370원'],
    ['string "15370"', '15370', '15,370원'],
    ['formatted "15,370원"', '15,370원', '15,370원'],
    ['number 3200000', 3200000, '3,200,000원'],
  ];

  for (const [label, goodPrice, expectedFormatted] of validPrices) {
    it(`renders price block when price is ${label}`, () => {
      const prompt = buildFullPrompt(
        BASE_ARGS.mode,
        BASE_ARGS.categoryHint,
        BASE_ARGS.isFullAuto,
        BASE_ARGS.toneStyle,
        {
          name: '테스트 상품',
          spec: '용량 500ml',
          price: goodPrice as string,
          reviews: [],
        },
      );

      expect(prompt).toContain(`💰 가격: ${expectedFormatted}`);
      expect(prompt).toContain(`"현재 ${expectedFormatted}에 판매 중"`);
      expect(prompt).not.toContain('가격 정보가 수집되지 않았습니다');
    });
  }
});
