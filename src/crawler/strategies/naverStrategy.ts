import { searchShopping } from '../../naverSearchApi.js';
import { normalizeImageUrl, isUIGarbage } from '../utils/imageUtils.js';

export interface NaverApiResult {
    success: boolean;
    images: string[];
    title?: string;
    description?: string;
    price?: string;
}

/**
 * 네이버 쇼핑 API를 사용하여 상품 정보를 빠르게 가져옵니다.
 * URL에서 상품명을 추출하여 검색합니다.
 */
export async function tryNaverApiFirst(
    url: string,
    clientId: string,
    clientSecret: string
): Promise<NaverApiResult> {
    try {
        console.log(`[Naver API] URL에서 상품 정보 추출 시도: ${url}`);

        // URL에서 상품명/키워드 추출
        const keyword = extractKeywordFromUrl(url);
        if (!keyword) {
            console.log(`[Naver API] URL에서 키워드 추출 실패`);
            return { success: false, images: [] };
        }

        console.log(`[Naver API] 키워드 "${keyword}"로 쇼핑 검색...`);

        // 네이버 쇼핑 API 호출
        const result = await searchShopping({
            query: keyword,
            display: 5,
            sort: 'date' // ✅ 최신순 (방금 올라온 글 우선)
        });

        if (!result.items || result.items.length === 0) {
            console.log(`[Naver API] 검색 결과 없음`);
            return { success: false, images: [] };
        }

        // 첫 번째 상품 정보 사용
        const topItem = result.items[0];
        const images: string[] = [];

        // 상품 이미지 수집
        result.items.slice(0, 3).forEach((item: any) => {
            if (item.image) {
                const normalized = normalizeImageUrl(item.image);
                if (normalized && !isUIGarbage(normalized)) {
                    images.push(normalized);
                }
            }
        });

        console.log(`[Naver API] 성공: ${images.length}개 이미지, 제목: ${topItem.title}`);

        return {
            success: true,
            images,
            title: topItem.title?.replace(/<[^>]+>/g, '') || '',
            description: `${topItem.productType || ''} ${topItem.brand || ''} ${topItem.category1 || ''}`.trim(),
            price: topItem.lprice || topItem.hprice || ''
        };

    } catch (error: any) {
        console.error(`[Naver API] 오류: ${error.message}`);
        return { success: false, images: [] };
    }
}

/**
 * 네이버 쇼핑 API를 사용하여 관련 상품 이미지를 검색합니다.
 * 크롤링 실패 시 최후의 폴백으로 사용됩니다.
 */
export async function searchNaverImages(
    keyword: string,
    clientId: string,
    clientSecret: string
): Promise<Array<{ title: string; link: string }>> {
    try {
        console.log(`[Naver Shopping Search] 키워드 "${keyword}"로 상품 이미지 검색...`);

        // 쇼핑 API로 상품 이미지 수집
        const result = await searchShopping({
            query: keyword,
            display: 10,
            sort: 'date' // ✅ 최신순
        });

        if (!result.items || result.items.length === 0) {
            console.log(`[Naver Shopping Search] 검색 결과 없음`);
            return [];
        }

        const validImages = result.items
            .filter((item: any) => item.image && !isUIGarbage(item.image))
            .map((item: any) => ({
                title: item.title?.replace(/<[^>]+>/g, '') || '',
                link: normalizeImageUrl(item.image)
            }));

        console.log(`[Naver Shopping Search] ${validImages.length}개 이미지 발견`);
        return validImages;

    } catch (error: any) {
        console.error(`[Naver Shopping Search] 오류: ${error.message}`);
        return [];
    }
}

/**
 * URL에서 상품명/키워드를 추출합니다.
 */
function extractKeywordFromUrl(url: string): string {
    try {
        const decoded = decodeURIComponent(url);

        // 1. 쿼리 파라미터에서 추출
        const urlObj = new URL(url);
        const queryKeyword = urlObj.searchParams.get('query') ||
            urlObj.searchParams.get('q') ||
            urlObj.searchParams.get('keyword') ||
            urlObj.searchParams.get('n_query') ||
            urlObj.searchParams.get('search');
        if (queryKeyword) return queryKeyword;

        // 2. URL 경로에서 한글 추출
        const pathParts = decoded.split('/').filter(p => p && /[가-힣]/.test(p));
        if (pathParts.length > 0) {
            const koreanPart = pathParts.reduce((a, b) =>
                a.replace(/[^가-힣\s]/g, '').length > b.replace(/[^가-힣\s]/g, '').length ? a : b
            );
            const keyword = koreanPart.split(/[?#&]/)[0].replace(/[^가-힣\s]/g, ' ').trim();
            if (keyword.length >= 2) return keyword.split(/\s+/).slice(0, 3).join(' ');
        }

        // 3. 상품 ID에서 추출 시도 (쿠팡 등)
        const productIdMatch = decoded.match(/products?\/(\d+)/i);
        if (productIdMatch) {
            return `상품 ${productIdMatch[1]}`;
        }

        return '';
    } catch {
        return '';
    }
}
