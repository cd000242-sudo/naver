/**
 * ✅ [2026-01-25 모듈화] 쇼핑커넥트 유틸리티
 * - renderer.ts에서 분리됨
 * - 쇼핑커넥트(제휴) 모드 관련 헬퍼 함수
 */

/**
 * 쇼핑커넥트 모드 활성 여부 확인 헬퍼
 * UI 상태를 확인하여 현재 쇼핑커넥트(제휴) 모드인지 판단
 */
export function isShoppingConnectModeActive(): boolean {
    try {
        const contentModeInput = document.getElementById('unified-content-mode') as HTMLInputElement | null;
        const affiliateLinkInput = document.getElementById('shopping-connect-affiliate-link') as HTMLInputElement | null;
        const continuousContentMode = document.getElementById('continuous-content-mode-select') as HTMLSelectElement | null;

        // 1. 대표 모드 설정이 'affiliate'인 경우
        if (contentModeInput && contentModeInput.value === 'affiliate') return true;

        // 2. 연속발행 모드 설정이 'affiliate'인 경우
        if (continuousContentMode && continuousContentMode.value === 'affiliate') return true;

        // 3. 제휴 링크가 입력되어 있고 쇼핑커넥트 설정이 보이는 경우
        const shoppingConnectSettings = document.getElementById('shopping-connect-settings');
        if (shoppingConnectSettings && shoppingConnectSettings.style.display !== 'none' && affiliateLinkInput?.value.trim()) {
            return true;
        }

        return false;
    } catch (e) {
        console.warn('[ShoppingConnect] 모드 확인 중 오류:', e);
        return false;
    }
}

/**
 * ✅ [2026-02-19] 제휴 URL 자동 감지 헬퍼
 * 입력된 URL이 쿠팡/11번가 등의 제휴 링크인지 판별
 */
export function isAffiliateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    const AFFILIATE_PATTERNS = [
        /link\.coupang\.com/i,
        /coupa\.ng/i,
        /coupang\.com\/vp\//i,
        /11st\.co\.kr/i,
        /cr\.shopping\.naver\.com/i,
    ];
    return AFFILIATE_PATTERNS.some(p => p.test(trimmed));
}

/**
 * ✅ [2026-02-19] URL에서 제휴 링크 자동 추출 헬퍼
 * 명시적 제휴 링크 입력이 없을 때, 소스 URL이 제휴 URL이면 그것을 반환
 */
export function resolveAffiliateLink(
    explicitAffiliateLink: string | undefined,
    sourceUrl: string | undefined
): string | undefined {
    // 1. 명시적 입력이 있으면 그대로 사용
    if (explicitAffiliateLink && explicitAffiliateLink.trim()) {
        return explicitAffiliateLink.trim();
    }
    // 2. 소스 URL이 제휴 URL이면 자동 적용
    if (sourceUrl && isAffiliateUrl(sourceUrl)) {
        console.log(`[ShoppingConnect] 🔗 URL 입력에서 제휴링크 자동 감지: ${sourceUrl.substring(0, 60)}...`);
        return sourceUrl.trim();
    }
    return undefined;
}

/**
 * Data-based shopping-connect detection.
 *
 * The legacy isShoppingConnectModeActive() inspects DOM state (checked radios,
 * panel visibility), which can return false when the image tab is active and
 * the shopping-connect settings panel is collapsed. This helper also checks
 * data markers on currentStructuredContent so callers get a reliable signal
 * regardless of which tab is currently visible.
 */
export function isShoppingConnectForCurrentPost(): boolean {
    try {
        if (isShoppingConnectModeActive()) return true;
        const sc = (window as any).currentStructuredContent;
        if (sc?.productInfo || sc?.affiliateLink) return true;
        if ((window as any).crawledProductInfo) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Returns the crawled product image pool attached to the current post, or []
 * when no images have been collected yet.
 */
export function getShoppingConnectImagePool(): any[] {
    try {
        const sc = (window as any).currentStructuredContent;
        return Array.isArray(sc?.images) ? sc.images : [];
    } catch {
        return [];
    }
}

/**
 * Shopping-connect engine whitelist. Only nano-banana-pro (Gemini img2img)
 * can faithfully reproduce the real product — it also hosts "나노바나나2"
 * (gemini-3-1-flash) as an internal sub-model, so the provider whitelist is
 * exactly one entry. All other AI engines (ImageFX, DALL-E, Leonardo,
 * DeepInfra, Stability, Fal.ai, Prodia, Pollinations) are blocked.
 *
 * The guard fires even when the collected-image pool is empty: the user's
 * rule is "무조건 금지" regardless of fallback availability. Callers must
 * surface an explicit error in that case rather than silently falling back
 * to a paid engine.
 */
export function shouldBlockEngineForShoppingConnect(engine: string): boolean {
    if (!isShoppingConnectForCurrentPost()) return false;
    if (engine === 'nano-banana-pro') return false;
    return true;
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).isShoppingConnectModeActive = isShoppingConnectModeActive;
(window as any).isAffiliateUrl = isAffiliateUrl;
(window as any).resolveAffiliateLink = resolveAffiliateLink;
(window as any).isShoppingConnectForCurrentPost = isShoppingConnectForCurrentPost;
(window as any).getShoppingConnectImagePool = getShoppingConnectImagePool;
(window as any).shouldBlockEngineForShoppingConnect = shouldBlockEngineForShoppingConnect;

console.log('[ShoppingConnectUtils] 📦 모듈 로드됨!');
