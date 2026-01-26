/**
 * ✅ [2026-01-25 모듈화] 카테고리 모달 유틸리티
 * - renderer.ts에서 분리됨
 * - 전역 카테고리 선택 모달 열기/닫기 및 이벤트 처리
 */

/**
 * 전역 카테고리 선택 모달 열기
 */
export function openUnifiedCategoryModal(): void {
    console.log('[Global] openUnifiedCategoryModal called');
    const modal = document.getElementById('category-selection-modal');
    if (modal) {
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0, 0, 0, 0.7)';
        modal.style.zIndex = '999999';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    } else {
        console.error('[Global] category-selection-modal not found!');
        alert('⚠️ 카테고리 선택 모달을 찾을 수 없습니다.');
    }
}

/**
 * 연속 발행 모드 전역 카테고리 선택 모달
 */
export function openCategoryModalInContinuousMode(targetType: 'main' | 'continuous-settings'): void {
    console.log('[Continuous] openCategoryModalInContinuousMode called for:', targetType);
    (window as any).continuousCategoryTarget = targetType;
    openUnifiedCategoryModal();
}

/**
 * 카테고리 선택 메시지 리스너 초기화
 */
export function initCategorySelectionListener(): void {
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (data && data.type === 'CATEGORY_SELECTED') {
            const category = data.category;
            const categoryName = data.categoryName;
            const target = (window as any).continuousCategoryTarget;

            if (target === 'main' || target === 'continuous-settings') {
                const mainInput = document.getElementById('continuous-category-select') as HTMLInputElement;
                const mainText = document.getElementById('continuous-category-text');
                const modalInput = document.getElementById('continuous-modal-category-select') as HTMLInputElement;
                const modalText = document.getElementById('continuous-modal-category-text');

                if (mainInput) mainInput.value = category;
                if (mainText) mainText.textContent = categoryName;
                if (modalInput) modalInput.value = category;
                if (modalText) modalText.textContent = categoryName;

                // 제휴 옵션 가시성 업데이트
                if ((window as any).updateAffiliateOptionVisibility) {
                    (window as any).updateAffiliateOptionVisibility(category, 'continuous-content-mode-select');
                    (window as any).updateAffiliateOptionVisibility(category, 'continuous-modal-content-mode');
                }

                if ((window as any).showToast) {
                    (window as any).showToast(`📂 카테고리가 "${categoryName}"(으)로 설정되었습니다.`, 'info');
                }
            }
        }
    });
}

// 전역 노출 (하위 호환성)
(window as any).openUnifiedCategoryModal = openUnifiedCategoryModal;
(window as any).openCategoryModalInContinuousMode = openCategoryModalInContinuousMode;

console.log('[CategoryModalUtils] 📦 모듈 로드됨!');
