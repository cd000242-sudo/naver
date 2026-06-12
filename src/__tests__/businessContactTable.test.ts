import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * 업체홍보 문의 안내 표 이미지 계약 (2026-06-12 사용자 요청):
 * 연락 채널을 표 이미지로 깔끔하게 정리해 글 하단에 자동 삽입 — 문의 전환 유도.
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

describe('업체홍보 문의 안내 표 (2026-06-12)', () => {
  it('tableImageGenerator가 문의 표 생성기를 내보낸다', () => {
    const src = read('src', 'image', 'tableImageGenerator.ts');
    expect(src).toContain('export async function generateContactTableImage');
    expect(src).toContain('문의 안내');
  });

  it('editorHelpers가 business 모드 마지막 섹션에서 문의 표를 삽입한다', () => {
    const src = read('src', 'automation', 'editorHelpers.ts');
    expect(src).toContain('isBusinessPromoMode');
    expect(src).toContain('generateContactTableImage');
    expect(src).toContain('문의 표 생성 실패(발행 계속)');
  });

  it('fullAutoFlow가 business 모드에서 businessInfo를 발행 옵션에 전달한다', () => {
    const src = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    expect(src).toMatch(/businessInfo: formData\.contentMode === 'business'/);
  });

  it('자동화 옵션 인터페이스에 businessInfo 필드가 있다', () => {
    const src = read('src', 'naverBlogAutomation.ts');
    expect((src.match(/businessInfo\?: Record<string, any>/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
