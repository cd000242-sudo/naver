/**
 * BrandStore in-browser DOM scrapers.
 * @module crawler/shopping/providers/brandStore/brandStoreDom
 *
 * These functions are passed to Playwright `page.evaluate()` and run inside
 * the browser context. They are self-contained — they reference only the DOM
 * (`document`) and their own locals, never Node-scope variables — so they are
 * safe to define here and verifiable with a DOM test environment.
 */

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
