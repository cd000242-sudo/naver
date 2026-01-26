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

// 전역 노출 (기존 코드와의 호환성)
(window as any).isShoppingConnectModeActive = isShoppingConnectModeActive;

console.log('[ShoppingConnectUtils] 📦 모듈 로드됨!');
