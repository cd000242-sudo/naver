export const SHOPPING_SELECTORS = {
    // 네이버 브랜드 스토어 & 스마트스토어
    NAVER_BRAND: [
        // 1순위: 리뷰 포토 (실사용기)
        { priority: 'review', selector: '.review_item img, .review-photo img, .review_photo img, .photo_review img' },
        // 2순위: 상세/제품 이미지
        { priority: 'detail', selector: '.detail_img img, #INTRODUCE img, .se-main-container img, .product_detail img' },
        // 3순위: 네이버 쇼핑 이미지 서버 (가장 확실함)
        { priority: 'product', selector: 'img[src*="shop-phinf.pstatic.net"], img[src*="brand.naver.com"]' },
    ],

    // 쿠팡
    COUPANG: [
        { priority: 'product', selector: '.prod-image__detail img, .prod-image img, .prod-image-container img' },
        { priority: 'detail', selector: '#productDetail img, .product-description-container img' },
        { priority: 'review', selector: '.sdp-review__article__photo img' },
    ],

    // 알리익스프레스
    ALIEXPRESS: [
        { priority: 'product', selector: '.magnifier--image img, .pdp-main-image img' },
        { priority: 'detail', selector: '#nav-description img, .product-description img' },
        { priority: 'review', selector: '.review-image img' }
    ],

    // 일반적인 쇼핑몰 공통 패턴 (폴백용)
    GENERIC: [
        '[class*="review"] img',
        '[class*="photo"] img',
        '[class*="product"] img',
        '[class*="detail"] img',
        'img[itemprop="image"]'
    ],

    // UI 요소 필터링 (수집 제외)
    UI_FILTERS: [
        '/icon/', '/logo/', '/button/', '/ad/', '/banner/',
        'loading.gif', 'blank.gif', 'placeholder', 'favicon',
        'btn_', '_btn', 'nav_', '_nav'
    ]
};

export const TEXT_SELECTORS = {
    // 본문 추출용 선택자 우선순위
    CONTENT: [
        '.se-main-container', // 네이버 스마트에디터
        '#productDetail', // 쿠팡 상세
        '.product-detail', // 일반 쇼핑몰
        '.prod-description',
        '#INTRODUCE',
        '.post-content',
        'article',
        'main'
    ],
    // 제거할 불필요 요소
    GARBAGE: [
        'script', 'style', 'iframe', 'nav', 'header', 'footer',
        '.ads', '.comment', '.sidebar', '.menu'
    ]
};
