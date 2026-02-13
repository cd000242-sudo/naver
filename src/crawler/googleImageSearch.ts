/**
 * ✅ [2026-02-12] 구글 이미지 스크래핑 모듈
 * - 네이버 이미지 검색 결과 부족 시 폴백
 * - 쇼핑몰 크롤링과 동일한 전용 세션(browserFactory) 활용
 * - 뉴스/워터마크 이미지 자동 필터링
 */

import { launchBrowser, createOptimizedPage } from './utils/browserFactory.js';
import { isUIGarbage, deduplicateImages, normalizeImageUrl } from './utils/imageUtils.js';
import { isNewsOrWatermarkedImage } from './utils/imageUtils.js';

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
                let imgUrl = dataSrc || src;

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
    mainKeyword: string
): Promise<Map<string, string[]>> {
    const resultMap = new Map<string, string[]>();
    if (!headings || headings.length === 0) return resultMap;

    console.log(`[ImageSearch] 📋 ${headings.length}개 소제목에 대한 이미지 검색 시작`);
    console.log(`[ImageSearch] 🔑 메인 키워드: "${mainKeyword}"`);

    // 네이버 이미지 검색 API 시도
    let naverSearchAvailable = false;
    try {
        const { searchImage } = await import('../naverSearchApi.js');
        naverSearchAvailable = true;

        for (const heading of headings) {
            const searchQuery = `${mainKeyword} ${heading}`.trim();
            try {
                const naverResult = await searchImage({ query: searchQuery, display: 3 });
                const validImages: string[] = [];

                for (const item of naverResult.items) {
                    if (validImages.length >= 2) break;
                    const imgUrl = item.link || item.thumbnail || '';
                    if (!imgUrl) continue;
                    if (isUIGarbage(imgUrl)) continue;
                    if (isNewsOrWatermarkedImage(imgUrl)) continue;
                    validImages.push(normalizeImageUrl(imgUrl));
                }

                if (validImages.length > 0) {
                    resultMap.set(heading, validImages);
                    console.log(`[ImageSearch] ✅ 네이버 → "${heading}" → ${validImages.length}개 이미지`);
                }
            } catch (e) {
                console.warn(`[ImageSearch] ⚠️ 네이버 이미지 검색 실패 (${heading}): ${(e as Error).message}`);
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
                const searchQuery = `${mainKeyword} ${heading}`.trim();
                try {
                    const page = await createOptimizedPage(browser);

                    const encodedQuery = encodeURIComponent(searchQuery);
                    const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch&hl=ko&safe=active&tbs=isz:m`;

                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await page.evaluate(async () => {
                        window.scrollBy(0, 500);
                        await new Promise(r => setTimeout(r, 600));
                    });

                    // 이미지 추출 (간소화)
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

                    // 필터링
                    const validImages: string[] = [];
                    for (const imgUrl of images) {
                        if (validImages.length >= 2) break;
                        if (isUIGarbage(imgUrl)) continue;
                        if (isNewsOrWatermarkedImage(imgUrl)) continue;
                        validImages.push(normalizeImageUrl(imgUrl));
                    }

                    if (validImages.length > 0) {
                        resultMap.set(heading, validImages);
                        console.log(`[ImageSearch] ✅ 구글 → "${heading}" → ${validImages.length}개 이미지`);
                    } else {
                        console.log(`[ImageSearch] ⚠️ 구글에서도 이미지 없음: "${heading}"`);
                    }

                    await page.close();

                    // 검색 간 딜레이 (봇 탐지 방지)
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 500));

                } catch (e) {
                    console.warn(`[ImageSearch] ⚠️ 구글 이미지 검색 실패 (${heading}): ${(e as Error).message}`);
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
