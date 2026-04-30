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

    // ✅ [v2.7.66] URL 모드 글 생성: 원본 URL 이미지를 1순위로 크롤링 + AI 매칭
    //   사용자 보고: "url로 글생성했다면 그 url에 있는 이미지를 전부 긁어와야정상아니니"
    //   동작: sourceUrl이 있으면 cheerio로 페이지 이미지 전부 추출 후 AI가 소제목별 매칭
    if (options?.sourceUrl && /^https?:\/\//i.test(options.sourceUrl)) {
        try {
            console.log(`[ImageSearch] 🔗 원본 URL 우선 크롤링: ${options.sourceUrl}`);
            const urlImages = await crawlImagesFromUrl(options.sourceUrl);
            console.log(`[ImageSearch] 📥 원본 URL에서 ${urlImages.length}개 이미지 수집`);

            if (urlImages.length > 0 && aiCheck) {
                // AI로 각 소제목에 가장 적합한 이미지 매칭
                for (const heading of headings) {
                    const { filterImagesByRelevance } = await import('./imageRelevanceScorer.js');
                    const { filtered } = await filterImagesByRelevance(urlImages, heading, mainKeyword, {
                        enabled: true,
                        textGenerator: options!.textGenerator || 'gemini-2.5-flash',
                        apiKeys: options!.apiKeys || {},
                        threshold: options!.relevanceThreshold,
                    });
                    if (filtered.length > 0) {
                        resultMap.set(heading, filtered.slice(0, 2));
                        console.log(`[ImageSearch] ✅ URL 매칭 → "${heading}" → ${filtered.length}개 (AI 통과)`);
                    }
                }
            } else if (urlImages.length > 0) {
                // AI 검증 OFF: 첫 N개를 순환 배분
                headings.forEach((heading, idx) => {
                    const start = (idx * 2) % urlImages.length;
                    const slice = [
                        urlImages[start],
                        urlImages[(start + 1) % urlImages.length],
                    ].filter((u, i, arr) => arr.indexOf(u) === i);
                    if (slice.length > 0) resultMap.set(heading, slice);
                });
                console.log(`[ImageSearch] ✅ URL 이미지 순환 배분 완료 (AI 검증 OFF)`);
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
            const searchQuery = `${mainKeyword} ${heading}`.trim();
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
                let validImages = candidates;
                if (aiCheck && candidates.length > 0) {
                    const { filtered } = await filterImagesByRelevance(candidates, heading, mainKeyword, {
                        enabled: true,
                        textGenerator: options!.textGenerator || 'gemini-2.5-flash',
                        apiKeys: options!.apiKeys || {},
                        threshold: options!.relevanceThreshold,
                    });
                    validImages = filtered.slice(0, 2);
                } else {
                    validImages = candidates.slice(0, 2);
                }

                if (validImages.length > 0) {
                    resultMap.set(heading, validImages);
                    console.log(`[ImageSearch] ✅ 네이버 → "${heading}" → ${validImages.length}개 이미지${aiCheck ? ' (AI 통과)' : ''}`);
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
                    const candidates: string[] = [];
                    const candidateCap = aiCheck ? 5 : 2;
                    for (const imgUrl of images) {
                        if (candidates.length >= candidateCap) break;
                        if (isUIGarbage(imgUrl)) continue;
                        if (isNewsOrWatermarkedImage(imgUrl)) continue;
                        candidates.push(normalizeImageUrl(imgUrl));
                    }

                    // ✅ [v2.7.62] 구글 폴백에도 AI 검증 (다중 vendor)
                    let validImages = candidates;
                    if (aiCheck && candidates.length > 0) {
                        const { filtered } = await filterImagesByRelevance(candidates, heading, mainKeyword, {
                            enabled: true,
                            textGenerator: options!.textGenerator || 'gemini-2.5-flash',
                            apiKeys: options!.apiKeys || {},
                            threshold: options!.relevanceThreshold,
                        });
                        validImages = filtered.slice(0, 2);
                    } else {
                        validImages = candidates.slice(0, 2);
                    }

                    if (validImages.length > 0) {
                        resultMap.set(heading, validImages);
                        console.log(`[ImageSearch] ✅ 구글 → "${heading}" → ${validImages.length}개 이미지${aiCheck ? ' (AI 통과)' : ''}`);
                    } else {
                        console.log(`[ImageSearch] ⚠️ 구글에서도 이미지 없음${aiCheck ? ' (AI 차단 후)' : ''}: "${heading}"`);
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
async function crawlImagesFromUrl(url: string): Promise<string[]> {
    let browser;
    try {
        console.log(`[ImageSearch][crawlUrl] 🌐 Playwright로 페이지 로드: ${url.slice(0, 80)}`);
        browser = await launchBrowser();
        const page = await createOptimizedPage(browser);

        // Puppeteer는 networkidle0/networkidle2를 waitUntil로 받음 (race 불필요)
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(async () => {
            // networkidle 실패 시 domcontentloaded로 폴백
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        });
        await new Promise(r => setTimeout(r, 1500));

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

        // ✅ 모든 이미지 소스 추출 (img, picture, OG, background-image)
        const collected: string[] = await page.evaluate(() => {
            const urls: string[] = [];
            const seen = new Set<string>();
            const baseHref = document.location.href;

            const tryAdd = (raw: string | null | undefined) => {
                if (!raw) return;
                let src = String(raw).trim();
                if (!src || src.startsWith('data:')) return;
                try {
                    src = new URL(src, baseHref).toString();
                } catch { return; }
                if (/spacer|pixel|blank|1x1|icon|\.svg$/i.test(src)) return;
                const base = src.split('?')[0];
                if (seen.has(base)) return;
                seen.add(base);
                urls.push(src);
            };

            // 1) OG/Twitter 메타 (최우선)
            const og = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
            const ogSecure = document.querySelector('meta[property="og:image:secure_url"]') as HTMLMetaElement | null;
            const twitter = document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement | null;
            tryAdd(og?.content);
            tryAdd(ogSecure?.content);
            tryAdd(twitter?.content);

            // 2) <article>, <main> 본문 이미지 (뉴스/블로그 우선)
            const bodyImgs = document.querySelectorAll('article img, main img, .article img, .news_view img, .post img, [class*="content"] img');
            bodyImgs.forEach(el => {
                const img = el as HTMLImageElement;
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (w > 0 && w < 80 && h > 0 && h < 80) return;
                tryAdd(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original'));
            });

            // 3) 모든 <img> (남은 것)
            document.querySelectorAll('img').forEach(el => {
                if (urls.length >= 50) return;
                const img = el as HTMLImageElement;
                const w = img.naturalWidth || img.width || 0;
                if (w > 0 && w < 80) return;
                tryAdd(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original'));
            });

            // 4) <picture><source srcset>
            document.querySelectorAll('picture source').forEach(el => {
                const srcset = el.getAttribute('srcset') || '';
                const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
                if (first) tryAdd(first);
            });

            // 5) background-image (CSS) — 최대 20개만 검사 (성능)
            let bgChecked = 0;
            document.querySelectorAll('div, section, figure, span').forEach(el => {
                if (bgChecked >= 50 || urls.length >= 50) return;
                bgChecked++;
                const style = window.getComputedStyle(el);
                const bg = style.backgroundImage;
                if (bg && bg !== 'none') {
                    const match = bg.match(/url\(["']?(.+?)["']?\)/);
                    if (match && match[1]) tryAdd(match[1]);
                }
            });

            return urls;
        }).catch(() => []);

        console.log(`[ImageSearch][crawlUrl] ✅ Playwright 추출: ${collected.length}개`);
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
