/**
 * [2026-08-06] Shopping image tier selection — 사용자 지시 하네스.
 *
 * "추가이미지를 먼저 수집하고 부족하면 상세페이지 이미지를 가져오고, 상세페이지
 *  이미지는 제품이 없는 이미지는 제외하고 가져와서 소제목과 맞는 이미지를 배치.
 *  이마저도 부족하다면 리뷰이미지를 사용. 절대 중복 이미지는 수집하면 안 된다."
 *
 * Live defect (v2.11.176 and earlier): the IPC handler hardcoded
 * includeDetails:false, so the detail tier was blocked outright, and the
 * strategy chain returned on first success — a gallery-only strategy ended the
 * run even when it fell short of the target. Result: gallery images only.
 *
 * This module is pure so the tier policy is testable without a browser.
 */
import type { ProductImage } from './types.js';

/** 소제목당 1장 + 대표 1장을 감당할 기본 목표치. */
export const DEFAULT_IMAGE_TARGET = 7;

/** 티어 순서 — 낮을수록 먼저 쓴다. */
const TIER_ORDER: Record<ProductImage['type'], number> = {
  main: 0,
  gallery: 0,
  'gallery-thumb-fallback': 1,
  detail: 2,
  review: 3,
};

/**
 * 같은 이미지의 다른 표현을 하나로 접는 정규화 키.
 * 네이버 CDN 은 같은 파일을 ?type=m1000_pd / ?type=f640_640 / 무쿼리로 뿌리고,
 * 파일명에 _1000x1000 같은 크기 접미사를 붙이기도 한다.
 */
export function normalizeImageKey(rawUrl: string): string {
  const url = String(rawUrl ?? '').trim();
  if (!url) return '';
  const withoutQuery = url.split('?')[0].split('#')[0];
  const withoutProtocol = withoutQuery.replace(/^https?:\/\//i, '');
  return withoutProtocol
    .toLowerCase()
    .replace(/[_-]\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i, '') // shot_1000x1000.jpg → shot.jpg
    .replace(/\/+$/, '');
}

/** 중복 제거 — 먼저 온 항목(상위 티어)을 남긴다. */
export function dedupeProductImages(images: readonly ProductImage[]): ProductImage[] {
  const seen = new Set<string>();
  const out: ProductImage[] = [];
  for (const image of images) {
    const key = normalizeImageKey(image?.url ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(image);
  }
  return out;
}

/**
 * 제품이 찍히지 않은 상세 이미지(안내·배너·표) 판정.
 *
 * 상세페이지는 제품 사진과 안내물이 섞여 있다. 안내물을 본문에 넣으면 글이
 * 광고 전단처럼 보이므로 제외한다. 파일명 신호 + 띠배너 비율로 거른다 —
 * 확실한 신호만 쓰고 애매하면 통과시킨다(제품 사진을 잃는 쪽이 더 나쁘다).
 */
const NON_PRODUCT_URL_PATTERNS: readonly RegExp[] = [
  /banner/i,
  /notice/i,
  /guide/i,
  /coupon/i,
  /event/i,
  /delivery/i,
  /shipping/i,
  /refund|exchange|return_/i,
  /(^|[/_-])as[_-]/i,
  /size[_-]?(chart|table|info)/i,
  /caution|warning/i,
  /brand[_-]?story/i,
  /footer|header/i,
];

export function isNonProductDetailImage(image: ProductImage): boolean {
  const url = String(image?.url ?? '');
  if (!url) return true;
  if (NON_PRODUCT_URL_PATTERNS.some((pattern) => pattern.test(url))) return true;

  // 띠배너 비율(가로가 세로의 4배 이상 또는 세로가 가로의 4배 이상)은 안내물이다.
  const { width, height } = image;
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio >= 4 || ratio <= 0.25) return true;
  }
  return false;
}

export interface TierSelectionOptions {
  /** 목표 장수 — 소제목 수 + 대표 1장 기준으로 호출부가 정한다. */
  readonly target?: number;
}

/**
 * 갤러리 → 상세(제품 있는 것만) → 리뷰 순으로 목표치까지 채운다.
 * 상위 티어로 목표를 채우면 하위 티어는 쓰지 않는다.
 */
export function selectImagesByTier(
  images: readonly ProductImage[],
  options: TierSelectionOptions = {},
): ProductImage[] {
  const target = Math.max(1, options.target ?? DEFAULT_IMAGE_TARGET);
  const unique = dedupeProductImages(images.filter((img) => !!img?.url));

  const byTier = (tier: number): ProductImage[] =>
    unique.filter((img) => (TIER_ORDER[img.type] ?? 9) === tier);

  const picked: ProductImage[] = [];
  const pushUntilTarget = (candidates: readonly ProductImage[]): void => {
    for (const candidate of candidates) {
      if (picked.length >= target) return;
      picked.push(candidate);
    }
  };

  // 1티어: 대표·추가이미지(갤러리)
  pushUntilTarget(byTier(0));
  if (picked.length >= target) return picked;

  // 1.5티어: 썸네일 폴백 갤러리
  pushUntilTarget(byTier(1));
  if (picked.length >= target) return picked;

  // 2티어: 상세 — 제품이 없는 안내물은 제외
  pushUntilTarget(byTier(2).filter((img) => !isNonProductDetailImage(img)));
  if (picked.length >= target) return picked;

  // 3티어: 리뷰
  pushUntilTarget(byTier(3));
  return picked;
}
