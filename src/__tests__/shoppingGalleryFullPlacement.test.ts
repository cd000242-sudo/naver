import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * SPEC-STABILITY-2026 쇼핑커넥트 갤러리 전량 배치 계약.
 * 라이브 실측(2026-06-12): 갤러리 10장 수집해도 소제목당 1장 규칙이 나머지를
 * 전부 버림 + dthumb 프록시 URL이 쿼리 제거 정규화로 404(발행물 빈 슬롯).
 */
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(process.cwd(), ...segments), 'utf-8');

describe('쇼핑커넥트 갤러리 전량 배치 (2026-06-12)', () => {
  it('B경로가 남은 갤러리를 라운드로빈 추가 배치하고 리뷰 사진은 제외한다', () => {
    const src = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    expect(src).toContain('leftoverGallery');
    expect(src).toContain('image\\.nmv|checkout\\.phinf');
    expect(src).toContain('headingsArray.length * 2');
  });

  it('크롤러는 확장자 없는 프록시 URL(dthumb)을 갤러리에 넣지 않는다', () => {
    const src = read('src', 'crawler', 'productSpecCrawler.ts');
    expect(src).toMatch(/\\.\(jpe\?g\|png\|webp\)\$\/i\.test\(base\)/);
  });
});
