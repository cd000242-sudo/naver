import { SHOPPING_SELECTORS } from '../config/selectors.js';

/**
 * 썸네일 URL을 원본 고화질 URL로 변환합니다.
 */
export function normalizeImageUrl(url: string): string {
    if (!url) return '';
    let cleanUrl = url.trim();

    // 1. 네이버 (pstatic.net): 썸네일 파라미터 제거 및 고화질 교체
    if (cleanUrl.includes('pstatic.net') || cleanUrl.includes('naver.net')) {
        // type 파라미터가 있으면 고화질(f640)로 변경, 없으면 그대로 둠
        if (cleanUrl.includes('type=')) {
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
