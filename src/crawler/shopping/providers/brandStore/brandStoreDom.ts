/**
 * BrandStore in-browser DOM scrapers.
 * @module crawler/shopping/providers/brandStore/brandStoreDom
 *
 * These functions are passed to Playwright `page.evaluate()` and run inside
 * the browser context. They are self-contained — they reference only the DOM
 * (`document`) and their own locals, never Node-scope variables — so they are
 * safe to define here and verifiable with a DOM test environment.
 */

export interface AdditionalImageCandidate {
    url: string;
    alt: string;
    index: number;
    order: number;
}

/**
 * PHASE 0 공식 상품 갤러리 URL 수집.
 * 네이버 상품 갤러리는 작은 썸네일이 `alt="추가이미지N"` 형태로 렌더되는 경우가 많다.
 * 클릭이 실패해도 이 URL들을 고해상도로 업스케일하면 공식 추가이미지 전체를 확보할 수 있다.
 */
export function collectAdditionalImageUrls(): AdditionalImageCandidate[] {
    const seen = new Set<string>();
    const results: AdditionalImageCandidate[] = [];

    const readSrcset = (srcset: string | null | undefined): string => {
        if (!srcset) return '';
        const parts = srcset
            .split(',')
            .map(part => part.trim().split(/\s+/)[0])
            .filter(Boolean);
        return parts[parts.length - 1] || '';
    };

    const readUrl = (img: HTMLImageElement): string => {
        return (
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-lazy-src') ||
            img.currentSrc ||
            img.src ||
            readSrcset(img.getAttribute('srcset')) ||
            ''
        ).replace(/&amp;/g, '&');
    };

    const selectors = [
        'img[alt^="추가이미지"]',
        'img[alt*="추가이미지"]',
        'img[aria-label*="추가이미지"]',
        'img[title*="추가이미지"]',
    ];

    let order = 0;
    for (const sel of selectors) {
        try {
            document.querySelectorAll(sel).forEach(node => {
                const img = node as HTMLImageElement;
                const url = readUrl(img);
                if (!url || !/^https?:\/\//i.test(url) || url.startsWith('data:')) return;

                const alt = (
                    img.getAttribute('alt') ||
                    img.getAttribute('aria-label') ||
                    img.getAttribute('title') ||
                    ''
                ).trim();
                if (!/추가이미지\s*\d*/.test(alt)) return;

                const base = url.split('?')[0];
                if (seen.has(base)) return;
                seen.add(base);

                const indexMatch = alt.match(/추가이미지\s*(\d+)/);
                const index = indexMatch ? Number(indexMatch[1]) : Number.MAX_SAFE_INTEGER;
                results.push({ url, alt, index, order: order++ });
            });
        } catch { /* keep collecting from the next selector */ }
    }

    return results.sort((a, b) => (a.index - b.index) || (a.order - b.order));
}

/**
 * PHASE 2 리뷰 이미지 URL 수집.
 * ✅ [v2.10.312] 사용자 케이스(homelia/12059215662) MCP 실측에서 발견:
 *   alt="review_image" img가 12개 페이지에 직접 로드되어 있는데
 *   기존 셀렉터 [class*="review"] img 가 alt 기반 셀렉터 누락으로 못 잡음.
 *   조치: alt="review_image" / alt^="리뷰" 직접 셀렉터 추가.
 */
export function collectReviewImageUrls(): string[] {
    const results: string[] = [];
    const addUrl = (u: string | null | undefined) => {
        if (u && u.startsWith('http') && !u.startsWith('data:')) results.push(u);
    };
    const reviewSelectors = [
        'img[alt="review_image"]',
        'img[alt^="리뷰"]',
        '[class*="review"] img',
        '[class*="Review"] img',
        '[data-testid*="review"] img',
        '[class*="photo_review"] img',
        '[data-shp-area*="review"] img',
    ];
    for (const sel of reviewSelectors) {
        try {
            document.querySelectorAll(sel).forEach(img => {
                const el = img as HTMLImageElement;
                const src = el.getAttribute('data-src') || el.src || '';
                if (src.includes('profile') || src.includes('star') ||
                    src.includes('icon') || src.includes('logo') ||
                    src.includes('badge') || src.includes('emoji') ||
                    src.endsWith('.gif') || src.endsWith('.svg')) return;
                if (src.includes('phinf.pstatic.net') || /\.(jpg|jpeg|png|webp)/i.test(src)) {
                    addUrl(src);
                }
            });
        } catch {}
    }
    return results;
}

/**
 * PHASE 2 리뷰 탭을 찾아 클릭.
 * ✅ [v2.10.310] "리뷰이벤트" 별도 페이지 링크 클릭 시 navigation으로 context
 *   파괴되는 회귀 차단 — navigation 일으키는 a[href*="review-event"] 류 제외,
 *   진짜 리뷰 탭만 클릭.
 */
export function clickReviewTab(): { clicked: boolean; label?: string } {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
    const reviewTab = candidates.find(t => {
        const text = t.textContent?.trim() || '';
        // 정확히 "리뷰" 또는 "리뷰 (N)" 또는 "리뷰 N건" 패턴만. "리뷰이벤트"/"리뷰포인트" 제외.
        const isReviewLabel = /^리뷰(\s*\(|\s*\d|$)/.test(text) && !/리뷰이벤트|리뷰포인트|리뷰적립/.test(text);
        if (!isReviewLabel) return false;
        // navigation 일으키는 <a href="...review-event..."> 류 제외
        if (t.tagName === 'A') {
            const href = t.getAttribute('href') || '';
            if (href.includes('review-event') || href.includes('review-point') || /^https?:\/\//.test(href)) {
                return false;
            }
        }
        return true;
    });
    if (reviewTab) {
        (reviewTab as HTMLElement).click();
        return { clicked: true, label: (reviewTab.textContent || '').trim().substring(0, 30) };
    }
    return { clicked: false };
}

/** 제품 정보(상품명·가격)를 OG 태그와 가격 요소에서 추출. */
export function extractBrandProductInfo(): { name: string; price: string } {
    const name =
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const price =
        document.querySelector('[class*="price"]')?.textContent || '';
    return { name: name.trim(), price: price.trim() };
}
