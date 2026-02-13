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
    deepinfraApiKeyInput: HTMLInputElement | null; // ✅ [2026-01-26] DeepInfra API 키 추가
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
        deepinfraApiKeyInput: document.getElementById('settings-deepinfra-api-key') as HTMLInputElement, // ✅ [2026-01-26] DeepInfra
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

    // ✅ [2026-01-27] 다른 모달들 먼저 닫기 (중첩 방지)
    const modalsToClose = [
        'continuous-mode-modal',
        'continuous-settings-modal',
        'ma-publish-modal',
        'ma-account-edit-modal',
        'fullauto-settings-modal'
    ];
    modalsToClose.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    });

    // ✅ [2026-01-27 FIX] 헬퍼 함수로 강제 상태 리셋
    const forceResetNavState = () => {
        const navButtons = document.getElementById('settings-nav-buttons');
        if (navButtons) {
            navButtons.style.display = 'flex';
            console.log('[SettingsModal] ✅ navButtons display: flex');
        } else {
            console.error('[SettingsModal] ❌ settings-nav-buttons 없음!');
        }
        // ✅ [2026-01-27] 모든 섹션 숨기기 (image-model 포함)
        const sectionIds = [
            'settings-section-api-keys',
            'settings-section-text-engine',
            'settings-section-image-model',
            'settings-section-image-path'
        ];
        sectionIds.forEach(id => {
            const section = document.getElementById(id);
            if (section) {
                section.style.display = 'none';
                console.log(`[SettingsModal] ✅ ${id} display: none`);
            }
        });
    };

    // 첫 번째 리셋 실행
    forceResetNavState();

    // 현재 설정 로드 (비동기)
    loadCurrentSettings();

    // ✅ [2026-01-27 FIX] 모달 표시 직전에 다시 한번 강제 리셋 (다른 곳에서 변경했을 경우 대비)
    forceResetNavState();

    els.modal.style.display = 'flex';
    console.log('[SettingsModal] 환경설정 모달 열림');
}

export function closeSettingsModal(): void {
    const els = getElements();
    if (els.modal) {
        // ✅ [2026-01-27] 모달 닫을 때 상태 리셋 - 네비게이션 버튼 다시 표시 + 모든 섹션 숨김
        const navButtons = document.getElementById('settings-nav-buttons');
        if (navButtons) {
            navButtons.style.display = 'flex';
        }
        const sectionIds = [
            'settings-section-api-keys',
            'settings-section-text-engine',
            'settings-section-image-model',
            'settings-section-image-path'
        ];
        sectionIds.forEach(id => {
            const section = document.getElementById(id);
            if (section) section.style.display = 'none';
        });

        els.modal.style.display = 'none';
        console.log('[SettingsModal] 환경설정 모달 닫힘 (상태 리셋 완료)');
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
        // ✅ [2026-01-26] DeepInfra API 키 로드
        if (els.deepinfraApiKeyInput && config.deepinfraApiKey) {
            els.deepinfraApiKeyInput.value = maskApiKey(config.deepinfraApiKey);
            els.deepinfraApiKeyInput.dataset.realValue = config.deepinfraApiKey;
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
        // ✅ [2026-01-26] DeepInfra API 키 수집
        const deepinfraKey = els.deepinfraApiKeyInput?.dataset.realValue ||
            (els.deepinfraApiKeyInput?.value.includes('•') ? currentConfig.deepinfraApiKey : els.deepinfraApiKeyInput?.value) || '';
        const naverClientId = els.naverClientIdInput?.value || '';
        const naverClientSecret = els.naverClientSecretInput?.dataset.realValue ||
            (els.naverClientSecretInput?.value.includes('•') ? currentConfig.naverClientSecret : els.naverClientSecretInput?.value) || '';

        // 업데이트할 설정
        const updatedConfig: Record<string, any> = {
            ...currentConfig,
            geminiApiKey: geminiKey,
            perplexityApiKey: perplexityKey,
            deepinfraApiKey: deepinfraKey, // ✅ [2026-01-26] DeepInfra 저장
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

let _settingsModalInitialized = false; // ✅ [2026-02-08] 이중 초기화 방지 가드

export function initSettingsModal(): void {
    // ✅ [2026-02-08 FIX] 이중 초기화 방지 — 이벤트 리스너 중복 등록으로 인한 UI 깜빡거림 수정
    if (_settingsModalInitialized) {
        console.log('[SettingsModal] ⚠️ 이미 초기화됨 — 중복 호출 무시');
        return;
    }
    _settingsModalInitialized = true;
    console.log('[SettingsModal] 🚀 initSettingsModal 함수 호출됨!');

    try {
        const els = getElements();
        console.log('[SettingsModal] getElements() 완료');

        // 설정 버튼 클릭 이벤트
        const settingsBtn = document.getElementById('settings-button-fixed');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                openSettingsModal();
            });
            console.log('[SettingsModal] 설정 버튼 이벤트 연결됨');
        } else {
            console.warn('[SettingsModal] ⚠️ settings-button-fixed 버튼을 찾을 수 없음');
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
        const apiKeyInputs = [els.geminiApiKeyInput, els.perplexityApiKeyInput, els.deepinfraApiKeyInput, els.naverClientSecretInput];
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

        // ✅ [2026-01-27] 설정 섹션 토글 버튼 이벤트
        setupSettingsSectionToggle();

        // ✅ [2026-01-27] 이미지 생성 모델 설정 버튼 (완전 자동 이미지 설정 영역에서 열기)
        setupImageModelSettingsButton();

        console.log('[SettingsModal] 📦 환경설정 모달 초기화 완료!');
    } catch (error) {
        console.error('[SettingsModal] ❌ 초기화 중 에러:', error);
    }
}

// ✅ [2026-01-27] 설정 섹션 페이지 전환 기능 (모달 내 서브페이지)
function setupSettingsSectionToggle(): void {
    console.log('[SettingsModal] 🔧 setupSettingsSectionToggle 시작...');

    const navButtons = document.getElementById('settings-nav-buttons');
    console.log('[SettingsModal] settings-nav-buttons:', navButtons ? '✅ 발견' : '❌ 없음');

    // ✅ [2026-01-27] 이미지 모델 설정 제거됨 (완전 자동 이미지 설정으로 이동)
    const sections = [
        { btnId: 'nav-api-keys-btn', sectionId: 'settings-section-api-keys', title: '🔑 API 키 통합 설정', color: '#8b5cf6' },
        { btnId: 'nav-text-engine-btn', sectionId: 'settings-section-text-engine', title: '🤖 AI 텍스트 엔진 선택', color: '#D4AF37' },
        { btnId: 'nav-image-path-btn', sectionId: 'settings-section-image-path', title: '📁 이미지 저장 경로', color: '#3b82f6' },
    ];

    // 모든 섹션 초기 숨김
    sections.forEach(({ sectionId }) => {
        const section = document.getElementById(sectionId);
        if (section) section.style.display = 'none';
    });

    sections.forEach(({ btnId, sectionId, title, color }) => {
        const btn = document.getElementById(btnId);
        const section = document.getElementById(sectionId);

        console.log(`[SettingsModal] ${btnId}: 버튼=${btn ? '✅' : '❌'}, 섹션=${section ? '✅' : '❌'}`);

        if (btn && section) {
            btn.addEventListener('click', () => {
                console.log(`[SettingsModal] ${title} 섹션 열기`);

                // 네비게이션 버튼 숨기기
                if (navButtons) navButtons.style.display = 'none';

                // 다른 모든 섹션 숨기기
                sections.forEach(({ sectionId: otherId }) => {
                    const other = document.getElementById(otherId);
                    if (other) other.style.display = 'none';
                });

                // ✅ [2026-01-27 FIX] settingsContent 컨테이너에 섹션 명시적 배치
                const settingsContent = document.querySelector('.settings-content');
                if (settingsContent && section.parentElement !== settingsContent) {
                    console.log('[SettingsModal] 섹션을 settings-content로 이동:', sectionId);
                    settingsContent.appendChild(section);
                }

                // 해당 섹션 표시
                section.style.display = 'block';

                // 뒤로가기 버튼이 없으면 동적으로 추가
                let backBtn = section.querySelector('.settings-back-btn') as HTMLButtonElement;
                if (!backBtn) {
                    backBtn = document.createElement('button');
                    backBtn.type = 'button';
                    backBtn.className = 'settings-back-btn';
                    backBtn.innerHTML = `← 설정 메뉴로 돌아가기`;
                    backBtn.style.cssText = `
                        padding: 0.65rem 1rem;
                        background: linear-gradient(135deg, ${color}22, ${color}11);
                        border: 2px solid ${color};
                        border-radius: 10px;
                        color: ${color};
                        font-weight: 700;
                        font-size: 0.85rem;
                        cursor: pointer;
                        margin-bottom: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        transition: all 0.2s ease;
                    `;
                    backBtn.addEventListener('click', () => {
                        // 섹션 숨기기
                        section.style.display = 'none';
                        // 네비게이션 버튼 다시 표시
                        if (navButtons) navButtons.style.display = 'flex';
                    });
                    backBtn.addEventListener('mouseenter', () => {
                        backBtn.style.transform = 'translateX(-3px)';
                    });
                    backBtn.addEventListener('mouseleave', () => {
                        backBtn.style.transform = 'translateX(0)';
                    });
                    section.insertBefore(backBtn, section.firstChild);
                }
            });

            // 호버 효과
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'translateY(-2px)';
                btn.style.boxShadow = `0 6px 20px ${color}33`;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = `0 3px 12px ${color}26`;
            });
        }
    });

    console.log('[SettingsModal] ✅ 설정 섹션 페이지 전환 버튼 연결 완료');
}

// ✅ [2026-01-27] 이미지 생성 모델 설정 버튼 (완전 자동 이미지 설정 영역)
function setupImageModelSettingsButton(): void {
    const openBtn = document.getElementById('open-image-model-settings-btn');
    const section = document.getElementById('settings-section-image-model');
    const modal = document.getElementById('settings-modal');

    console.log('[SettingsModal] 🖼️ 이미지 모델 설정 버튼:', openBtn ? '✅' : '❌', ', 섹션:', section ? '✅' : '❌');

    if (openBtn && section && modal) {
        openBtn.addEventListener('click', () => {
            console.log('[SettingsModal] 🎨 이미지 생성 모델 설정 열기');

            // settings-modal을 열고, 해당 섹션만 표시
            const navButtons = document.getElementById('settings-nav-buttons');
            if (navButtons) navButtons.style.display = 'none';

            // 다른 섹션 숨기기
            const otherSections = [
                'settings-section-api-keys',
                'settings-section-text-engine',
                'settings-section-image-path'
            ];
            otherSections.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            // 이미지 모델 섹션 표시
            section.style.display = 'block';

            // 뒤로가기 버튼 추가 (없으면)
            let backBtn = section.querySelector('.settings-back-btn') as HTMLButtonElement;
            if (!backBtn) {
                backBtn = document.createElement('button');
                backBtn.type = 'button';
                backBtn.className = 'settings-back-btn';
                backBtn.innerHTML = `← 닫기`;
                backBtn.style.cssText = `
                    padding: 0.65rem 1rem;
                    background: linear-gradient(135deg, #10b98122, #10b98111);
                    border: 2px solid #10b981;
                    border-radius: 10px;
                    color: #10b981;
                    font-weight: 700;
                    font-size: 0.85rem;
                    cursor: pointer;
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.2s ease;
                `;
                backBtn.addEventListener('click', () => {
                    section.style.display = 'none';
                    modal.style.display = 'none';
                });
                section.insertBefore(backBtn, section.firstChild);
            }

            // 모달 열기
            modal.style.display = 'flex';
        });
    }
}

// 전역 노출
(window as any).openSettingsModal = openSettingsModal;
(window as any).closeSettingsModal = closeSettingsModal;
(window as any).initSettingsModal = initSettingsModal;

// ✅ [2026-02-08 FIX] 자체 DOMContentLoaded 호출 제거
// renderer.ts에서 initSettingsModalFunc()을 DOMContentLoaded에서 호출하므로
// 여기서 중복 호출하면 이벤트 리스너가 2번 등록되어 UI 깜빡거림 발생
// (기존: DOMContentLoaded + 직접호출로 이중 초기화됨 → 제거)
