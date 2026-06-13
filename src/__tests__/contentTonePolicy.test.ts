import { describe, expect, it } from 'vitest';
import { getAutoToneByCategory } from '../contentTonePolicy.js';

describe('contentTonePolicy', () => {
  it('uses safe defaults when category is missing', () => {
    expect(getAutoToneByCategory(undefined, 'seo')).toBe('calm_info');
    expect(getAutoToneByCategory(undefined, 'mate')).toBe('calm_info');
    expect(getAutoToneByCategory(undefined, 'homefeed')).toBe('friendly');
    expect(getAutoToneByCategory(undefined, 'business')).toBe('professional');
  });

  it('keeps homefeed categories conversational and community-like', () => {
    expect(getAutoToneByCategory('육아 결혼 출산', 'homefeed')).toBe('mom_cafe');
    expect(getAutoToneByCategory('웹툰 스타 연예인', 'homefeed')).toBe('community_fan');
    expect(getAutoToneByCategory('부산 국내여행', 'homefeed')).toBe('storyteller');
    expect(getAutoToneByCategory('건강 재테크 IT', 'homefeed')).toBe('friendly');
  });

  it('keeps SEO and mate categories information-oriented', () => {
    expect(getAutoToneByCategory('건강 다이어트', 'seo')).toBe('mentor');
    expect(getAutoToneByCategory('경제 투자 부동산', 'seo')).toBe('data_verified');
    expect(getAutoToneByCategory('IT 가전 자동차', 'mate')).toBe('data_verified');
    expect(getAutoToneByCategory('패션 뷰티 상품리뷰', 'seo')).toBe('sincere_exposure');
  });

  it('keeps shopping and business modes distinct', () => {
    expect(getAutoToneByCategory('노트북 IT 가전', 'affiliate')).toBe('expert_review');
    expect(getAutoToneByCategory('육아 아이 가족', 'affiliate')).toBe('mom_cafe');
    expect(getAutoToneByCategory('병원 의료 법률', 'business')).toBe('calm_info');
    expect(getAutoToneByCategory('일반 업체 홍보', 'business')).toBe('professional');
  });
});
