import { describe, expect, it } from 'vitest';
import {
  extractPolicyFactLines,
  resolvePolicySourceMaterialType,
} from '../contentPolicy/sourceEvidence';

describe('content policy source evidence', () => {
  it('keeps price and product-spec lines even when they appear after the first 20 source lines', () => {
    const filler = Array.from({ length: 25 }, (_, index) => `일반 상품 설명 ${index + 1}입니다.`);
    const raw = [
      ...filler,
      '판매 가격은 45,800원이며 옵션에 따라 달라질 수 있습니다.',
      '윈드포스 통풍 구조와 12V 전원 연결 방식을 사용합니다.',
    ].join('\n');

    const facts = extractPolicyFactLines(raw, 30);

    expect(facts.some((fact) => fact.includes('45,800원'))).toBe(true);
    expect(facts.some((fact) => fact.includes('12V'))).toBe(true);
  });

  it('treats an affiliate shopping page as source evidence but keeps a normal blog URL as reference', () => {
    expect(resolvePolicySourceMaterialType({
      url: 'https://naver.me/example',
      contentMode: 'affiliate',
      articleType: 'shopping_review',
    })).toBe('official');
    expect(resolvePolicySourceMaterialType({
      url: 'https://blog.naver.com/example/1',
      contentMode: 'seo',
      articleType: 'general',
    })).toBe('reference');
  });
});
