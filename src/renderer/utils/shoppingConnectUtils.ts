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

// 전역 노출 (기존 코드와의 호환성)
(window as any).isShoppingConnectModeActive = isShoppingConnectModeActive;
(window as any).isAffiliateUrl = isAffiliateUrl;
(window as any).resolveAffiliateLink = resolveAffiliateLink;

console.log('[ShoppingConnectUtils] 📦 모듈 로드됨!');
