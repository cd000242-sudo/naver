/**
 * Coupang crawler constants — CSS selectors and ad-image exclusion patterns.
 * @module crawler/shopping/providers/coupang/constants
 *
 * Extracted verbatim from CoupangProvider.ts. Centralizing these makes UI
 * changes on Coupang's side a single-file edit.
 */

/**
 * 쿠팡 이미지 선택자
 */
export const COUPANG_SELECTORS = {
    mainImage: [
        '.prod-image__detail img',
        '#productImage img',
        '.prod-image img',
        '.prod-image__item img',
        'img[alt*="상품"]',
    ],
    galleryImages: [
        '.prod-image__items img',
        '.prod-image__list img',
        '.other-images img',
        '.prod-image__thumb img',
    ],
    detailImages: [
        '.product-detail-content-inside img',
        '.product-detail img',
        '#productDescriptionContent img',
    ],
    productName: [
        '.prod-buy-header__title',
        'h2.prod-buy-header__title',
        '.prod-buy-header h2',
    ],
    price: [
        '.total-price strong',
        '.prod-price .total-price',
        '.prod-coupon-price .total-price',
    ],
};

/**
 * 쿠팡 광고/프로모션 이미지 패턴 (제외 대상)
 */
export const COUPANG_AD_PATTERNS = [
    /\/np\//i,
    /\/marketing\//i,
    /\/event\//i,
    /\/banner\//i,
    /coupang-logo/i,
    /rocket-/i,
    /rocketwow/i,
    /badge/i,
    /icon/i,
    /seller-logo/i,
    /\/static\//i,
    /\/assets\//i,
    /thumbnail.*small/i,
    /100x100/i,
    /50x50/i,
    /loading/i,
    /placeholder/i,
    // ✅ [2026-03-13] 추가 패턴: 광고/추천/쿠폰/프로모션 이미지 제거
    /\/ad\//i,
    /promotion/i,
    /coupon/i,
    /\/recommend\//i,
    /\/widget\//i,
    /sprite/i,
    /logo/i,
    /payment/i,
    /delivery/i,
    /guarantee/i,
    /\/common\//i,
    /\/category\//i,
    /seller.*profile/i,
    /\/brand-shop\//i,
    /rating.*star/i,
    /empty.*image/i,
    /no.*image/i,
    /blank/i,
];
