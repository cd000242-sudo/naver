/**
 * ✅ [2026-02-12] 구글 이미지 스크래핑 모듈
 * - 네이버 이미지 검색 결과 부족 시 폴백
 * - 쇼핑몰 크롤링과 동일한 전용 세션(browserFactory) 활용
 * - 뉴스/워터마크 이미지 자동 필터링
 */

import { launchBrowser, createOptimizedPage } from './utils/browserFactory.js';
import { isUIGarbage, deduplicateImages, normalizeImageUrl } from './utils/imageUtils.js';
import { isNewsOrWatermarkedImage } from './utils/imageUtils.js';
import { filterImagesByRelevance } from './imageRelevanceScorer.js';

export interface GoogleImageResult {
    url: string;           // 원본 이미지 URL
    thumbnailUrl?: string; // 구글 썸네일 URL
    title?: string;        // 이미지 제목/alt
    source?: string;       // 출처 도메인
}

/**
 * 구글 이미지 검색 (Puppeteer 전용 세션)
 * 쇼핑몰 크롤링과 동일한 browserFactory 패턴 사용
 * 
 * @param query 검색어
 * @param maxImages 최대 이미지 수 (기본 5)
 * @returns 필터링된 이미지 URL 배열
 */
export async function searchGoogleImages(
    query: string,
    maxImages: number = 5
): Promise<GoogleImageResult[]> {
    if (!query || query.trim().length < 2) return [];

    let browser;
    try {
        console.log(`[GoogleImageSearch] 🔍 구글 이미지 검색 시작: "${query}" (최대 ${maxImages}개)`);

        // ✅ 전용 세션 시작 (쇼핑몰 크롤링과 동일한 패턴)
        browser = await launchBrowser();
        const page = await createOptimizedPage(browser);

        // ✅ 구글 이미지 검색 URL 구성
        // hl=ko: 한국어 결과 우선
        // safe=active: 안전검색 (부적절 이미지 배제)
        // tbs=isz:m: 중간 크기 이상 이미지만 (아이콘/작은 이미지 배제)
        const encodedQuery = encodeURIComponent(query.trim());
        const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch&hl=ko&safe=active&tbs=isz:m`;

        // 페이지 이동 (타임아웃 20초)
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // 이미지 로딩 대기 (약간의 스크롤)
        await page.evaluate(async () => {
            window.scrollBy(0, 600);
            await new Promise(r => setTimeout(r, 800));
            window.scrollBy(0, 600);
            await new Promise(r => setTimeout(r, 500));
        });

        // ✅ 이미지 URL 추출 (구글 이미지 검색 결과 파싱)
        const extractedImages = await page.evaluate((maxCount: number) => {
            const results: Array<{ url: string; thumbnailUrl: string; title: string; source: string }> = [];

            // 방법 1: data-src 또는 src 속성에서 이미지 URL 추출
            const imgElements = document.querySelectorAll('img[data-src], img[src]');
            const seen = new Set<string>();

            for (const img of Array.from(imgElements)) {
                if (results.length >= maxCount * 3) break; // 필터링 여유분 확보

                const dataSrc = img.getAttribute('data-src') || '';
                const src = img.getAttribute('src') || '';
                const alt = img.getAttribute('alt') || '';

                // 실제 이미지 URL 찾기 (data-src 우선)
                const imgUrl = dataSrc || src;

                // 구글 내부 URL이나 base64, 1x1 투명 픽셀 제외
                if (!imgUrl || imgUrl.startsWith('data:') || imgUrl.includes('gstatic.com/images')) continue;
                if (imgUrl.includes('google.com/logos') || imgUrl.includes('googlelogo')) continue;

                // 너무 작은 이미지 제외 (width 속성 체크)
                const width = parseInt(img.getAttribute('width') || '0');
                const height = parseInt(img.getAttribute('height') || '0');
                if ((width > 0 && width < 100) || (height > 0 && height < 100)) continue;

                // 중복 체크
                const baseUrl = imgUrl.split('?')[0];
                if (seen.has(baseUrl)) continue;
                seen.add(baseUrl);

                // 출처 추출 (가능하면)
                const parentLink = img.closest('a');
                const sourceUrl = parentLink?.getAttribute('href') || '';
                let sourceDomain = '';
                try {
                    if (sourceUrl && sourceUrl.startsWith('http')) {
                        sourceDomain = new URL(sourceUrl).hostname;
                    }
                } catch { /* 무시 */ }

                results.push({
                    url: imgUrl,
                    thumbnailUrl: src || imgUrl,
                    title: alt,
                    source: sourceDomain,
                });
            }

            // 방법 2: 스크립트 태그에서 고화질 이미지 URL 추출
            // 구글은 실제 이미지 URL을 JSON 데이터로 페이지에 삽입함
            const scripts = document.querySelectorAll('script');
            for (const script of Array.from(scripts)) {
                if (results.length >= maxCount * 3) break;
                const text = script.textContent || '';

                // 고화질 이미지 URL 패턴 매칭
                const urlMatches = text.match(/\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\d+,\d+\]/gi);
                if (urlMatches) {
                    for (const match of urlMatches) {
                        if (results.length >= maxCount * 3) break;
                        const urlMatch = match.match(/\["(https?:\/\/[^"]+)"/);
                        if (urlMatch && urlMatch[1]) {
                            const imgUrl = urlMatch[1];
                            const baseUrl = imgUrl.split('?')[0];
                            if (!seen.has(baseUrl) && !imgUrl.includes('gstatic.com') && !imgUrl.includes('google.com')) {
                                seen.add(baseUrl);
                                results.push({
                                    url: imgUrl,
                                    thumbnailUrl: imgUrl,
                                    title: '',
                                    source: '',
                                });
                            }
                        }
                    }
                }
            }

            return results;
        }, maxImages);

        console.log(`[GoogleImageSearch] 📸 원시 이미지 ${extractedImages.length}개 추출`);

        // ✅ 후처리: 뉴스/워터마크 필터링 + UI 가비지 필터링
        const filteredResults: GoogleImageResult[] = [];
        for (const img of extractedImages) {
            if (filteredResults.length >= maxImages) break;

            // 1. UI 가비지 체크
            if (isUIGarbage(img.url)) {
                console.log(`[GoogleImageSearch] ⛔ UI 가비지 제외: ${img.url.substring(0, 60)}...`);
                continue;
            }

            // 2. 뉴스/워터마크 이미지 체크
            if (isNewsOrWatermarkedImage(img.url, img.source)) {
                console.log(`[GoogleImageSearch] 🚫 뉴스/워터마크 이미지 제외: ${img.url.substring(0, 60)}...`);
                continue;
            }

            filteredResults.push({
                url: normalizeImageUrl(img.url),
                thumbnailUrl: img.thumbnailUrl,
                title: img.title,
                source: img.source,
            });
        }

        console.log(`[GoogleImageSearch] ✅ 최종 ${filteredResults.length}개 이미지 (뉴스/워터마크 필터링 완료)`);
        return filteredResults;

    } catch (error: any) {
        console.error(`[GoogleImageSearch] ❌ 구글 이미지 검색 실패: ${error.message}`);
        return [];
    } finally {
        if (browser) {
            try { await browser.close(); } catch { /* 무시 */ }
        }
    }
}

/**
 * 소제목별 이미지 일괄 검색 (네이버 → 구글 폴백)
 * 
 * @param headings 소제목 배열
 * @param mainKeyword 메인 키워드 (컨텍스트)
 * @returns 소제목별 이미지 URL 매핑
 */
export async function searchImagesForHeadings(
    headings: string[],
    mainKeyword: string,
    options?: {
        relevanceCheckEnabled?: boolean;
        relevanceThreshold?: number;
        // ✅ [v2.7.62] 다중 vendor — 글 생성 AI에 따라 vision 선택
        textGenerator?: string;
        apiKeys?: { gemini?: string; claude?: string; openai?: string };
        // ✅ [v2.7.66] URL 모드로 글 생성한 경우 원본 URL의 이미지를 1순위로 크롤링
        sourceUrl?: string;
        // 레거시 호환 (제거 예정)
        relevanceApiKey?: string;
    }
): Promise<Map<string, string[]>> {
    const resultMap = new Map<string, string[]>();
    if (!headings || headings.length === 0) return resultMap;

    const aiCheck = options?.relevanceCheckEnabled === true && !!options?.apiKeys && (
        !!options.apiKeys.gemini || !!options.apiKeys.claude || !!options.apiKeys.openai
    );
    console.log(`[ImageSearch] 📋 ${headings.length}개 소제목에 대한 이미지 검색 시작`);
    console.log(`[ImageSearch] 🔑 메인 키워드: "${mainKeyword}"`);
    if (aiCheck) console.log(`[ImageSearch] 🤖 AI 관련성 검증 활성화 (threshold=${options!.relevanceThreshold ?? 60})`);

    // ✅ [v2.7.97] 이미지 관리 탭의 "AI 자동 수집" 버튼과 동일 품질 — Gemini 배치 검색어 최적화
    //   사용자 보고: "수집해도 전혀 이상한 이미지를 수집한다 — 이미지 관리에서 수집하는 거랑 똑같아야 정상"
    //   동작: 메인키워드+소제목 raw 결합 대신, Gemini가 동명이인/동음이의어 구분한 최적 쿼리 사용
    //   폴백 체인: optimizedQuery → broaderQuery → "${mainKeyword} ${heading}" raw
    const optimizedMap = new Map<string, { primary: string; broader: string }>();
    if (options?.apiKeys?.gemini) {
        try {
            const { batchOptimizeImageSearchQueries } = await import('../gemini.js');
            const opt = await batchOptimizeImageSearchQueries(mainKeyword, headings, options.apiKeys.gemini);
            for (const r of opt) {
                optimizedMap.set(r.heading, {
                    primary: (r.optimizedQuery || '').trim(),
                    broader: (r.broaderQuery || '').trim(),
                });
            }
            console.log(`[ImageSearch] 🧠 Gemini 검색어 최적화 완료: ${optimizedMap.size}/${headings.length}`);
        } catch (e: any) {
            console.warn(`[ImageSearch] ⚠️ Gemini 검색어 최적화 실패, raw 결합 사용: ${e?.message}`);
        }
    }
    const buildQueryChain = (heading: string): string[] => {
        const chain: string[] = [];
        const opt = optimizedMap.get(heading);
        if (opt?.primary) chain.push(opt.primary);
        if (opt?.broader && opt.broader !== opt.primary) chain.push(opt.broader);
        const raw = `${mainKeyword} ${heading}`.trim();
        if (raw && !chain.includes(raw)) chain.push(raw);
        return chain.length > 0 ? chain : [heading];
    };

    // ✅ [v2.7.66] URL 모드 글 생성: 원본 URL 이미지를 1순위로 크롤링 + AI 매칭
    //   사용자 보고: "url로 글생성했다면 그 url에 있는 이미지를 전부 긁어와야정상아니니"
    //   동작: sourceUrl이 있으면 cheerio로 페이지 이미지 전부 추출 후 AI가 소제목별 매칭
    if (options?.sourceUrl && /^https?:\/\//i.test(options.sourceUrl)) {
        try {
            console.log(`[ImageSearch] 🔗 원본 URL 우선 크롤링: ${options.sourceUrl}`);
            const urlImages = await crawlImagesFromUrl(options.sourceUrl);
            console.log(`[ImageSearch] 📥 원본 URL에서 ${urlImages.length}개 이미지 수집`);

            // ✅ [v2.7.83] 중복 차단 — 같은 URL을 여러 소제목에 배정 안 함, 소제목당 1장
            const usedUrls = new Set<string>();
            if (urlImages.length > 0 && aiCheck) {
                // AI로 각 소제목에 가장 적합한 이미지 매칭 — 이미 사용된 URL 제외
                for (const heading of headings) {
                    const candidatePool = urlImages.filter(u => !usedUrls.has(u));
                    if (candidatePool.length === 0) {
                        console.log(`[ImageSearch] ⚠️ "${heading}" — 잔여 URL 없음, 스킵`);
                        continue;
                    }
                    const { filterImagesByRelevance } = await import('./imageRelevanceScorer.js');
                    const { filtered } = await filterImagesByRelevance(candidatePool, heading, mainKeyword, {
                        enabled: true,
                        textGenerator: options!.textGenerator || 'gemini-2.5-flash',
                        apiKeys: options!.apiKeys || {},
                        threshold: options!.relevanceThreshold,
                    });
                    if (filtered.length > 0) {
                        const picked = filtered[0]; // 1장만
                        usedUrls.add(picked);
                        resultMap.set(heading, [picked]);
                        console.log(`[ImageSearch] ✅ URL 매칭 → "${heading}" → 1개 (AI 통과, 잔여 ${candidatePool.length - 1})`);
                    }
                }
            } else if (urlImages.length > 0) {
                // AI 검증 OFF: 페이지 순서대로 1:1 배분 (idx ≥ urlImages.length 시 슬롯 비움)
                headings.forEach((heading, idx) => {
                    if (idx < urlImages.length) {
                        const picked = urlImages[idx];
                        if (!usedUrls.has(picked)) {
                            usedUrls.add(picked);
                            resultMap.set(heading, [picked]);
                        }
                    }
                });
                console.log(`[ImageSearch] ✅ URL 이미지 1:1 배분 완료 (페이지 순서, ${usedUrls.size}/${headings.length})`);
            }
        } catch (e: any) {
            console.warn(`[ImageSearch] ⚠️ URL 크롤링 실패 → 키워드 검색 폴백: ${e.message}`);
        }
    }

    // 네이버 이미지 검색 API 시도
    let naverSearchAvailable = false;
    try {
        const { searchImage } = await import('../naverSearchApi.js');
        naverSearchAvailable = true;

        for (const heading of headings) {
            // ✅ [v2.7.97] 폴백 체인: 최적화 쿼리 → 넓은 쿼리 → raw 결합
            const queryChain = buildQueryChain(heading);
            let validImages: string[] = [];

            for (const searchQuery of queryChain) {
                if (validImages.length >= 1) break;
                try {
                    // ✅ [v2.7.61] AI 검증 시 후보 풀을 더 많이 확보 (3 → 8개) — 차단 후 잔여 보장
                    const fetchCount = aiCheck ? 8 : 3;
                    const keepCount = aiCheck ? 5 : 2;
                    const naverResult = await searchImage({ query: searchQuery, display: fetchCount });
                    const candidates: string[] = [];

                    for (const item of naverResult.items) {
                        if (candidates.length >= keepCount) break;
                        const imgUrl = item.link || item.thumbnail || '';
                        if (!imgUrl) continue;
                        if (isUIGarbage(imgUrl)) continue;
                        if (isNewsOrWatermarkedImage(imgUrl)) continue;
                        candidates.push(normalizeImageUrl(imgUrl));
                    }

                    // ✅ [v2.7.61] AI 관련성 검증 (opt-in)
                    let imgs = candidates;
                    if (aiCheck && candidates.length > 0) {
                        const { filtered } = await filterImagesByRelevance(candidates, heading, mainKeyword, {
                            enabled: true,
                            textGenerator: options!.textGenerator || 'gemini-2.5-flash',
                            apiKeys: options!.apiKeys || {},
                            threshold: options!.relevanceThreshold,
                        });
                        imgs = filtered.slice(0, 2);
                    } else {
                        imgs = candidates.slice(0, 2);
                    }

                    if (imgs.length > 0) {
                        validImages = imgs;
                        console.log(`[ImageSearch] ✅ 네이버 → "${heading}" [${searchQuery}] → ${imgs.length}개${aiCheck ? ' (AI 통과)' : ''}`);
                        break;
                    } else {
                        console.log(`[ImageSearch] ↩️ 네이버 → "${heading}" [${searchQuery}] → 결과 없음, 다음 쿼리 시도`);
                    }
                } catch (e) {
                    console.warn(`[ImageSearch] ⚠️ 네이버 검색 실패 ("${heading}" [${searchQuery}]): ${(e as Error).message}`);
                }
            }

            if (validImages.length > 0) {
                resultMap.set(heading, validImages);
            }
        }
    } catch {
        console.warn(`[ImageSearch] ⚠️ 네이버 이미지 검색 API 로드 실패`);
    }

    // ✅ 네이버에서 이미지를 못 찾은 소제목 → 구글 이미지 폴백
    const missingHeadings = headings.filter(h => !resultMap.has(h) || (resultMap.get(h)?.length || 0) === 0);

    if (missingHeadings.length > 0) {
        console.log(`[ImageSearch] 🔄 ${missingHeadings.length}개 소제목 구글 이미지 폴백 시작`);

        // 구글은 하나의 전용 세션으로 여러 검색 수행 (세션 재사용 최적화)
        let browser;
        try {
            browser = await launchBrowser();

            for (const heading of missingHeadings) {
                // ✅ [v2.7.97] 구글 폴백도 동일 폴백 체인 (최적화 → 넓은 → raw)
                const queryChain = buildQueryChain(heading);
                let validImages: string[] = [];

                for (const searchQuery of queryChain) {
                    if (validImages.length >= 1) break;
                    try {
                        const page = await createOptimizedPage(browser);

                        const encodedQuery = encodeURIComponent(searchQuery);
                        const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch&hl=ko&safe=active&tbs=isz:m`;

                        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                        await page.evaluate(async () => {
                            window.scrollBy(0, 500);
                            await new Promise(r => setTimeout(r, 600));
                        });

                        const images = await page.evaluate(() => {
                            const urls: string[] = [];
                            const seen = new Set<string>();
                            document.querySelectorAll('img[data-src], img[src]').forEach(img => {
                                if (urls.length >= 8) return;
                                const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
                                if (!src || src.startsWith('data:') || src.includes('gstatic.com') || src.includes('google.com')) return;
                                const w = parseInt(img.getAttribute('width') || '0');
                                if (w > 0 && w < 100) return;
                                const base = src.split('?')[0];
                                if (!seen.has(base)) {
                                    seen.add(base);
                                    urls.push(src);
                                }
                            });
                            return urls;
                        });

                        const candidates: string[] = [];
                        const candidateCap = aiCheck ? 5 : 2;
                        for (const imgUrl of images) {
                            if (candidates.length >= candidateCap) break;
                            if (isUIGarbage(imgUrl)) continue;
                            if (isNewsOrWatermarkedImage(imgUrl)) continue;
                            candidates.push(normalizeImageUrl(imgUrl));
                        }

                        let imgs = candidates;
                        if (aiCheck && candidates.length > 0) {
                            const { filtered } = await filterImagesByRelevance(candidates, heading, mainKeyword, {
                                enabled: true,
                                textGenerator: options!.textGenerator || 'gemini-2.5-flash',
                                apiKeys: options!.apiKeys || {},
                                threshold: options!.relevanceThreshold,
                            });
                            imgs = filtered.slice(0, 2);
                        } else {
                            imgs = candidates.slice(0, 2);
                        }

                        await page.close();

                        if (imgs.length > 0) {
                            validImages = imgs;
                            console.log(`[ImageSearch] ✅ 구글 → "${heading}" [${searchQuery}] → ${imgs.length}개${aiCheck ? ' (AI 통과)' : ''}`);
                            break;
                        } else {
                            console.log(`[ImageSearch] ↩️ 구글 → "${heading}" [${searchQuery}] → 결과 없음, 다음 쿼리 시도`);
                        }

                        await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
                    } catch (e) {
                        console.warn(`[ImageSearch] ⚠️ 구글 검색 실패 ("${heading}" [${searchQuery}]): ${(e as Error).message}`);
                    }
                }

                if (validImages.length > 0) {
                    resultMap.set(heading, validImages);
                } else {
                    console.log(`[ImageSearch] ⚠️ 구글 폴백도 이미지 없음: "${heading}"`);
                }
            }
        } catch (e) {
            console.error(`[ImageSearch] ❌ 구글 폴백 브라우저 실행 실패: ${(e as Error).message}`);
        } finally {
            if (browser) {
                try { await browser.close(); } catch { /* 무시 */ }
            }
        }
    }

    console.log(`[ImageSearch] 📊 최종: ${resultMap.size}/${headings.length}개 소제목에 이미지 매칭 완료`);
    return resultMap;
}

/**
 * ✅ [v2.7.70] 단일 URL에서 이미지 전부 추출 — Playwright 기반 (B안: SPA + lazy-load 완전 대응)
 *   사용자 선택: "B안 — 항상 Playwright (크롬 창)"
 *   동작:
 *     1) launchBrowser()로 stealth 크롬 띄우기 (offscreen)
 *     2) page.goto + networkidle 대기 → JS 렌더링 완료
 *     3) 자동 스크롤 → IntersectionObserver lazy-load 이미지 강제 로드
 *     4) <img>, <picture source>, OG meta, background-image 추출
 *     5) 1x1, spacer, icon 자동 제외
 */
// ✅ [v2.7.88] 페이지 title을 외부로 공개 (image:crawlFromUrl이 사용)
let _lastCrawledTitle = '';
export function getLastCrawledTitle(): string { return _lastCrawledTitle; }

export async function crawlImagesFromUrl(url: string): Promise<string[]> {
    let browser;
    try {
        console.log(`[ImageSearch][crawlUrl] 🌐 Puppeteer 크롬 창 띄우는 중 (사용자 시각 확인용): ${url.slice(0, 80)}`);
        // ✅ [v2.7.84] headless: false — 사용자가 크롤링 진행을 화면에서 직접 볼 수 있음
        browser = await launchBrowser({ headless: false });
        // ✅ [v2.7.85] Puppeteer는 launch 시 about:blank 첫 페이지를 자동 생성 → 그것을 재사용
        //   newPage() 추가 호출하면 about:blank 빈 탭이 남아 사용자가 의아해함
        const existingPages = await browser.pages();
        const page = existingPages[0] || await browser.newPage();
        // createOptimizedPage가 적용하던 stealth/리소스 차단 설정을 직접 적용
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // @ts-ignore
            window.chrome = { runtime: {} };
        });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            const u = req.url();
            if (['font', 'media'].includes(type) ||
                u.includes('google-analytics') ||
                u.includes('facebook') ||
                u.includes('tracking')) {
                req.abort();
            } else {
                req.continue();
            }
        });
        await page.setViewport({ width: 1280, height: 800 });

        // Puppeteer는 networkidle0/networkidle2를 waitUntil로 받음 (race 불필요)
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(async () => {
            // networkidle 실패 시 domcontentloaded로 폴백
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        });
        await new Promise(r => setTimeout(r, 1500));

        // ✅ [v2.7.88] 페이지 title 캡처 (폴더명용)
        try {
            const pageTitle = await page.title();
            // OG title이 더 정확한 경우 우선 (네이버 블로그 PostView 등)
            const ogTitle = await page.evaluate(() => {
                const og = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
                return og?.content || '';
            }).catch(() => '');
            _lastCrawledTitle = (ogTitle || pageTitle || '').trim();
            console.log(`[ImageSearch][crawlUrl] 📑 페이지 제목: ${_lastCrawledTitle.slice(0, 80)}`);
        } catch { _lastCrawledTitle = ''; }

        // ✅ 자동 스크롤로 lazy-load 이미지 강제 로드
        await page.evaluate(async () => {
            await new Promise<void>(resolve => {
                let total = 0;
                const step = 600;
                const timer = setInterval(() => {
                    window.scrollBy(0, step);
                    total += step;
                    if (total >= document.body.scrollHeight - window.innerHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
                // 안전장치: 8초 후 강제 종료
                setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
            });
            // 맨 위로 복귀 + 잠시 대기 (위쪽 이미지가 다시 viewport에 들어와 src 채워질 시간)
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 600));
        }).catch(() => { /* 무시 */ });

        // ✅ [v2.7.71] iframe 포함 모든 frame에서 추출 + 강화된 필터
        //   네이버 블로그 PostView.naver 등 iframe-embedded 콘텐츠 대응
        const extractFromFrame = async (frame: any): Promise<string[]> => {
            return await frame.evaluate(() => {
                const urls: { src: string; w: number; priority: number }[] = [];
                const seen = new Set<string>();
                const baseHref = document.location.href;

                // 차단 패턴: site-wide UI / 위젯 / 광고
                const BANNED = /spacer|pixel|blank|1x1|spc\.gif|ico_n\.gif|ico_|gnb|navbar|footer|widget|profile|avatar|emoticon|sticker|bg_|btn_|\.svg$/i;
                // 본문 우선 패턴: 네이버 블로그 + 일반 뉴스/블로그 CDN
                const PRIORITY_HOSTS = /postfiles\.pstatic\.net|mblogthumb-phinf\.pstatic\.net|blogfiles\.pstatic\.net|dthumb-phinf\.pstatic\.net|pup-post-phinf\.pstatic\.net|tistory|naver\.net\/MjAy/i;

                const tryAdd = (raw: string | null | undefined, w: number) => {
                    if (!raw) return;
                    let src = String(raw).trim();
                    if (!src || src.startsWith('data:')) return;
                    try { src = new URL(src, baseHref).toString(); } catch { return; }
                    if (BANNED.test(src)) return;
                    const base = src.split('?')[0];
                    if (seen.has(base)) return;
                    seen.add(base);
                    const priority = PRIORITY_HOSTS.test(src) ? 0 : (w >= 400 ? 1 : 2);
                    urls.push({ src, w, priority });
                };

                // 1) OG/Twitter 메타 (페이지 대표 이미지)
                const og = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
                const ogSecure = document.querySelector('meta[property="og:image:secure_url"]') as HTMLMetaElement | null;
                const twitter = document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement | null;
                tryAdd(og?.content, 999);
                tryAdd(ogSecure?.content, 999);
                tryAdd(twitter?.content, 999);

                // 2) 모든 <img> — 사이즈 검사
                document.querySelectorAll('img').forEach(el => {
                    const img = el as HTMLImageElement;
                    const w = img.naturalWidth || img.width || 0;
                    const h = img.naturalHeight || img.height || 0;
                    // 본문 이미지 임계: 가로 200px 이상 OR 세로 200px 이상 (큰 이미지만)
                    if ((w > 0 && w < 150) && (h > 0 && h < 150)) return;
                    tryAdd(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src'), w);
                });

                // 3) <picture><source srcset>
                document.querySelectorAll('picture source').forEach(el => {
                    const srcset = el.getAttribute('srcset') || '';
                    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
                    if (first) tryAdd(first, 0);
                });

                // 4) background-image CSS
                let bgChecked = 0;
                document.querySelectorAll('div, section, figure, span').forEach(el => {
                    if (bgChecked >= 50) return;
                    bgChecked++;
                    const style = window.getComputedStyle(el);
                    const bg = style.backgroundImage;
                    if (bg && bg !== 'none') {
                        const match = bg.match(/url\(["']?(.+?)["']?\)/);
                        if (match && match[1]) {
                            const w = (el as HTMLElement).offsetWidth || 0;
                            tryAdd(match[1], w);
                        }
                    }
                });

                // 우선순위 정렬 (priority 0=CDN 본문 → 1=400px+ → 2=나머지)
                urls.sort((a, b) => a.priority - b.priority || b.w - a.w);
                return urls.map(u => u.src);
            }).catch(() => []);
        };

        // 메인 + 모든 iframe 순회
        const allFrames = page.frames();
        const merged = new Set<string>();
        for (const frame of allFrames) {
            const fromFrame = await extractFromFrame(frame);
            fromFrame.forEach(u => merged.add(u));
        }
        const collected = Array.from(merged);

        console.log(`[ImageSearch][crawlUrl] ✅ Puppeteer 추출: ${collected.length}개 (frames=${allFrames.length})`);
        return collected.slice(0, 30);
    } catch (e: any) {
        console.warn(`[ImageSearch][crawlUrl] Playwright 실패: ${e.message?.slice(0, 100)}`);
        return [];
    } finally {
        if (browser) {
            try { await browser.close(); } catch { /* 무시 */ }
        }
    }
}
