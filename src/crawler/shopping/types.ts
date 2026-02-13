/**
 * 쇼핑몰 크롤러 공통 타입 정의
 * @module crawler/shopping/types
 */

/**
 * 수집된 제품 이미지
 */
export interface ProductImage {
    url: string;
    type: 'main' | 'gallery' | 'detail' | 'review';
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
}

/**
 * 이미지 수집 결과
 */
export interface CollectionResult {
    success: boolean;
    images: ProductImage[];
    productInfo?: ProductInfo;
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
    includeDetails?: boolean;  // 상세 이미지 포함 (기본 true)
    includeReviews?: boolean;  // 리뷰 이미지 포함 (기본 false)
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
    '404',
    '접근할 수 없는 페이지',
    '브랜드커넥트',  // 브랜드커넥트 에러 페이지
    'brandconnect',
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
