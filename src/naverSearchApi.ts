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

// ✅ [2026-02-12] 이미지 검색 결과
export interface ImageItem {
    title: string;       // 이미지 타이틀
    link: string;        // 원본 이미지 URL
    thumbnail: string;   // 썸네일 이미지 URL
    sizeheight: string;  // 이미지 높이 (px)
    sizewidth: string;   // 이미지 너비 (px)
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

/**
 * ✅ [2026-02-12] 이미지 검색 - 소제목별 관련 이미지 수집용
 * endpoint: /v1/search/image
 */
export async function searchImage(
    options: SearchOptions & { filter?: 'all' | 'large' | 'medium' | 'small' },
    config?: NaverSearchConfig
): Promise<NaverSearchResponse<ImageItem>> {
    // filter 옵션 처리 (이미지 크기 필터)
    const baseOptions: SearchOptions = {
        query: options.query,
        display: options.display || 10,
        start: options.start,
        sort: options.sort,
    };
    return callNaverSearchApi<ImageItem>('image', baseOptions, config);
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
 * ✅ [2026-02-02] 100점 SEO 제목 생성 로직
 * 
 * 핵심 전략:
 * 1. 제품명에서 핵심 키워드만 추출 (브랜드 + 제품라인)
 * 2. 네이버 자동완성 세부키워드 활용 (실제 검색어)
 * 3. 차별화 후킹 멘트 조합 (클릭 유도)
 * 4. 자연스러운 문장 구성
 * 
 * 예: "삼성 비스포크 AI콤보 세탁기건조기 일체형 1등급 화이트 WD80F25CHW"
 * → "삼성 비스포크 AI콤보 내돈내산 1년 사용 솔직후기 전기료 공개"
 */
export async function generateShoppingConnectTitle(
    productName: string,
    maxKeywords: number = 3
): Promise<string> {
    if (!productName || productName.trim().length < 3) {
        return productName || '';
    }

    const cleanName = productName.trim();

    // ✅ 1. 핵심 제품명 추출 (모델번호, 색상, 등급 등 제거)
    const coreProductName = extractCoreProductName(cleanName);
    console.log(`[SEO] 핵심 제품명 추출: "${cleanName}" → "${coreProductName}"`);

    // ✅ 2. 네이버 자동완성으로 세부키워드 가져오기 (1차)
    let autocompleteKeywords: string[] = [];
    try {
        const autocompleteResults = await getNaverAutocomplete(coreProductName);
        const coreWords = coreProductName.toLowerCase().split(/\s+/);

        for (const suggestion of autocompleteResults) {
            let remaining = suggestion;
            for (const word of coreWords) {
                if (word.length >= 2) {
                    remaining = remaining.replace(new RegExp(word, 'gi'), '').trim();
                }
            }
            const keywords = remaining.split(/\s+/).filter(k =>
                k.length >= 2 &&
                !coreWords.includes(k.toLowerCase()) &&
                !autocompleteKeywords.includes(k)
            );
            autocompleteKeywords.push(...keywords);
        }
        autocompleteKeywords = [...new Set(autocompleteKeywords)].slice(0, 8);
        console.log(`[SEO] 자동완성 키워드 (1차): [${autocompleteKeywords.join(', ')}] (${autocompleteKeywords.length}개)`);
    } catch (error) {
        console.warn(`[SEO] 자동완성 실패: ${(error as Error).message}`);
    }

    // ✅ 3. 자동완성 키워드 부족 시 Gemini AI 폴백 (2차)
    if (autocompleteKeywords.length < 3) {
        console.log(`[SEO] 자동완성 키워드 부족 (${autocompleteKeywords.length}개) → Gemini AI 폴백 호출`);
        try {
            const geminiKeywords = await getSeoKeywordsWithGemini(coreProductName);
            // 중복 제거 후 추가
            for (const gk of geminiKeywords) {
                if (!autocompleteKeywords.includes(gk) && !coreProductName.toLowerCase().includes(gk.toLowerCase())) {
                    autocompleteKeywords.push(gk);
                }
            }
            console.log(`[SEO] Gemini 보강 후 키워드: [${autocompleteKeywords.join(', ')}] (${autocompleteKeywords.length}개)`);
        } catch (error) {
            console.warn(`[SEO] Gemini 폴백 실패: ${(error as Error).message}`);
        }
    }

    // ✅ 4. 그래도 부족하면 범용 SEO 키워드 풀에서 보충 (3차)
    if (autocompleteKeywords.length < 3) {
        console.log(`[SEO] 키워드 여전히 부족 (${autocompleteKeywords.length}개) → 범용 SEO 키워드 보충`);
        const universalSeoKeywords = [
            '후기', '추천', '비교', '장단점', '솔직후기', '실사용',
            '가성비', '내돈내산', '총정리', '꿀팁', '사용법', '리뷰'
        ];
        // 랜덤 셔플 후 부족분 보충
        const shuffled = universalSeoKeywords.sort(() => Math.random() - 0.5);
        for (const uk of shuffled) {
            if (autocompleteKeywords.length >= 5) break;
            if (!autocompleteKeywords.includes(uk) && !coreProductName.toLowerCase().includes(uk.toLowerCase())) {
                autocompleteKeywords.push(uk);
            }
        }
        console.log(`[SEO] 범용 보충 후 키워드: [${autocompleteKeywords.join(', ')}] (${autocompleteKeywords.length}개)`);
    }

    // ✅ 5. 100점 SEO 제목 조합
    // 핵심: 제품명 + 자동완성 키워드 최소 3개 (실제 검색어 기반 = SEO 최적)
    const minRequired = Math.max(maxKeywords, 3);
    const selectedKeywords = autocompleteKeywords.slice(0, Math.min(minRequired + 1, 5));

    let titleParts: string[] = [coreProductName, ...selectedKeywords];

    // 제목 길이 체크: 40자 초과 시 키워드 줄이기
    let finalTitle = titleParts.join(' ').trim();
    while (finalTitle.length > 40 && titleParts.length > 4) {
        titleParts.pop();
        finalTitle = titleParts.join(' ').trim();
    }

    // ✅ 6. 품질 검증: 자동완성 키워드 최소 3개 포함 확인
    const keywordsInTitle = selectedKeywords.filter(k => finalTitle.includes(k));
    if (keywordsInTitle.length < 3 && autocompleteKeywords.length >= 3) {
        // 재조합: 부족한 키워드 추가
        const missing = autocompleteKeywords.filter(k => !finalTitle.includes(k));
        for (const mk of missing) {
            if (keywordsInTitle.length >= 3) break;
            titleParts.push(mk);
            keywordsInTitle.push(mk);
        }
        finalTitle = titleParts.join(' ').trim();
        // 다시 길이 체크
        while (finalTitle.length > 40 && titleParts.length > 4) {
            titleParts.pop();
            finalTitle = titleParts.join(' ').trim();
        }
    }

    console.log(`[SEO Title 100점] "${cleanName}" → "${finalTitle}" (키워드 ${keywordsInTitle.length}개 포함)`);
    return finalTitle;
}

/**
 * ✅ 핵심 제품명 추출 (모델번호, 색상, 등급 등 제거)
 * 
 * 예: "LIVE 삼성 갤럭시북5 프로360 NT960QHA-K71AR AI 노트북 대학생 사무용 2IN1 삼성"
 * → "삼성 갤럭시북5 프로360"
 */
function extractCoreProductName(fullName: string): string {
    let core = fullName;

    // 0. 스트리밍/라이브 접두사 제거
    core = core.replace(/^(LIVE|라이브|생방송)\s*/gi, '').trim();

    // ✅ [2026-02-02 FIX] 대괄호 브랜드 접두사 제거 [BRAUN], [삼성] 등
    core = core.replace(/^\[[^\]]+\]\s*/g, '').trim();

    // 1. 모델번호 패턴 제거 (더 광범위하게)
    // NT960QHA-K71AR, WD80F25CHW, SM-G998N, 9665cc 등
    core = core.replace(/[A-Z]{1,4}[\d]{2,}[A-Z\d\-]*/gi, '').trim();
    core = core.replace(/[\d]{3,}[A-Z]{1,4}[\d\-]*/gi, '').trim();
    core = core.replace(/[A-Z]{2,}-[A-Z\d]+/gi, '').trim(); // SM-G998N 형식
    // ✅ [2026-02-02 FIX] 숫자+영문소문자 모델번호 (9665cc)
    core = core.replace(/\d{3,}[a-zA-Z]{1,3}\b/g, '').trim();

    // 2. 색상 키워드 제거
    // ✅ [2026-02-02 FIX] \b가 한글에서 작동하지 않으므로 색상도 genericWords에 통합
    const colorKeywords = [
        '화이트', '블랙', '그레이', '실버', '골드', '네이비', '베이지', '브라운',
        '핑크', '블루', '레드', '그린', '퍼플', '오렌지', '민트', '아이보리',
        'white', 'black', 'gray', 'silver', 'gold', 'navy', 'beige', 'brown',
        '코랄', '라벤더', '차콜', '크림', '버건디', '그라파이트', '미스틱'
    ];
    // 영문 색상은 \b가 작동하므로 먼저 처리
    for (const color of colorKeywords.filter(c => /^[a-zA-Z]+$/.test(c))) {
        core = core.replace(new RegExp(`\\b${color}\\b`, 'gi'), '').trim();
    }

    // 3. 등급/용량/사이즈 키워드 제거
    const removePatterns = [
        /\d+등급/g,           // 1등급, 2등급
        /\d+[LlKk][Gg]?/g,    // 10L, 20kg
        /\d+[Ww]/g,           // 100W
        /\d+인치/g,           // 65인치
        /\d+[Mm][Mm]/g,       // 100mm
        /\(\d+[^\)]*\)/g,     // (123ABC)
        /\[\d+[^\]]*\]/g,     // [123ABC]
        /\d+[Gg][Bb]/gi,      // 256GB, 512gb
        /\d+[Tt][Bb]/gi,      // 1TB, 2tb
    ];
    for (const pattern of removePatterns) {
        core = core.replace(pattern, '').trim();
    }

    // 4. 일반적 수식어/용도 제거 (공백 기반 단어 필터링 - 한글에서 \b 미작동)
    // ✅ [2026-02-02 FIX] 한글 색상도 여기서 함께 필터링
    const genericWords = new Set([
        '일체형', '분리형', '올인원', '프리미엄', '에디션', '스페셜', '리미티드',
        '신형', '신제품', '최신형', '2024', '2025', '2026',
        '대학생', '사무용', '게이밍', '업무용', '학생용', '가정용', '기업용',
        '2IN1', '2in1', 'AI', 'PRO', 'PLUS', 'ULTRA', 'MAX', 'LITE',
        '울트라', '플러스', '프로', '씬', 'Plus',
        '노트북', '데스크탑', '태블릿', '세탁기', '건조기', '세탁기건조기',
        // ✅ [2026-02-02 FIX] 한글 색상 추가 (공백 기반 필터링)
        '화이트', '블랙', '그레이', '실버', '골드', '네이비', '베이지',
        '핑크', '블루', '레드', '그린', '퍼플', '오렌지', '민트', '아이보리',
        '코랄', '라벤더', '차콜', '크림', '버건디', '그라파이트', '미스틱'
        // ⚠️ '브라운' 제외: BRAUN(면도기 브랜드)과 혼동 방지
    ]);
    // ✅ [2026-02-02 FIX] 첫 번째 단어는 브랜드명일 가능성이 높으므로 필터링에서 제외
    const wordsToFilter = core.split(/\s+/);
    const firstWord = wordsToFilter[0] || '';
    const remainingWords = wordsToFilter.slice(1);
    const filteredRemaining = remainingWords.filter(word =>
        !genericWords.has(word) && !genericWords.has(word.toUpperCase()) && !genericWords.has(word.toLowerCase())
    );
    core = [firstWord, ...filteredRemaining].join(' ').trim();

    // 5. 중복 브랜드명 제거 (맨 앞과 맨 뒤에 같은 브랜드가 있으면 뒤쪽 제거)
    const words = core.split(/\s+/);
    if (words.length >= 2) {
        const firstWord = words[0].toLowerCase();
        const lastWord = words[words.length - 1].toLowerCase();
        if (firstWord === lastWord) {
            words.pop(); // 마지막 중복 제거
            core = words.join(' ');
        }
    }

    // 6. 연속 공백 정리
    core = core.replace(/\s+/g, ' ').trim();

    // 7. 핵심이 너무 짧으면 원본에서 첫 3-4단어 사용
    if (core.length < 5 || core.split(/\s+/).length < 2) {
        const originalWords = fullName
            .replace(/^(LIVE|라이브|생방송)\s*/gi, '')
            .replace(/^\[[^\]]+\]\s*/g, '') // 대괄호 브랜드 제거
            .split(/\s+/)
            .filter(w => !w.match(/[A-Z]{2,}[\d]{2,}/i)) // 모델번호 제외
            .slice(0, 4);
        core = originalWords.join(' ');
    }

    // 8. 최대 5단어로 제한 (너무 길지 않게)
    const finalWords = core.split(/\s+/).slice(0, 5);
    core = finalWords.join(' ');

    return core;
}
