/**
 * ✅ [2026-01-25] 환경설정 모달 모듈
 * - API 키 관리 (Gemini, Perplexity, 네이버 등)
 * - 전역 AI 설정 관리
 */

// Note: AppConfig 타입은 main 프로세스용이므로 여기서는 any 사용

// ==================== 타입 정의 ====================

interface SettingsModalElements {
    modal: HTMLElement | null;
    closeBtn: HTMLElement | null;
    saveBtn: HTMLElement | null;
    // API 키 입력 필드
    geminiApiKeyInput: HTMLInputElement | null;
    perplexityApiKeyInput: HTMLInputElement | null;
    naverClientIdInput: HTMLInputElement | null;
    naverClientSecretInput: HTMLInputElement | null;
    // AI 설정
    defaultAiProviderSelect: HTMLSelectElement | null;
    geminiModelSelect: HTMLSelectElement | null;
    perplexityModelSelect: HTMLSelectElement | null;
}

// ==================== DOM 요소 캐싱 ====================

let elements: SettingsModalElements | null = null;

function getElements(): SettingsModalElements {
    if (elements) return elements;

    elements = {
        modal: document.getElementById('settings-modal'),
        closeBtn: document.getElementById('settings-modal-close'),
        saveBtn: document.getElementById('settings-modal-save'),
        // API 키 입력
        geminiApiKeyInput: document.getElementById('settings-gemini-api-key') as HTMLInputElement,
        perplexityApiKeyInput: document.getElementById('settings-perplexity-api-key') as HTMLInputElement,
        naverClientIdInput: document.getElementById('settings-naver-client-id') as HTMLInputElement,
        naverClientSecretInput: document.getElementById('settings-naver-client-secret') as HTMLInputElement,
        // AI 설정
        defaultAiProviderSelect: document.getElementById('settings-default-ai-provider') as HTMLSelectElement,
        geminiModelSelect: document.getElementById('settings-gemini-model') as HTMLSelectElement,
        perplexityModelSelect: document.getElementById('settings-perplexity-model') as HTMLSelectElement,
    };

    return elements;
}

// ==================== 모달 열기/닫기 ====================

export function openSettingsModal(): void {
    const els = getElements();
    if (!els.modal) {
        console.error('[SettingsModal] 모달 요소를 찾을 수 없습니다.');
        return;
    }

    // 현재 설정 로드
    loadCurrentSettings();

    els.modal.style.display = 'flex';
    console.log('[SettingsModal] 환경설정 모달 열림');
}

export function closeSettingsModal(): void {
    const els = getElements();
    if (els.modal) {
        els.modal.style.display = 'none';
        console.log('[SettingsModal] 환경설정 모달 닫힘');
    }
}

// ==================== 설정 로드 ====================

async function loadCurrentSettings(): Promise<void> {
    try {
        const config = await (window as any).api.getConfig();
        const els = getElements();

        // API 키 로드
        if (els.geminiApiKeyInput && config.geminiApiKey) {
            els.geminiApiKeyInput.value = maskApiKey(config.geminiApiKey);
            els.geminiApiKeyInput.dataset.realValue = config.geminiApiKey;
        }
        if (els.perplexityApiKeyInput && config.perplexityApiKey) {
            els.perplexityApiKeyInput.value = maskApiKey(config.perplexityApiKey);
            els.perplexityApiKeyInput.dataset.realValue = config.perplexityApiKey;
        }
        if (els.naverClientIdInput && config.naverClientId) {
            els.naverClientIdInput.value = config.naverClientId;
        }
        if (els.naverClientSecretInput && config.naverClientSecret) {
            els.naverClientSecretInput.value = maskApiKey(config.naverClientSecret);
            els.naverClientSecretInput.dataset.realValue = config.naverClientSecret;
        }

        // AI 설정 로드
        if (els.defaultAiProviderSelect && config.defaultAiProvider) {
            els.defaultAiProviderSelect.value = config.defaultAiProvider;
        }
        if (els.geminiModelSelect && config.geminiModel) {
            els.geminiModelSelect.value = config.geminiModel;
        }
        if (els.perplexityModelSelect && config.perplexityModel) {
            els.perplexityModelSelect.value = config.perplexityModel;
        }

        console.log('[SettingsModal] 현재 설정 로드 완료');
    } catch (error) {
        console.error('[SettingsModal] 설정 로드 실패:', error);
    }
}

// ==================== 설정 저장 ====================

async function saveSettings(): Promise<void> {
    try {
        const els = getElements();
        const currentConfig = await (window as any).api.getConfig();

        // API 키 수집 (마스킹되지 않은 실제 값 사용)
        const geminiKey = els.geminiApiKeyInput?.dataset.realValue ||
            (els.geminiApiKeyInput?.value.includes('•') ? currentConfig.geminiApiKey : els.geminiApiKeyInput?.value) || '';
        const perplexityKey = els.perplexityApiKeyInput?.dataset.realValue ||
            (els.perplexityApiKeyInput?.value.includes('•') ? currentConfig.perplexityApiKey : els.perplexityApiKeyInput?.value) || '';
        const naverClientId = els.naverClientIdInput?.value || '';
        const naverClientSecret = els.naverClientSecretInput?.dataset.realValue ||
            (els.naverClientSecretInput?.value.includes('•') ? currentConfig.naverClientSecret : els.naverClientSecretInput?.value) || '';

        // 업데이트할 설정
        const updatedConfig: Record<string, any> = {
            ...currentConfig,
            geminiApiKey: geminiKey,
            perplexityApiKey: perplexityKey,
            naverClientId: naverClientId,
            naverClientSecret: naverClientSecret,
            defaultAiProvider: els.defaultAiProviderSelect?.value as 'gemini' | 'perplexity' || 'gemini',
            geminiModel: els.geminiModelSelect?.value || 'gemini-2.5-flash',
            perplexityModel: els.perplexityModelSelect?.value || 'sonar',
        };

        // 저장
        await (window as any).api.saveConfig(updatedConfig);

        // 토스트 알림
        if ((window as any).toastManager) {
            (window as any).toastManager.success('✅ 환경설정이 저장되었습니다!');
        }

        console.log('[SettingsModal] 설정 저장 완료');
        closeSettingsModal();

    } catch (error) {
        console.error('[SettingsModal] 설정 저장 실패:', error);
        if ((window as any).toastManager) {
            (window as any).toastManager.error(`❌ 설정 저장 실패: ${(error as Error).message}`);
        }
    }
}

// ==================== 유틸리티 ====================

function maskApiKey(key: string): string {
    if (!key || key.length < 8) return key;
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
}

// ==================== 초기화 ====================

export function initSettingsModal(): void {
    const els = getElements();

    // 설정 버튼 클릭 이벤트
    const settingsBtn = document.getElementById('settings-button-fixed');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            openSettingsModal();
        });
        console.log('[SettingsModal] 설정 버튼 이벤트 연결됨');
    }

    // 닫기 버튼
    if (els.closeBtn) {
        els.closeBtn.addEventListener('click', closeSettingsModal);
    }

    // 저장 버튼
    if (els.saveBtn) {
        els.saveBtn.addEventListener('click', saveSettings);
    }

    // 배경 클릭 시 닫기
    if (els.modal) {
        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal) {
                closeSettingsModal();
            }
        });
    }

    // API 키 입력 필드에 포커스 시 마스킹 해제
    const apiKeyInputs = [els.geminiApiKeyInput, els.perplexityApiKeyInput, els.naverClientSecretInput];
    apiKeyInputs.forEach(input => {
        if (input) {
            input.addEventListener('focus', () => {
                if (input.dataset.realValue) {
                    input.value = input.dataset.realValue;
                }
            });
            input.addEventListener('blur', () => {
                if (input.value && !input.value.includes('•')) {
                    input.dataset.realValue = input.value;
                    input.value = maskApiKey(input.value);
                }
            });
        }
    });

    console.log('[SettingsModal] 📦 환경설정 모달 초기화 완료!');
}

// 전역 노출
(window as any).openSettingsModal = openSettingsModal;
(window as any).closeSettingsModal = closeSettingsModal;
