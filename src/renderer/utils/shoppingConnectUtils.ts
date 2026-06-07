export type ShoppingConnectLinkKind =
    | 'shopping-connect'
    | 'naver-short'
    | 'coupang-partners'
    | 'marketplace-affiliate'
    | 'direct-smartstore'
    | 'direct-brandstore'
    | 'unknown';

export interface ShoppingConnectLinkClassification {
    kind: ShoppingConnectLinkKind;
    supported: boolean;
    needsResolve: boolean;
    imageCollectionSupported?: boolean;
    warning?: string;
}

const SHOPPING_CONNECT_URL_PATTERNS = [
    /brandconnect\.naver\.com/i,
    /cr\.shopping\.naver\.com/i,
    /shopping\.naver\.com\/external-bridge/i,
    /shopping\.naver\.com\/affiliate/i,
];

const NAVER_SHORT_URL_PATTERNS = [
    /naver\.me\//i,
    /me2\.do\//i,
];

const COUPANG_PARTNERS_PATTERNS = [
    /link\.coupang\.com/i,
    /coupa\.ng/i,
];

export function classifyShoppingConnectLink(url: string): ShoppingConnectLinkClassification {
    if (!url || typeof url !== 'string') {
        return { kind: 'unknown', supported: false, needsResolve: false };
    }

    const trimmed = url.trim();
    if (!trimmed) {
        return { kind: 'unknown', supported: false, needsResolve: false };
    }

    if (NAVER_SHORT_URL_PATTERNS.some(p => p.test(trimmed))) {
        return { kind: 'naver-short', supported: true, needsResolve: true };
    }

    if (SHOPPING_CONNECT_URL_PATTERNS.some(p => p.test(trimmed))) {
        return { kind: 'shopping-connect', supported: true, needsResolve: /brandconnect\.naver\.com/i.test(trimmed) };
    }

    if (COUPANG_PARTNERS_PATTERNS.some(p => p.test(trimmed))) {
        return {
            kind: 'coupang-partners',
            supported: true,
            needsResolve: true,
            imageCollectionSupported: false,
            warning: '쿠팡 파트너스 링크입니다. 제휴 글 작성은 가능하지만 쿠팡 상품 페이지가 Access Denied로 막히는 경우가 많아 제품 이미지 자동수집은 파트너스 API 승인 키가 있을 때만 안정적입니다.',
        };
    }

    if (/smartstore\.naver\.com/i.test(trimmed)) {
        return {
            kind: 'direct-smartstore',
            supported: false,
            needsResolve: false,
            warning: '스마트스토어 직접 상품 URL입니다. 쇼핑커넥트 수익 추적에는 브랜드커넥트/쇼핑커넥트에서 발급한 링크를 넣어야 합니다.',
        };
    }

    if (/brand\.naver\.com/i.test(trimmed)) {
        return {
            kind: 'direct-brandstore',
            supported: false,
            needsResolve: false,
            warning: '브랜드스토어 직접 상품 URL입니다. 이미지 수집은 가능하지만 제휴 수익 추적 링크로는 쇼핑커넥트 발급 링크가 필요합니다.',
        };
    }

    if (/coupang\.com\/vp\//i.test(trimmed)) {
        return {
            kind: 'marketplace-affiliate',
            supported: true,
            needsResolve: false,
            imageCollectionSupported: false,
            warning: '쿠팡 상품 링크입니다. 제휴 글 작성은 가능하지만 공개 상품 페이지 이미지 수집은 Access Denied로 제한될 수 있어 파트너스 API 승인 키가 있을 때만 안정적입니다.',
        };
    }

    if (/11st\.co\.kr/i.test(trimmed)) {
        return {
            kind: 'marketplace-affiliate',
            supported: true,
            needsResolve: false,
            warning: '마켓 상품 링크입니다. 수익 추적용 링크인지 발급 출처를 확인하세요.',
        };
    }

    return { kind: 'unknown', supported: false, needsResolve: false };
}

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
    return classifyShoppingConnectLink(url).supported;
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
        const classified = classifyShoppingConnectLink(explicitAffiliateLink);
        if (classified.warning) console.warn(`[ShoppingConnect] ${classified.warning}`);
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
 *   - nano-banana     (Gemini img2img, gemini-2.5-flash-image)
 *   - nano-banana-2   (Gemini img2img, gemini-3.1-flash-image-preview)
 *   - nano-banana-pro (Gemini img2img, gemini-3-pro-image-preview)
 *   - openai-image    (gpt-image-2 = 덕테이프)
 * 이 화이트리스트는 "AI 이미지 엔진 선택 드롭다운" 용도로만 쓰임.
 */
const SHOPPING_CONNECT_ALLOWED_ENGINES = ['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'openai-image'] as const;
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
        // ✅ [v2.10.335] 나노바나나 3종 분리 — nano-banana-2 통합 정규화 제거 (각각 별개 모델)
        const normalizedEngine = engine;
        localStorage.setItem(SC_AI_ENGINE_STORAGE_KEY, normalizedEngine);
        if (syncFullAuto) {
            // 반자동 드롭다운도 같이 업데이트 (AI 엔진 범주 내 양방향 sync)
            localStorage.setItem('fullAutoImageSource', normalizedEngine);
            localStorage.setItem('globalImageSource', normalizedEngine);
            (window as any).globalImageSource = normalizedEngine;
            // 드롭다운 UI가 열려 있으면 값도 반영
            const sel = document.getElementById('image-source-select') as HTMLSelectElement | null;
            if (sel && sel.value !== engine) sel.value = engine;
        }
    } catch { /* noop */ }
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).isShoppingConnectModeActive = isShoppingConnectModeActive;
(window as any).isAffiliateUrl = isAffiliateUrl;
(window as any).classifyShoppingConnectLink = classifyShoppingConnectLink;
(window as any).resolveAffiliateLink = resolveAffiliateLink;
(window as any).isShoppingConnectForCurrentPost = isShoppingConnectForCurrentPost;
(window as any).getShoppingConnectImagePool = getShoppingConnectImagePool;
(window as any).shouldBlockEngineForShoppingConnect = shouldBlockEngineForShoppingConnect;
(window as any).getShoppingConnectAIEngine = getShoppingConnectAIEngine;
(window as any).setShoppingConnectAIEngine = setShoppingConnectAIEngine;

console.log('[ShoppingConnectUtils] 📦 모듈 로드됨!');
