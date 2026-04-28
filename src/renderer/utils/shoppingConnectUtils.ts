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
 * Shopping-connect AI engine whitelist (img2img 가능 — 제품 정체성 유지).
 *   - nano-banana-pro (Gemini img2img, gemini-3-pro 라벨)
 *   - nano-banana-2   (Gemini img2img, gemini-3-1-flash 라벨)
 *   - openai-image    (gpt-image-2 = 덕트테이프)
 * 이 화이트리스트는 "AI 이미지 엔진 선택 드롭다운" 용도로만 쓰임.
 */
const SHOPPING_CONNECT_ALLOWED_ENGINES = ['nano-banana-pro', 'nano-banana-2', 'openai-image'] as const;
export type ShoppingConnectAIEngine = typeof SHOPPING_CONNECT_ALLOWED_ENGINES[number];

/**
 * ✅ [v2.7.28] 차단 대상은 제품을 가짜로 만들어내는 text-only AI 엔진만.
 * 수집/검색/저장 기반 provider(naver, collected, saved, local-folder, no-images, gallery)는
 * 제품 정체성을 변형하지 않으므로 모두 통과시킨다.
 */
const SHOPPING_CONNECT_BLOCKED_FAKE_AI = [
    'imagefx', 'dall-e-3', 'leonardoai', 'deepinfra', 'deepinfra-flux',
    'stability', 'falai', 'prodia', 'pollinations', 'flow',
];

export function shouldBlockEngineForShoppingConnect(engine: string): boolean {
    if (!isShoppingConnectForCurrentPost()) return false;
    return SHOPPING_CONNECT_BLOCKED_FAKE_AI.includes(engine);
}

/**
 * [v1.6.3] 쇼핑 커넥트 전용 AI 이미지 엔진 저장 키.
 * 반자동 이미지관리 드롭다운(fullAutoImageSource)과는 독립적으로 관리되나,
 * AI 이미지 엔진 범주(nano-banana-pro | openai-image)에서는 양방향 동기화됨.
 */
export const SC_AI_ENGINE_STORAGE_KEY = 'scAIImageEngine';

export function getShoppingConnectAIEngine(): ShoppingConnectAIEngine {
    try {
        const stored = localStorage.getItem(SC_AI_ENGINE_STORAGE_KEY);
        if (stored && (SHOPPING_CONNECT_ALLOWED_ENGINES as readonly string[]).includes(stored)) {
            return stored as ShoppingConnectAIEngine;
        }
        // 초기값: 반자동 드롭다운이 허용 엔진이면 그 값, 아니면 나노바나나2 기본
        const fullAuto = localStorage.getItem('fullAutoImageSource');
        if (fullAuto && (SHOPPING_CONNECT_ALLOWED_ENGINES as readonly string[]).includes(fullAuto)) {
            return fullAuto as ShoppingConnectAIEngine;
        }
    } catch { /* noop */ }
    return 'nano-banana-pro';
}

export function setShoppingConnectAIEngine(engine: ShoppingConnectAIEngine, syncFullAuto: boolean = true): void {
    try {
        localStorage.setItem(SC_AI_ENGINE_STORAGE_KEY, engine);
        if (syncFullAuto) {
            // 반자동 드롭다운도 같이 업데이트 (AI 엔진 범주 내 양방향 sync)
            localStorage.setItem('fullAutoImageSource', engine);
            localStorage.setItem('globalImageSource', engine);
            (window as any).globalImageSource = engine;
            // 드롭다운 UI가 열려 있으면 값도 반영
            const sel = document.getElementById('image-source-select') as HTMLSelectElement | null;
            if (sel && sel.value !== engine) sel.value = engine;
        }
    } catch { /* noop */ }
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).isShoppingConnectModeActive = isShoppingConnectModeActive;
(window as any).isAffiliateUrl = isAffiliateUrl;
(window as any).resolveAffiliateLink = resolveAffiliateLink;
(window as any).isShoppingConnectForCurrentPost = isShoppingConnectForCurrentPost;
(window as any).getShoppingConnectImagePool = getShoppingConnectImagePool;
(window as any).shouldBlockEngineForShoppingConnect = shouldBlockEngineForShoppingConnect;
(window as any).getShoppingConnectAIEngine = getShoppingConnectAIEngine;
(window as any).setShoppingConnectAIEngine = setShoppingConnectAIEngine;

console.log('[ShoppingConnectUtils] 📦 모듈 로드됨!');
