import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  dedupeProductImages,
  isNonProductDetailImage,
  selectImagesByTier,
  DEFAULT_IMAGE_TARGET,
} from '../crawler/shopping/imageTierSelection';
import type { ProductImage } from '../crawler/shopping/types';

/**
 * [2026-08-06 사용자 지시] 쇼핑 이미지 수집 우선순위 하네스.
 *
 * "추가이미지를 먼저 수집하고 부족하면 상세페이지 이미지를 가져오고, 상세페이지
 *  이미지는 제품이 없는 이미지는 제외하고 가져와서 소제목과 맞는 이미지를 배치.
 *  이마저도 부족하다면 리뷰이미지를 사용. 절대 중복 이미지는 수집하면 안 된다."
 *
 * 실측 결함 2겹:
 *   (1) 핸들러가 includeDetails:false 를 하드코딩 — 상세 단계 자체가 차단됐다.
 *   (2) 전략 체인이 첫 성공에서 종료 — 갤러리만 얻고 부족해도 다음 소스로 안 갔다.
 */

const img = (url: string, type: ProductImage['type'], extra: Partial<ProductImage> = {}): ProductImage => ({
  url,
  type,
  ...extra,
} as ProductImage);

describe('selectImagesByTier — 단계적 폴백', () => {
  it('갤러리가 충분하면 갤러리만 쓴다 (상세·리뷰 미사용)', () => {
    const images = [
      ...Array.from({ length: 8 }, (_, i) => img(`https://cdn/g${i}.jpg`, 'gallery')),
      img('https://cdn/d1.jpg', 'detail'),
      img('https://cdn/r1.jpg', 'review'),
    ];
    const picked = selectImagesByTier(images, { target: 6 });
    expect(picked).toHaveLength(6);
    expect(picked.every((p) => p.type === 'gallery' || p.type === 'main')).toBe(true);
  });

  it('갤러리가 부족하면 상세로 보완한다 (리뷰보다 먼저)', () => {
    const images = [
      img('https://cdn/g1.jpg', 'gallery'),
      img('https://cdn/g2.jpg', 'gallery'),
      ...Array.from({ length: 5 }, (_, i) => img(`https://cdn/d${i}.jpg`, 'detail')),
      ...Array.from({ length: 5 }, (_, i) => img(`https://cdn/r${i}.jpg`, 'review')),
    ];
    const picked = selectImagesByTier(images, { target: 6 });
    expect(picked).toHaveLength(6);
    expect(picked.slice(0, 2).every((p) => p.type === 'gallery')).toBe(true);
    expect(picked.slice(2).every((p) => p.type === 'detail')).toBe(true);
    expect(picked.some((p) => p.type === 'review')).toBe(false);
  });

  it('갤러리+상세로도 부족하면 리뷰로 보완한다', () => {
    const images = [
      img('https://cdn/g1.jpg', 'gallery'),
      img('https://cdn/d1.jpg', 'detail'),
      ...Array.from({ length: 6 }, (_, i) => img(`https://cdn/r${i}.jpg`, 'review')),
    ];
    const picked = selectImagesByTier(images, { target: 6 });
    expect(picked).toHaveLength(6);
    expect(picked[0].type).toBe('gallery');
    expect(picked[1].type).toBe('detail');
    expect(picked.slice(2).every((p) => p.type === 'review')).toBe(true);
  });

  it('상세 단계에서 제품 없는 이미지(배너·안내·텍스트)는 제외한다', () => {
    const images = [
      img('https://cdn/g1.jpg', 'gallery'),
      img('https://cdn/detail_banner_event.jpg', 'detail'),
      img('https://cdn/notice_delivery_guide.png', 'detail'),
      img('https://cdn/detail_product_shot.jpg', 'detail'),
      img('https://cdn/size_chart_table.jpg', 'detail'),
    ];
    const picked = selectImagesByTier(images, { target: 5 });
    const urls = picked.map((p) => p.url);
    expect(urls).toContain('https://cdn/detail_product_shot.jpg');
    expect(urls).not.toContain('https://cdn/detail_banner_event.jpg');
    expect(urls).not.toContain('https://cdn/notice_delivery_guide.png');
    expect(urls).not.toContain('https://cdn/size_chart_table.jpg');
  });

  it('가로로 긴 상세 이미지(띠배너 비율)는 제품 이미지로 보지 않는다', () => {
    const images = [
      img('https://cdn/g1.jpg', 'gallery'),
      img('https://cdn/d_wide.jpg', 'detail', { width: 1200, height: 120 }),
      img('https://cdn/d_normal.jpg', 'detail', { width: 800, height: 800 }),
    ];
    const picked = selectImagesByTier(images, { target: 5 });
    expect(picked.map((p) => p.url)).not.toContain('https://cdn/d_wide.jpg');
    expect(picked.map((p) => p.url)).toContain('https://cdn/d_normal.jpg');
  });

  it('목표 개수 기본값이 정의돼 있다', () => {
    expect(DEFAULT_IMAGE_TARGET).toBeGreaterThanOrEqual(5);
  });
});

describe('dedupeProductImages — 중복 절대 금지', () => {
  it('쿼리 파라미터만 다른 같은 이미지는 1회만', () => {
    const images = [
      img('https://cdn/a.jpg?type=m1000_pd', 'gallery'),
      img('https://cdn/a.jpg?type=f640_640', 'detail'),
      img('https://cdn/a.jpg', 'review'),
      img('https://cdn/b.jpg', 'gallery'),
    ];
    const out = dedupeProductImages(images);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('gallery'); // 먼저 온 것(상위 티어) 보존
  });

  it('크기 접미사만 다른 같은 파일도 중복으로 본다', () => {
    const images = [
      img('https://cdn/shot_1000x1000.jpg', 'gallery'),
      img('https://cdn/shot_640x640.jpg', 'detail'),
      img('https://cdn/other.jpg', 'gallery'),
    ];
    expect(dedupeProductImages(images)).toHaveLength(2);
  });

  it('프로토콜·호스트 대소문자 차이도 중복으로 본다', () => {
    const images = [
      img('https://CDN.example.com/x.jpg', 'gallery'),
      img('http://cdn.example.com/x.jpg', 'detail'),
    ];
    expect(dedupeProductImages(images)).toHaveLength(1);
  });

  it('선택 결과에는 중복이 남지 않는다 (통합)', () => {
    const images = [
      img('https://cdn/same.jpg?type=m1000_pd', 'gallery'),
      img('https://cdn/same.jpg?type=w80', 'detail'),
      img('https://cdn/g2.jpg', 'gallery'),
      img('https://cdn/d2.jpg', 'detail'),
    ];
    const picked = selectImagesByTier(images, { target: 10 });
    const norm = picked.map((p) => p.url.split('?')[0].toLowerCase());
    expect(new Set(norm).size).toBe(norm.length);
  });
});

describe('isNonProductDetailImage — 제품 없는 상세 이미지 판정', () => {
  it.each([
    'https://cdn/event_banner.jpg',
    'https://cdn/delivery_notice.png',
    'https://cdn/as_guide.jpg',
    'https://cdn/coupon_download.png',
    'https://cdn/size_chart.jpg',
  ])('%s 는 제품 없음으로 판정', (url) => {
    expect(isNonProductDetailImage({ url, type: 'detail' } as ProductImage)).toBe(true);
  });

  it.each([
    'https://cdn/product_main_shot.jpg',
    'https://cdn/8464207616_detail_3.jpg',
  ])('%s 는 제품 이미지로 통과', (url) => {
    expect(isNonProductDetailImage({ url, type: 'detail' } as ProductImage)).toBe(false);
  });
});

describe('배선 계약 (소스)', () => {
  it('핸들러가 상세·리뷰를 켜고 목표 개수를 전달한다', () => {
    const handler = readFileSync(
      new URL('../main/ipc/imageCollectShoppingHandlers.ts', import.meta.url), 'utf8',
    );
    expect(handler).not.toMatch(/includeDetails:\s*false/);
    expect(handler).toMatch(/includeDetails:\s*true/);
    expect(handler).toMatch(/includeReviews:\s*true/);
    expect(handler).toMatch(/targetImageCount/);
  });

  it('BaseProvider 가 단계적 선택기를 사용한다 (첫 성공 종료 시에도 티어 보장)', () => {
    const base = readFileSync(
      new URL('../crawler/shopping/providers/BaseProvider.ts', import.meta.url), 'utf8',
    );
    expect(base).toMatch(/selectImagesByTier/);
    expect(base).toMatch(/dedupeProductImages/);
  });

  // [2026-08-06] "소제목과 맞는 이미지를 배치" — 쇼핑 모드는 매칭을 통째로 건너뛰고
  // 순차 할당만 했다(shouldMatchCollected 가 affiliate 를 제외).
  it('쇼핑 모드도 수집 이미지 소제목 매칭을 수행한다', () => {
    const handlers = readFileSync(
      new URL('../renderer/modules/publishingHandlers.ts', import.meta.url), 'utf8',
    );
    expect(handlers).not.toMatch(/shouldMatchCollected\s*=\s*formData\.contentMode !== 'affiliate'/);
    expect(handlers).toMatch(/shouldMatchCollected[\s\S]{0,160}useAiImage/);
  });

  it('쇼핑 배치가 매칭 결과(referenceImagePath)를 우선 사용한다', () => {
    const handlers = readFileSync(
      new URL('../renderer/modules/publishingHandlers.ts', import.meta.url), 'utf8',
    );
    // affiliate 에서 매핑 경로를 무조건 버리던 분기가 없어야 한다
    expect(handlers).not.toMatch(/let path = formData\.contentMode === 'affiliate' \? '' : \(h\.referenceImagePath \|\| ''\)/);
    expect(handlers).toMatch(/매칭 결과[\s\S]{0,120}referenceImagePath|referenceImagePath[\s\S]{0,80}매칭 결과/);
  });
});
