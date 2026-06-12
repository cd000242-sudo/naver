import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * 업체홍보 모드 확장 계약 (2026-06-12 사용자 요청):
 * ① 설정 모달 재오픈 버튼 (기존: _businessInfo 있으면 다시 못 엶)
 * ② 홍보 대상 선택 — 업체 자체 홍보 vs 취급 상품 판매
 * ③ 심층 리서치 URL — 업체 홈페이지/상품 페이지를 수집 파이프라인(rssUrl)에 주입
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

describe('업체홍보 홍보 대상 + 리서치 URL + 재오픈 (2026-06-12)', () => {
  it('모달 HTML에 홍보 대상 라디오와 리서치 URL 입력이 있다', () => {
    const html = read('public', 'index.html');
    expect(html).toContain('bgm-promo-business');
    expect(html).toContain('bgm-promo-product');
    expect(html).toContain('bgm-research-url');
    expect(html).toContain('open-business-info-btn');
  });

  it('renderer가 promoTarget/researchUrl을 저장·복원하고 재오픈 버튼을 바인딩한다', () => {
    const src = read('src', 'renderer', 'renderer.ts');
    expect(src).toContain('promoTarget');
    expect(src).toContain('researchUrl');
    expect(src).toContain("getElementById('open-business-info-btn')");
  });

  it('fullAutoFlow가 business 모드에서 researchUrl을 rssUrl로 주입한다', () => {
    const src = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    expect(src).toContain('researchUrl');
  });

  it('프롬프트에 홍보 대상별 분기(업체 자체 vs 취급 상품)가 있다', () => {
    const src = read('src', 'contentGenerator.ts');
    expect(src).toContain('홍보 대상: 취급 상품 판매');
    expect(src).toContain('홍보 대상: 업체 자체 홍보');
    expect(src).toContain('promoTarget');
  });
});
