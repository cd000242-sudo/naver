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
    expect(prompt).toContain('수집 당시 판매 페이지 표시값');
    expect(prompt).not.toContain('현재 45,800원에 판매 중');
    expect(prompt).not.toContain('현재 네이버 스마트스토어에서 45,800원');
  });
});
