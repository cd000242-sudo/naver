import { describe, expect, it } from 'vitest';
import { buildModeBasedPrompt, type ContentSource } from '../contentGenerator';

describe('affiliate price bridge', () => {
  it('uses a valid nested crawler price when top-level productPrice is missing', () => {
    const source: ContentSource = {
      sourceType: 'custom_text',
      rawText: '상품명: 차량용 통풍시트',
      title: '차량용 통풍시트',
      contentMode: 'affiliate',
      articleType: 'shopping_spec_analysis',
      productSpec: '국내 생산 차량용 통풍시트',
      productInfo: {
        name: '차량용 통풍시트',
        price: 45800,
        category: '자동차용품',
      },
    };

    const prompt = buildModeBasedPrompt(source, 'affiliate', undefined, 1800);

    expect(prompt).toContain('45,800원');
  });
});
