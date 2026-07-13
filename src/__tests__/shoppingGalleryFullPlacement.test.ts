import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mergeOfficialNaverProductGallery } from '../crawler/shopping/utils/officialNaverProductGallery.js';

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
    const images = mergeOfficialNaverProductGallery(
      ['https://shop-phinf.pstatic.net/product/main.jpg?type=m1000_pd'],
      ['https://shop-phinf.pstatic.net/dthumb?src=proxy-image'],
    );

    expect(images).toEqual([
      'https://shop-phinf.pstatic.net/product/main.jpg?type=m1000_pd',
    ]);
  });
});

// [2026-06-12 정책 확정] 사용자 지시: 소제목 배치는 추가이미지(제품 사진)만,
// 상세페이지 이미지는 본문과 무관하므로 배치 금지, 추가이미지 부족분만
// 리뷰이미지로 채움 (저작권 감수는 사용자 정책 결정).
describe('이미지 배치 정책 — 상세페이지 금지 + 추가이미지 우선 (2026-06-12)', () => {
  it('쇼핑 분기 source.images에 detailImages가 들어가지 않는다', () => {
    const src = read('src', 'sourceAssembler.ts');
    expect(src).not.toContain('...(productInfo.detailImages || [])');
    expect(src).not.toContain('...(retryInfo.detailImages || [])');
  });

  it('퍼피티어 수집 병합도 제품 이미지 → 리뷰 순서이고 상세 이미지는 제외된다', () => {
    const src = read('src', 'sourceAssembler.ts');
    const merged = src.match(/const finalImages = \[[\s\S]*?\];/);
    expect(merged).not.toBeNull();
    expect(merged![0]).not.toContain('detailImages');
    const productIdx = merged![0].indexOf('productImages');
    const reviewIdx = merged![0].indexOf('reviewImages');
    expect(productIdx).toBeGreaterThan(-1);
    expect(reviewIdx).toBeGreaterThan(productIdx);
  });
});
