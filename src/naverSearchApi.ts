/**
 * 네이버 검색 API 모듈
 * - 쇼핑, 블로그, 뉴스, 웹문서, 지식iN 검색 지원
 * - 일일 25,000회 호출 가능
 * 
 * API 문서: https://developers.naver.com/docs/serviceapi/search/
 */

import { loadConfig } from './configManager.js';

// ==================== 타입 정의 ====================

export interface NaverSearchConfig {
    clientId: string;
    clientSecret: string;
}

// 쇼핑 검색 결과
export interface ShoppingItem {
    title: string;       // 상품명 (HTML 태그 포함 가능)
    link: string;        // 상품 URL
    image: string;       // 상품 이미지 URL
    lprice: string;      // 최저가
    hprice: string;      // 최고가
    mallName: string;    // 판매처
    productId: string;   // 상품 ID
    productType: string; // 상품 타입 (1:일반, 2:중고, 3:단종, 4:판매예정)
    brand: string;       // 브랜드
    maker: string;       // 제조사
    category1: string;   // 카테고리 대분류
    category2: string;   // 카테고리 중분류
    category3: string;   // 카테고리 소분류
    category4: string;   // 카테고리 세분류
}

// 블로그 검색 결과
export interface BlogItem {
    title: string;         // 블로그 포스트 제목
    link: string;          // 블로그 포스트 URL
    description: string;   // 포스트 요약
    bloggername: string;   // 블로거 이름
    bloggerlink: string;   // 블로그 주소
    postdate: string;      // 블로그 포스트 작성일 (YYYYMMDD)
}

// 뉴스 검색 결과
export interface NewsItem {
    title: string;         // 뉴스 제목
    originallink: string;  // 원본 뉴스 URL
    link: string;          // 네이버 뉴스 URL
    description: string;   // 뉴스 요약
    pubDate: string;       // 뉴스 발행 시간
}

// 웹문서 검색 결과
export interface WebDocItem {
    title: string;       // 문서 제목
    link: string;        // 문서 URL
    description: string; // 문서 요약
}

// 지식iN 검색 결과
export interface KinItem {
    title: string;       // 질문 제목
    link: string;        // 질문 URL
    description: string; // 질문 내용 요약
}

// 검색 옵션
export interface SearchOptions {
    query: string;           // 검색어
    display?: number;        // 검색 결과 개수 (기본 10, 최대 100)
    start?: number;          // 검색 시작 위치 (기본 1, 최대 1000)
    sort?: 'sim' | 'date';   // 정렬 (sim: 정확도순, date: 날짜순)
}

// 쇼핑 검색 옵션 (독립 정의 - sort 타입 충돌 방지)
export interface ShoppingSearchOptions {
    query: string;           // 검색어
    display?: number;        // 검색 결과 개수 (기본 10, 최대 100)
    start?: number;          // 검색 시작 위치 (기본 1, 최대 1000)
    sort?: 'sim' | 'date' | 'asc' | 'dsc';  // asc: 가격낮은순, dsc: 가격높은순
    filter?: string;         // 필터 옵션 (naverpay 등)
    exclude?: string;        // 제외 옵션 (used:중고, rental:렌탈, cbshop:해외직구)
}

// API 응답
export interface NaverSearchResponse<T> {
    lastBuildDate: string;
    total: number;
    start: number;
    display: number;
    items: T[];
}

// ==================== API 호출 함수 ====================

/**
 * 네이버 검색 API 기본 호출 함수
 */
async function callNaverSearchApi<T>(
    endpoint: string,
    options: SearchOptions,
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<T>> {
    // 설정 로드
    let clientId = config?.clientId;
    let clientSecret = config?.clientSecret;

    if (!clientId || !clientSecret) {
        const appConfig = await loadConfig();
        clientId = appConfig.naverClientId || appConfig.naverDatalabClientId;
        clientSecret = appConfig.naverClientSecret || appConfig.naverDatalabClientSecret;
    }

    if (!clientId || !clientSecret) {
        throw new Error('네이버 검색 API 키가 설정되지 않았습니다. 설정에서 Client ID와 Client Secret을 입력해주세요.');
    }

    // URL 생성
    const params = new URLSearchParams();
    params.append('query', options.query);
    params.append('display', String(options.display || 10));
    params.append('start', String(options.start || 1));
    if (options.sort) {
        params.append('sort', options.sort);
    }

    const url = `https://openapi.naver.com/v1/search/${endpoint}.json?${params.toString()}`;

    console.log(`[NaverSearchAPI] ${endpoint} 검색: "${options.query}"`);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`네이버 검색 API 오류 (${response.status}): ${errorText}`);
    }

    const data = await response.json() as NaverSearchResponse<T>;
    console.log(`[NaverSearchAPI] ${endpoint} 검색 완료: ${data.items.length}개 결과`);

    return data;
}

// ==================== 검색 함수들 ====================

/**
 * 쇼핑 검색 - 상품 정보 조회
 */
export async function searchShopping(
    options: ShoppingSearchOptions,
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<ShoppingItem>> {
    // sort 타입이 다르므로 기본 옵션만 전달하고 sort는 별도 처리
    const baseOptions: SearchOptions = {
        query: options.query,
        display: options.display,
        start: options.start,
        sort: options.sort === 'asc' || options.sort === 'dsc' ? 'sim' : options.sort,
    };
    return callNaverSearchApi<ShoppingItem>('shop', baseOptions, config);
}

/**
 * 블로그 검색 - 참고자료 수집용
 */
export async function searchBlog(
    options: SearchOptions,
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<BlogItem>> {
    return callNaverSearchApi<BlogItem>('blog', options, config);
}

/**
 * 뉴스 검색 - 최신 이슈 수집용
 */
export async function searchNews(
    options: SearchOptions,
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<NewsItem>> {
    return callNaverSearchApi<NewsItem>('news', options, config);
}

/**
 * 웹문서 검색 - 일반 정보 수집용
 */
export async function searchWebDoc(
    options: SearchOptions,
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<WebDocItem>> {
    return callNaverSearchApi<WebDocItem>('webkr', options, config);
}

/**
 * 지식iN 검색 - Q&A 정보 수집용
 */
export async function searchKin(
    options: SearchOptions,
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<KinItem>> {
    return callNaverSearchApi<KinItem>('kin', options, config);
}

// ==================== 유틸리티 함수 ====================

/**
 * HTML 태그 제거 (검색 결과에서 <b> 태그 등 제거)
 */
export function stripHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '');
}

/**
 * brand.naver.com URL에서 상품명 추출
 */
export function extractProductNameFromUrl(url: string): string | null {
    // URL 디코딩
    const decoded = decodeURIComponent(url);

    // 패턴: /products/숫자?... 앞의 경로에서 상품명 추출 시도
    // 또는 쿼리 파라미터에서 추출

    // 방법 1: URL 경로에서 추출 시도
    const pathMatch = decoded.match(/\/products\/(\d+)/);
    if (pathMatch) {
        return pathMatch[1]; // 상품 ID 반환
    }

    return null;
}

/**
 * 쇼핑 검색으로 상품 정보 빠르게 가져오기
 * - brand.naver.com URL 크롤링 대체용
 */
export async function getProductInfoFast(
    productUrl: string,
    config?: NaverSearchConfig
): Promise<{
    success: boolean;
    product?: ShoppingItem;
    error?: string;
}> {
    try {
        // URL에서 상품명 추출 시도
        const decoded = decodeURIComponent(productUrl);

        // 간단한 상품명 추출 (URL 마지막 경로에서)
        const urlParts = decoded.split('/');
        let searchQuery = urlParts[urlParts.length - 1].split('?')[0];

        // 숫자만 있으면 상품 ID이므로 검색 어려움
        if (/^\d+$/.test(searchQuery)) {
            return {
                success: false,
                error: '상품 ID만으로는 검색이 어렵습니다. 상품명을 직접 입력해주세요.',
            };
        }

        // 쇼핑 검색
        const result = await searchShopping({ query: searchQuery, display: 1 }, config);

        if (result.items.length > 0) {
            return {
                success: true,
                product: result.items[0],
            };
        }

        return {
            success: false,
            error: '검색 결과가 없습니다.',
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
        };
    }
}

/**
 * 에러 발생 시 반환할 빈 응답 객체 생성 헬퍼
 */
function createEmptyResponse<T>(): NaverSearchResponse<T> {
    return {
        lastBuildDate: new Date().toString(),
        total: 0,
        start: 0,
        display: 0,
        items: []
    };
}

/**
 * 키워드로 다중 소스 검색 (블로그 + 뉴스 + 웹문서)
 * - 참고자료 수집용
 */
export async function searchMultipleSources(
    keyword: string,
    config?: NaverSearchConfig
): Promise<{
    blogs: BlogItem[];
    news: NewsItem[];
    webDocs: WebDocItem[];
    totalCount: number;
}> {
    console.log(`[NaverSearchAPI] 다중 소스 검색 시작: "${keyword}"`);

    // ✅ Promise.all + catch에서 완벽한 객체를 반환하여 타입 일치
    const [blogResult, newsResult, webResult] = await Promise.all([
        searchBlog({ query: keyword, display: 5 }, config).catch(() => createEmptyResponse<BlogItem>()),
        searchNews({ query: keyword, display: 5 }, config).catch(() => createEmptyResponse<NewsItem>()),
        searchWebDoc({ query: keyword, display: 5 }, config).catch(() => createEmptyResponse<WebDocItem>()),
    ]);

    // ✅ 이제 'as any' 없이도 안전하게 접근 가능
    const totalCount =
        blogResult.items.length +
        newsResult.items.length +
        webResult.items.length;

    console.log(`[NaverSearchAPI] 다중 소스 검색 완료: 총 ${totalCount}개 결과`);

    return {
        blogs: blogResult.items,
        news: newsResult.items,
        webDocs: webResult.items,
        totalCount,
    };
}

/**
 * ✅ [2026-01-25] 네이버 검색창 자동완성 크롤링 (Puppeteer)
 * - 실제 네이버 검색창에서 자동완성 결과 수집
 * - 예: "케어팟 가습기 x50v" → ["단점", "사용법", "내돈내산", "스탠드", ...]
 */
export async function crawlNaverAutocomplete(keyword: string): Promise<string[]> {
    if (!keyword || keyword.trim().length < 2) return [];

    try {
        const puppeteer = await import('puppeteer-core');

        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.CHROME_PATH || '',
        ].filter(Boolean);

        let browser = null;
        for (const chromePath of chromePaths) {
            try {
                browser = await puppeteer.default.launch({
                    headless: true,
                    executablePath: chromePath,
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                });
                break;
            } catch (e) { continue; }
        }

        if (!browser) {
            console.warn('[NaverAutocomplete] 브라우저 실행 실패');
            return [];
        }

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto('https://www.naver.com', { waitUntil: 'networkidle2', timeout: 15000 });
        await page.waitForSelector('#query', { timeout: 5000 });
        await page.type('#query', keyword.trim(), { delay: 50 });
        await new Promise(r => setTimeout(r, 1000));

        // 자동완성 아이템 추출 (검증된 셀렉터 사용)
        const suggestions = await page.evaluate(() => {
            const items: string[] = [];
            const selectors = ['#autocomplete_wrap li', '.ac_list li', '[role="listbox"] li'];
            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach((el) => {
                    const text = el.textContent?.trim();
                    if (text && !items.includes(text)) items.push(text);
                });
            }
            return items;
        });

        await browser.close();

        // 검색어에서 추가된 세부 키워드만 추출
        const keywordLower = keyword.trim().toLowerCase();
        const extractedKeywords: string[] = [];

        for (const suggestion of suggestions) {
            const suggestionLower = suggestion.toLowerCase();
            if (suggestionLower.startsWith(keywordLower) || suggestionLower.includes(keywordLower)) {
                const remaining = suggestion.replace(new RegExp(keyword.trim(), 'gi'), '').trim();
                if (remaining && remaining.length >= 2 && !extractedKeywords.includes(remaining)) {
                    extractedKeywords.push(remaining);
                }
            }
        }

        console.log(`[NaverAutocomplete] "${keyword}" → [${extractedKeywords.slice(0, 5).join(', ')}]`);
        return extractedKeywords.slice(0, 5);
    } catch (error) {
        console.warn(`[NaverAutocomplete] 크롤링 실패: ${(error as Error).message}`);
        return [];
    }
}

/**
 * ✅ [2026-01-25] Gemini AI로 SEO 키워드 생성
 * - 제품명을 입력하면 관련 검색 키워드 추천
 * - 네이버 자동완성보다 정확하고 안정적
 */
export async function getSeoKeywordsWithGemini(productName: string): Promise<string[]> {
    if (!productName || productName.trim().length < 3) return [];

    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');

        // 환경변수에서 API 키 가져오기
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[SEO Gemini] API 키가 없습니다.');
            return [];
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `당신은 네이버 쇼핑 SEO 전문가입니다.

다음 제품에 대해 사용자들이 네이버에서 실제로 검색할 것 같은 세부 키워드 2-3개를 추천해주세요.

제품명: ${productName.trim()}

규칙:
1. 제품명에 이미 포함된 단어는 제외
2. 구매 의도가 있는 검색 키워드 (예: 후기, 비교, 성능, 소음, 전기세 등)
3. 각 키워드는 1-2단어로 짧게
4. JSON 배열 형식으로만 응답 (예: ["후기", "전기세", "소음"])

응답:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // JSON 파싱
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
            const keywords = JSON.parse(jsonMatch[0]) as string[];
            const validKeywords = keywords
                .filter(k => typeof k === 'string' && k.trim().length > 0)
                .map(k => k.trim())
                .slice(0, 3);

            console.log(`[SEO Gemini] "${productName}" → [${validKeywords.join(', ')}]`);
            return validKeywords;
        }

        return [];
    } catch (error) {
        console.warn(`[SEO Gemini] 키워드 생성 실패: ${(error as Error).message}`);
        return [];
    }
}

/**
 * ✅ [2026-01-24] 네이버 자동완성 API (비공식) - 폴백용
 */
export async function getNaverAutocomplete(keyword: string): Promise<string[]> {
    if (!keyword || keyword.trim().length < 2) return [];

    try {
        const encodedKeyword = encodeURIComponent(keyword.trim());
        const url = `https://ac.search.naver.com/nx/ac?q=${encodedKeyword}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'https://www.naver.com/',
            },
        });

        if (!response.ok) return [];

        const data = await response.json();
        const suggestions: string[] = [];
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
            const items = data.items[0];
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (Array.isArray(item) && item.length > 0) {
                        const suggestion = item[0];
                        if (typeof suggestion === 'string' && suggestion.trim()) {
                            suggestions.push(suggestion.trim());
                        }
                    }
                }
            }
        }
        return suggestions.slice(0, 10);
    } catch (error) {
        return [];
    }
}

/**
 * ✅ [2026-01-24] 쇼핑커넥트 SEO 제목 생성
 * - 제품명 + 네이버 자동완성 세부키워드 조합
 * - 예: "캐치웰 CX PRO 매직타워 N 자동먼지비움 가성비 추천"
 */
export async function generateShoppingConnectTitle(
    productName: string,
    maxKeywords: number = 2
): Promise<string> {
    if (!productName || productName.trim().length < 3) {
        return productName || '';
    }

    const cleanName = productName.trim();

    // 제품 카테고리별 최적화된 SEO 키워드
    const categoryKeywords: Record<string, string[]> = {
        '가습기': ['추천', '사용후기'],
        '청소기': ['추천', '성능비교'],
        '에어프라이어': ['추천', '요리레시피'],
        '공기청정기': ['추천', '필터성능'],
        '정수기': ['추천', '렌탈비교'],
        '냉장고': ['추천', '에너지효율'],
        '세탁기': ['추천', '소음비교'],
        '건조기': ['추천', '건조성능'],
        '식기세척기': ['추천', '설치후기'],
        '전기밥솥': ['추천', '밥맛비교'],
        '커피머신': ['추천', '캡슐호환'],
        '노트북': ['추천', '스펙비교'],
        '태블릿': ['추천', '가성비'],
        '이어폰': ['추천', '음질비교'],
        '스피커': ['추천', '음질'],
        '카메라': ['추천', '화질비교'],
        '화장품': ['추천', '피부타입별'],
        '스킨케어': ['추천', '성분분석'],
        '의자': ['추천', '허리편한'],
        '책상': ['추천', '높이조절'],
        '매트리스': ['추천', '숙면'],
        '베개': ['추천', '경추'],
        '조명': ['추천', '밝기조절'],
    };

    // ✅ [2026-01-24] 제품명 간소화 함수
    // 긴 제품명에서 핵심 부분만 추출 (브랜드 + 카테고리 + 모델명)
    const simplifyProductName = (name: string): string => {
        const nameLower = name.toLowerCase();
        const words = name.split(/\s+/);

        // 1. 카테고리 단어 찾기 (가습기, 청소기 등)
        let categoryWord = '';
        let categoryIndex = -1;
        for (const [category] of Object.entries(categoryKeywords)) {
            const idx = words.findIndex(w => w.includes(category));
            if (idx !== -1) {
                categoryWord = category;
                categoryIndex = idx;
                break;
            }
        }

        // 2. 모델명 찾기 (영문+숫자 조합, 예: X50V, CX PRO)
        const modelPattern = /^[A-Za-z0-9]+[-]?[A-Za-z0-9]*$/;
        const modelWords = words.filter(w => modelPattern.test(w) && w.length >= 2);
        const modelName = modelWords.slice(-2).join(' '); // 마지막 2개 모델명 사용

        // 3. 브랜드명 추출 (첫 단어, 보통 브랜드)
        const brandName = words[0] || '';

        // 4. 간소화된 제품명 조합
        if (categoryWord) {
            // 브랜드 + 카테고리 + 모델명
            const simplified = [brandName, categoryWord, modelName].filter(Boolean).join(' ');
            // 너무 짧으면 원본에서 앞부분 사용
            if (simplified.length < 10 && words.length > 3) {
                return words.slice(0, 4).join(' ');
            }
            return simplified;
        }

        // 카테고리 감지 실패 시 앞 4단어만 사용
        return words.slice(0, Math.min(4, words.length)).join(' ');
    };

    // 제품명 간소화 적용
    const simplifiedName = simplifyProductName(cleanName);
    console.log(`[SEO] 제품명 간소화: "${cleanName}" → "${simplifiedName}"`);

    try {
        // ✅ 1. 먼저 네이버 자동완성 크롤링 시도
        let seoKeywords = await crawlNaverAutocomplete(simplifiedName);

        // ✅ 2. 크롤링 실패 시 Gemini AI 폴백
        if (seoKeywords.length === 0) {
            console.log('[SEO] 자동완성 크롤링 결과 없음, Gemini AI 사용');
            seoKeywords = await getSeoKeywordsWithGemini(simplifiedName);
        }

        // ✅ 최종 제목 조합: 간소화된 제품명 + SEO 키워드 + "가성비 추천"
        const fixedSuffix = '가성비 추천';

        let finalTitle = simplifiedName;
        if (seoKeywords.length > 0) {
            const kwPart = seoKeywords.slice(0, 2).join(' ');
            finalTitle = `${simplifiedName} ${kwPart} ${fixedSuffix}`.trim();
        } else {
            finalTitle = `${simplifiedName} ${fixedSuffix}`.trim();
        }

        console.log(`[SEO Title] "${cleanName}" → "${finalTitle}"`);
        return finalTitle;
    } catch (error) {
        console.warn(`[SEO Title] 생성 실패: ${(error as Error).message}`);

        // 오류 시 기본 카테고리 키워드 사용
        const nameLower = cleanName.toLowerCase();
        let fallbackKeywords = ['추천', '가성비'];

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (nameLower.includes(category)) {
                fallbackKeywords = keywords;
                break;
            }
        }

        return `${cleanName} ${fallbackKeywords.slice(0, maxKeywords).join(' ')}`.trim();
    }
}
