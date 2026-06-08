/**
 * 쇼핑몰 크롤러 공통 타입 정의
 * @module crawler/shopping/types
 */

/**
 * 수집된 제품 이미지
 */
export interface ProductImage {
    url: string;
    // ✅ [v2.10.319] 'gallery-thumb-fallback' 추가 — BrandStoreProvider PHASE 0에서
    //   추가이미지 클릭 polling 실패 시 썸네일 src를 fallback으로 쓰는 타입. 기존 코드가
    //   리터럴로 사용 중인데 유니온에 없어 `as ProductImage[]` 캐스팅으로 타입 위반 억제하던 것 해소.
    type: 'main' | 'gallery' | 'gallery-thumb-fallback' | 'detail' | 'review';
    width?: number;
    height?: number;
    alt?: string;
    isValidated?: boolean;  // AI 검증 통과 여부
}

/**
 * 제품 정보
 */
export interface ProductInfo {
    name: string;
    price?: string;
    originalPrice?: string;
    description?: string;
    options?: string[];
    stock?: string;
    rating?: string;
    reviewCount?: number;
    brand?: string;
    availability?: string;
    canonicalUrl?: string;
}

export interface ShoppingCollectionDiagnostics {
    imageCount: number;
    galleryCount?: number;
    detailCount?: number;
    reviewCount?: number;
    quality: 'ok' | 'weak' | 'failed';
    warnings: string[];
}

/**
 * 이미지 수집 결과
 */
export interface CollectionResult {
    success: boolean;
    images: ProductImage[];
    productInfo?: ProductInfo;
    diagnostics?: ShoppingCollectionDiagnostics;
    usedStrategy: string;      // 성공한 전략 이름
    timing: number;            // 소요 시간 (ms)
    error?: string;            // 실패 시 에러 메시지
    isErrorPage?: boolean;     // 에러 페이지 감지 여부
    resolvedUrl?: string;      // 리다이렉트 후 최종 URL
}

/**
 * 수집 전략
 */
export interface CollectionStrategy {
    name: string;
    priority: number;
    execute: (url: string, options?: CollectionOptions) => Promise<CollectionResult>;
}

/**
 * 수집 옵션
 */
export interface CollectionOptions {
    timeout?: number;          // 타임아웃 (기본 30초)
    maxImages?: number;        // 최대 이미지 수 (기본 30)
    includeDetails?: boolean;  // 상세 이미지 포함 (기본 false)
    includeReviews?: boolean;  // 리뷰 이미지 포함 (기본 false)
    reviewFallbackWhenGalleryWeak?: boolean; // 제품 갤러리가 대표 1장 수준일 때만 리뷰 이미지 보완
    validateWithAI?: boolean;  // AI 품질 검증 (기본 true)
    useCache?: boolean;        // 캐시 사용 (기본 true)
}

/**
 * 플랫폼 타입
 */
export type ShoppingPlatform =
    | 'brand-store'      // 네이버 브랜드스토어
    | 'smart-store'      // 네이버 스마트스토어
    | 'coupang'          // 쿠팡
    | 'gmarket'          // G마켓
    | '11st'             // 11번가
    | 'unknown';

/**
 * 에러 페이지 감지 패턴
 */
export const ERROR_PAGE_INDICATORS = [
    '페이지를 찾을 수 없습니다',
    '존재하지 않는 상품',
    '판매 종료',
    '품절',
    'Page not found',
    '[에러] 에러페이지',
    '시스템오류',
    '현재 서비스 접속이 불가합니다',
    '동시에 접속하는 이용자 수가 많거나',
    '접근할 수 없는 페이지',
    '404',
    '브랜드커넥트 에러',
];

/**
 * 광고/배너 이미지 필터링 패턴
 */
export const AD_BANNER_PATTERNS = [
    /\/np\//i,           // 쿠팡 프로모션
    /banner/i,
    /promotion/i,
    /event/i,
    /logo/i,
    /icon/i,
    /placeholder/i,
    /loading/i,
    /spinner/i,
    /ad_/i,
    /_ad\./i,
];

/**
 * 최소 이미지 크기 (픽셀)
 */
export const MIN_IMAGE_SIZE = 100;

/**
 * 플랫폼별 레이트 리밋 설정
 */
export const RATE_LIMITS: Record<ShoppingPlatform, { requests: number; perSeconds: number }> = {
    'brand-store': { requests: 10, perSeconds: 60 },
    'smart-store': { requests: 30, perSeconds: 60 },
    'coupang': { requests: 20, perSeconds: 60 },
    'gmarket': { requests: 15, perSeconds: 60 },
    '11st': { requests: 15, perSeconds: 60 },
    'unknown': { requests: 5, perSeconds: 60 },
};
