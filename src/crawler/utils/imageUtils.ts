import { SHOPPING_SELECTORS } from '../config/selectors.js';

/**
 * 썸네일 URL을 원본 고화질 URL로 변환합니다.
 */
export function normalizeImageUrl(url: string): string {
    if (!url) return '';
    let cleanUrl = url.trim();

    // 1. 네이버 (pstatic.net): 썸네일 파라미터 제거 및 고화질 교체
    if (cleanUrl.includes('pstatic.net') || cleanUrl.includes('naver.net')) {
        // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 미지원 (404 방지)
        if (cleanUrl.includes('checkout.phinf') || cleanUrl.includes('image.nmv')) {
            cleanUrl = cleanUrl.replace(/\?type=.*$/, '');
        } else if (cleanUrl.includes('type=')) {
            // type 파라미터가 있으면 고화질(f640)로 변경, 없으면 그대로 둠
            cleanUrl = cleanUrl.replace(/[?&]type=[a-z]\d+/gi, '?type=f640');
        }
        // _thumb 등 썸네일 접미사 제거
        cleanUrl = cleanUrl.replace(/_thumb/gi, '').replace(/_small/gi, '');
    }

    // 2. 쿠팡: 썸네일 경로를 원본 경로로 변경
    if (cleanUrl.includes('coupang.com')) {
        cleanUrl = cleanUrl.replace(/\/thumbnail\//gi, '/');
        cleanUrl = cleanUrl.replace(/\/\d+x\d+\//gi, '/'); // 크기 지정 경로 제거
    }

    // 3. 공통: 끝부분의 불필요한 쿼리 제거
    return cleanUrl.replace(/\?$/, '').replace(/&$/, '');
}

/**
 * URL이 UI 요소(아이콘, 배너 등)인지 판별합니다.
 */
export function isUIGarbage(url: string): boolean {
    if (!url) return true;
    const lower = url.toLowerCase();

    // 1. 설정된 필터 패턴 확인
    const isPatternMatch = SHOPPING_SELECTORS.UI_FILTERS.some(pattern => lower.includes(pattern));
    if (isPatternMatch) return true;

    // 2. 매우 작은 이미지 썸네일 필터링 (예: 40x40)
    if (lower.includes('40x40') || lower.includes('50x50')) return true;

    // ✅ [2026-01-21 FIX] SVG/ICO 등 벡터/아이콘 이미지 명시적 필터링
    // SVG는 벡터 이미지로 블로그에 부적합, ICO는 파비콘
    if (/\.(svg|ico|cur)($|\?)/i.test(lower)) {
        console.log(`[ImageUtils] ⛔ 벡터/아이콘 이미지 제외: ${url.substring(0, 60)}...`);
        return true;
    }

    // 3. 확장자 체크 (래스터 이미지만 허용: jpg, jpeg, png, webp, gif, avif)
    // ✅ 'image'를 포함하는 URL도 허용하되, 반드시 래스터 이미지 확장자가 있어야 함
    const isRasterImage = /\.(jpg|jpeg|png|webp|gif|avif)($|\?)/i.test(lower);
    const hasImageInUrl = lower.includes('image') || lower.includes('pstatic') || lower.includes('phinf');

    // 래스터 이미지 확장자가 없고, URL에 image 관련 키워드도 없으면 필터링
    if (!isRasterImage && !hasImageInUrl) return true;

    // ✅ data URI 필터링 (base64 SVG 등)
    if (lower.startsWith('data:image/svg')) return true;

    return false;
}

/**
 * 중복 이미지 제거 (Set 사용)
 */
export function deduplicateImages(images: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const img of images) {
        const normalized = normalizeImageUrl(img);
        if (!normalized || isUIGarbage(normalized)) continue;

        // 쿼리 스트링 뗀 URL 기준으로 중복 체크
        const baseUrl = normalized.split('?')[0];
        if (!seen.has(baseUrl)) {
            seen.add(baseUrl);
            result.push(normalized);
        }
    }
    return result;
}

// ==================== 뉴스/워터마크 이미지 필터링 ====================

/**
 * ✅ [2026-02-12] 뉴스/워터마크/언론사 이미지 필터링
 * - 저작권 리스크 방지 (무단 사용 시 연락 올 수 있음)
 * - URL 도메인 + 경로 패턴 기반 자동 판별
 */

// 뉴스 이미지 도메인 패턴 (한국 + 해외)
const NEWS_DOMAIN_PATTERNS = [
    // 네이버 뉴스 이미지 서버
    'imgnews.pstatic.net',
    'mimgnews.pstatic.net',
    // 한국 주요 언론사
    'news1.kr',           // 뉴스1
    'img.khan.co.kr',     // 경향신문
    'image.chosun.com',   // 조선일보
    'biz.chosun.com',
    'img.hani.co.kr',     // 한겨레
    'newsimg.hankookilbo', // 한국일보
    'img.sbs.co.kr',      // SBS
    'images.joins.com',   // 중앙일보
    'img.etoday.co.kr',   // 이투데이
    'img.sedaily.com',    // 서울경제
    'img.mk.co.kr',       // 매일경제
    'img.hankyung.com',   // 한국경제
    'image.kmib.co.kr',   // 국민일보
    'img.yonhapnews.co.kr', // 연합뉴스
    'yna.co.kr/photo',    // 연합뉴스 포토
    'photo.jtbc.co.kr',   // JTBC
    'image.dongascience', // 동아사이언스
    'cdn.donga.com',      // 동아일보
    'img.tvchosun.com',   // TV조선
    'img.mbn.co.kr',      // MBN
    'image.ytn.co.kr',    // YTN
    'img.insight.co.kr',  // 인사이트
    'dispatch.cdnser.be', // 디스패치
    'img.sportsworldi',   // 스포츠월드
    'img.starnewskorea',  // 스타뉴스
    'img.newsen.com',     // 뉴센
    // 해외 뉴스
    'media.gettyimages',  // 게티이미지
    'cdn.cnn.com',
    'static.reuters.com',
    'img.bbc.co.uk',
];

// URL 경로 기반 뉴스/언론사 패턴
const NEWS_PATH_PATTERNS = [
    '/news/',
    '/article/',
    '/journalist/',
    '/reporter/',
    '/press/',
    '/media/photo/',
    '/newsphoto/',
    '/photonews/',
];

// 워터마크/저작권 관련 URL 패턴
const WATERMARK_URL_PATTERNS = [
    'watermark',
    'copyright',
    'press_photo',
    'editorial',
    'gettyimages',
    'shutterstock',          // 유료 이미지
    'istockphoto',           // 유료 이미지
    'alamy.com',             // 유료 이미지
    'dreamstime.com',        // 유료 이미지
];

/**
 * URL이 뉴스/워터마크/언론사 이미지인지 판별
 * @param url 이미지 URL
 * @param sourceDomain 출처 도메인 (선택)
 * @returns true이면 사용 금지 이미지
 */
export function isNewsOrWatermarkedImage(url: string, sourceDomain?: string): boolean {
    if (!url) return true;
    const lower = url.toLowerCase();

    // 1. 뉴스 도메인 체크
    for (const pattern of NEWS_DOMAIN_PATTERNS) {
        if (lower.includes(pattern.toLowerCase())) {
            return true;
        }
    }

    // 2. 뉴스 경로 패턴 체크
    for (const pattern of NEWS_PATH_PATTERNS) {
        if (lower.includes(pattern)) {
            return true;
        }
    }

    // 3. 워터마크/저작권 URL 패턴 체크
    for (const pattern of WATERMARK_URL_PATTERNS) {
        if (lower.includes(pattern)) {
            return true;
        }
    }

    // 4. 출처 도메인이 뉴스 사이트인지 체크
    if (sourceDomain) {
        const sourceLower = sourceDomain.toLowerCase();
        for (const pattern of NEWS_DOMAIN_PATTERNS) {
            if (sourceLower.includes(pattern.toLowerCase())) {
                return true;
            }
        }
        // 일반적인 뉴스 도메인 패턴
        if (/news|press|media|journal|daily|times|post|herald|gazette/i.test(sourceLower)) {
            // 단, 이미지 호스팅 사이트는 제외
            if (!sourceLower.includes('imgur') && !sourceLower.includes('flickr') && !sourceLower.includes('unsplash')) {
                return true;
            }
        }
    }

    return false;
}
