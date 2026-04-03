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
            'settings-section-image-path',
            'settings-section-adb-ip',
            'settings-section-adspower',
            'settings-section-proxy',
            'settings-section-cache'
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
            'settings-section-image-path',
            'settings-section-adb-ip',
            'settings-section-adspower',
            'settings-section-proxy',
            'settings-section-cache'
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

        // ✅ [2026-02-22 FIX] defaultAiProvider → unified-generator 동기화
        // 모든 글 생성 함수가 #unified-generator 값을 읽으므로 반드시 동기화 필요
        const provider = config.defaultAiProvider || 'gemini';
        const unifiedGeneratorEl = document.getElementById('unified-generator') as HTMLInputElement;
        if (unifiedGeneratorEl && unifiedGeneratorEl.value !== provider) {
            unifiedGeneratorEl.value = provider;
            console.log(`[SettingsModal] ✅ unified-generator 동기화: ${provider}`);
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
            defaultAiProvider: els.defaultAiProviderSelect?.value as 'gemini' | 'perplexity' | 'openai' | 'claude' || 'gemini',
            geminiModel: els.geminiModelSelect?.value || 'gemini-2.5-flash',
            perplexityModel: els.perplexityModelSelect?.value || 'sonar',
        };

        // 저장
        await (window as any).api.saveConfig(updatedConfig);

        // ✅ [2026-02-22 FIX] 저장 후 unified-generator 즉시 동기화
        const savedProvider = updatedConfig.defaultAiProvider || 'gemini';
        const unifiedGeneratorEl = document.getElementById('unified-generator') as HTMLInputElement;
        if (unifiedGeneratorEl) {
            unifiedGeneratorEl.value = savedProvider;
            console.log(`[SettingsModal] ✅ 저장 후 unified-generator 동기화: ${savedProvider}`);
        }

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

        // ✅ [2026-03-11] ADB IP 변경 설정 이벤트
        setupAdbIpSettings();

        // ✅ [2026-03-13] AdsPower 연동 설정 이벤트
        setupAdsPowerSettings();

        // ✅ [2026-03-17] 프록시 설정 이벤트
        setupProxySettings();

        // ✅ [2026-03-24] 캐시 관리 이벤트
        setupCacheSettings();

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
        { btnId: 'nav-adb-ip-btn', sectionId: 'settings-section-adb-ip', title: '📱 테더링 IP 변경', color: '#10b981' },
        { btnId: 'nav-adspower-btn', sectionId: 'settings-section-adspower', title: '🌐 AdsPower 연동', color: '#f97316' },
        { btnId: 'nav-proxy-btn', sectionId: 'settings-section-proxy', title: '🛡️ 프록시 설정', color: '#a855f7' },
        { btnId: 'nav-cache-btn', sectionId: 'settings-section-cache', title: '🗑️ 캐시 관리', color: '#ef4444' },
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
                'settings-section-image-path',
                'settings-section-adb-ip',
                'settings-section-adspower',
                'settings-section-proxy',
                'settings-section-cache'
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

// ✅ [2026-03-11] 테더링 IP 변경 설정 이벤트 핸들러
function setupAdbIpSettings(): void {
    console.log('[SettingsModal] 📱 테더링 IP 설정 이벤트 연결 시작...');

    const toggle = document.getElementById('settings-adb-ip-toggle') as HTMLInputElement;
    const slider = document.getElementById('settings-adb-ip-slider') as HTMLElement;
    const sliderDot = document.getElementById('settings-adb-ip-slider-dot') as HTMLElement;
    const everyInput = document.getElementById('settings-adb-ip-every') as HTMLInputElement;
    const statusEl = document.getElementById('settings-adb-status');

    // 토글 슬라이더 시각 업데이트
    const updateToggleVisual = (checked: boolean) => {
        if (slider) slider.style.background = checked ? '#10b981' : 'rgba(255,255,255,0.12)';
        if (sliderDot) sliderDot.style.transform = checked ? 'translateX(22px)' : 'translateX(0)';
    };

    // 저장된 값 로드
    if (toggle) {
        toggle.checked = localStorage.getItem('adbIpChangeEnabled') === 'true';
        updateToggleVisual(toggle.checked);
    }
    if (everyInput) {
        everyInput.value = localStorage.getItem('adbIpChangeEvery') || '1';
    }

    // 토글 이벤트
    toggle?.addEventListener('change', () => {
        localStorage.setItem('adbIpChangeEnabled', toggle.checked ? 'true' : 'false');
        updateToggleVisual(toggle.checked);
    });

    // 간격 변경 이벤트
    everyInput?.addEventListener('change', () => {
        const val = Math.max(1, parseInt(everyInput.value) || 1);
        everyInput.value = String(val);
        localStorage.setItem('adbIpChangeEvery', String(val));
    });

    // 연결 테스트
    document.getElementById('settings-adb-test-btn')?.addEventListener('click', async () => {
        if (statusEl) statusEl.innerHTML = '<span style="color: #f59e0b;">🔄 연결 확인 중...</span>';
        try {
            const result = await (window as any).api.adbCheckDevice();
            if (statusEl) {
                if (result.connected) {
                    statusEl.innerHTML = `<span style="color: #10b981;">✅ ${result.message}</span>`;
                } else if (result.message?.includes('ADB') && (result.message?.includes('찾을 수 없') || result.message?.includes('not found'))) {
                    statusEl.innerHTML = `<span style="color: #fbbf24;">⚠️ ADB 미설치 → '📥 ADB 설치' 버튼을 눌러주세요</span>`;
                } else {
                    statusEl.innerHTML = `<span style="color: #ef4444;">❌ ${result.message}</span>`;
                }
            }
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">❌ 오류: ${(err as Error).message}</span>`;
        }
    });

    // 현재 IP 확인
    document.getElementById('settings-adb-ip-check-btn')?.addEventListener('click', async () => {
        if (statusEl) statusEl.innerHTML = '<span style="color: #f59e0b;">🔄 IP 조회 중...</span>';
        try {
            const result = await (window as any).api.adbGetCurrentIp();
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: #60a5fa;">🌐 현재 IP: <strong>${result.ip}</strong></span>`;
            }
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">❌ 오류: ${(err as Error).message}</span>`;
        }
    });

    // IP 변경 테스트
    document.getElementById('settings-adb-change-test-btn')?.addEventListener('click', async () => {
        if (statusEl) statusEl.innerHTML = '<span style="color: #f59e0b;">🔄 IP 변경 중... (약 15초)</span>';
        try {
            const result = await (window as any).api.adbChangeIp(5);
            if (statusEl) {
                statusEl.innerHTML = result.success
                    ? `<span style="color: #10b981;">✅ ${result.message}</span>`
                    : `<span style="color: #ef4444;">⚠️ ${result.message}</span>`;
            }
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">❌ 오류: ${(err as Error).message}</span>`;
        }
    });

    // ADB 설치
    document.getElementById('settings-adb-download-btn')?.addEventListener('click', async () => {
        const downloadBtn = document.getElementById('settings-adb-download-btn') as HTMLButtonElement;
        if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '⏳ 설치 중...';
        }
        if (statusEl) statusEl.innerHTML = '<span style="color: #f59e0b;">📥 ADB 다운로드 중... (약 30초)</span>';
        try {
            const result = await (window as any).api.adbDownload();
            if (statusEl) {
                statusEl.innerHTML = result.success
                    ? `<span style="color: #10b981;">✅ ${result.message}</span>`
                    : `<span style="color: #ef4444;">❌ ${result.message}</span>`;
            }
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = result.success ? '✅ 설치 완료' : '📥 ADB 설치';
            }
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color: #ef4444;">❌ 오류: ${(err as Error).message}</span>`;
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '📥 ADB 설치';
            }
        }
    });

    // 사용방법 가이드
    document.getElementById('settings-adb-guide-btn')?.addEventListener('click', () => {
        showAdbGuideModal();
    });

    // ✅ [2026-03-11] 설정 완료 버튼 — 저장 확정 + 토스트 + 메뉴 복귀
    document.getElementById('settings-adb-save-btn')?.addEventListener('click', () => {
        // localStorage에 이미 실시간 저장되어 있지만, 명시적으로 한번 더 확정
        if (toggle) {
            localStorage.setItem('adbIpChangeEnabled', toggle.checked ? 'true' : 'false');
        }
        if (everyInput) {
            const val = Math.max(1, parseInt(everyInput.value) || 1);
            localStorage.setItem('adbIpChangeEvery', String(val));
        }

        // 토스트 알림
        if ((window as any).toastManager) {
            (window as any).toastManager.success('✅ 테더링 IP 변경 설정이 저장되었습니다!');
        }

        // 섹션 닫고 네비게이션 메뉴로 복귀
        const section = document.getElementById('settings-section-adb-ip');
        const navButtons = document.getElementById('settings-nav-buttons');
        if (section) section.style.display = 'none';
        if (navButtons) navButtons.style.display = 'flex';

        console.log('[SettingsModal] ✅ 테더링 IP 설정 완료 저장');
    });

    console.log('[SettingsModal] ✅ 테더링 IP 설정 이벤트 연결 완료');
}

// ✅ [2026-03-11] 테더링 IP 변경 사용방법 가이드 모달
function showAdbGuideModal(): void {
    document.getElementById('adb-guide-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'adb-guide-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 30000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
    `;

    modal.innerHTML = `
        <div style="
            background: var(--bg-primary, #161625);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 20px;
            max-width: 520px; width: 92%;
            max-height: 82vh; overflow-y: auto;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            padding: 1.75rem;
            position: relative;
        ">
            <button type="button" id="adb-guide-close"
                style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(255,255,255,0.08); border: none; color: var(--text-muted); font-size: 1.2rem; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;"
            >×</button>

            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 1.3rem;">📱</span>
                </div>
                <div>
                    <h2 style="color: var(--text-strong, #fff); font-size: 1.15rem; margin: 0; font-weight: 800;">테더링 IP 변경 사용방법</h2>
                    <p style="color: var(--text-muted); font-size: 0.78rem; margin: 0.1rem 0 0 0;">비행기모드 ON→OFF로 통신사 공인 IP 재할당</p>
                </div>
            </div>

            <!-- 준비물 -->
            <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="font-weight: 700; color: #10b981; font-size: 0.88rem; margin-bottom: 0.6rem;">🔧 준비물</div>
                <ul style="margin: 0; padding-left: 1.1rem; color: #d1d5db; font-size: 0.82rem; line-height: 1.9;">
                    <li>안드로이드 폰 + <strong style="color: #fbbf24;">데이터 전송용</strong> USB 케이블</li>
                    <li>모바일 데이터 (LTE/5G) 활성화</li>
                </ul>
            </div>

            <!-- 설정 단계 -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="font-weight: 700; color: var(--text-strong, #fff); font-size: 0.88rem; margin-bottom: 0.75rem;">📋 폰 설정 3단계</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; background: rgba(16, 185, 129, 0.05); border-radius: 8px;">
                        <span style="background: #10b981; color: white; min-width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem;">1</span>
                        <div style="color: #d1d5db; font-size: 0.82rem;"><strong>개발자 모드</strong> — 빌드번호 7번 터치</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; background: rgba(16, 185, 129, 0.05); border-radius: 8px;">
                        <span style="background: #10b981; color: white; min-width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem;">2</span>
                        <div style="color: #d1d5db; font-size: 0.82rem;"><strong>USB 디버깅</strong> — 개발자 옵션에서 켜기</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem; background: rgba(16, 185, 129, 0.05); border-radius: 8px;">
                        <span style="background: #10b981; color: white; min-width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem;">3</span>
                        <div style="color: #d1d5db; font-size: 0.82rem;"><strong>USB 테더링</strong> — 핫스팟 메뉴에서 켜기</div>
                    </div>
                </div>
            </div>

            <!-- 주의사항 -->
            <div style="background: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
                <div style="font-weight: 700; color: #fbbf24; font-size: 0.88rem; margin-bottom: 0.6rem;">⚠️ 주의</div>
                <ul style="margin: 0; padding-left: 1.1rem; color: #d1d5db; font-size: 0.82rem; line-height: 1.9;">
                    <li>폰 팝업에서 <strong>"이 컴퓨터를 항상 허용"</strong> 체크</li>
                    <li>PC의 <strong style="color: #ef4444;">WiFi/유선 인터넷 끄기</strong> (테더링만 사용)</li>
                    <li>ADB 미설치 시 📥 ADB 설치 버튼 클릭</li>
                </ul>
            </div>

            <button type="button" id="adb-guide-confirm"
                style="width: 100%; padding: 0.85rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); transition: all 0.15s;"
            >확인 ✅</button>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('adb-guide-close')?.addEventListener('click', closeModal);
    document.getElementById('adb-guide-confirm')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// ✅ [2026-03-13] AdsPower 연동 설정 이벤트 핸들러
function setupAdsPowerSettings(): void {
    console.log('[SettingsModal] 🌐 AdsPower 설정 이벤트 연결 시작...');

    // ── ✅ [2026-03-14] 활성화/비활성화 토글 ──
    const settingsToggle = document.getElementById('adspower-settings-toggle') as HTMLInputElement;
    const settingsToggleBg = document.getElementById('adspower-settings-toggle-bg');
    const settingsToggleDot = document.getElementById('adspower-settings-toggle-dot');
    const settingsToggleWrap = document.getElementById('adspower-settings-toggle-wrap');

    const updateSettingsToggleVisual = (enabled: boolean) => {
        if (settingsToggleBg) settingsToggleBg.style.background = enabled ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.1)';
        if (settingsToggleDot) {
            settingsToggleDot.style.left = enabled ? '24px' : '2px';
            settingsToggleDot.style.background = enabled ? '#f97316' : '#fff';
        }
    };

    // localStorage에서 초기값 로드 (베스트 상품 모달과 동일 키 사용)
    if (settingsToggle) {
        const savedEnabled = localStorage.getItem('adspower_enabled') === 'true';
        settingsToggle.checked = savedEnabled;
        updateSettingsToggleVisual(savedEnabled);
    }

    // 토글 클릭 이벤트 (wrap 클릭으로 토글)
    settingsToggleWrap?.addEventListener('click', () => {
        if (!settingsToggle) return;
        settingsToggle.checked = !settingsToggle.checked;
        const enabled = settingsToggle.checked;
        localStorage.setItem('adspower_enabled', enabled ? 'true' : 'false');
        updateSettingsToggleVisual(enabled);
        
        // 백엔드에도 동기화
        (window as any).api?.setAdsPowerEnabled?.(enabled);
        
        // 베스트 상품 모달의 토글도 동기화
        const modalToggle = document.getElementById('adspower-toggle') as HTMLInputElement;
        if (modalToggle) {
            modalToggle.checked = enabled;
            // 모달 UI 업데이트 트리거
            modalToggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        if ((window as any).toastManager) {
            if (enabled) {
                (window as any).toastManager.success('🌐 AdsPower 활성화! 크롤링 시 지문 마스킹 브라우저를 사용합니다.');
            } else {
                (window as any).toastManager.info('⚡ AdsPower 비활성화. HTTP 요청으로 수집합니다.');
            }
        }
        console.log(`[SettingsModal] AdsPower 토글: ${enabled ? 'ON' : 'OFF'}`);
    });
    // ── 다운로드 버튼 ──
    document.getElementById('adspower-download-btn')?.addEventListener('click', async () => {
        try {
            await (window as any).api.openExternalUrlDirect('https://www.adspower.com/download');
        } catch (e) {
            console.error('[AdsPower] 다운로드 URL 열기 실패:', e);
        }
    });

    // ── API Key 저장/로드 ──
    const apiKeyInput = document.getElementById('adspower-api-key-input') as HTMLInputElement;
    const apiKeyStatus = document.getElementById('adspower-apikey-status');
    
    // localStorage에서 기존 키 로드
    const savedKey = localStorage.getItem('adspower_api_key') || '';
    if (apiKeyInput && savedKey) {
        apiKeyInput.value = savedKey;
        // main process에 키 전달
        (window as any).api.adsPowerSetApiKey(savedKey).catch(() => {});
        if (apiKeyStatus) apiKeyStatus.textContent = '✅ 저장된 API Key 로드됨';
    }

    document.getElementById('adspower-save-apikey-btn')?.addEventListener('click', async () => {
        const key = apiKeyInput?.value?.trim() || '';
        localStorage.setItem('adspower_api_key', key);
        try {
            await (window as any).api.adsPowerSetApiKey(key);
            if (apiKeyStatus) {
                apiKeyStatus.innerHTML = key 
                    ? '✅ <span style="color:#22c55e;">API Key 저장 완료!</span>'
                    : '✅ <span style="color:#9ca3af;">API Key 해제됨 (인증 없이 사용)</span>';
            }
        } catch (e) {
            if (apiKeyStatus) apiKeyStatus.innerHTML = '❌ <span style="color:#ef4444;">저장 실패</span>';
        }
    });

    // ── 연결 테스트 ──
    document.getElementById('adspower-test-btn')?.addEventListener('click', async () => {
        const statusEl = document.getElementById('adspower-status');
        if (statusEl) statusEl.innerHTML = '⏳ 연결 확인 중...';
        try {
            const result = await (window as any).api.adsPowerCheckStatus();
            if (statusEl) {
                statusEl.innerHTML = result.running
                    ? '✅ <span style="color:#22c55e; font-weight:700;">AdsPower 연결 성공!</span>'
                    : `❌ <span style="color:#ef4444; font-weight:700;">${result.message}</span>`;
            }
        } catch (e) {
            if (statusEl) statusEl.innerHTML = `❌ <span style="color:#ef4444;">연결 실패: ${(e as Error).message}</span>`;
        }
    });

    // ── 프로필 추가 폼 토글 ──
    document.getElementById('adspower-add-profile-btn')?.addEventListener('click', () => {
        const form = document.getElementById('adspower-add-profile-form');
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('adspower-cancel-profile-btn')?.addEventListener('click', () => {
        const form = document.getElementById('adspower-add-profile-form');
        if (form) form.style.display = 'none';
        (document.getElementById('adspower-new-profile-name') as HTMLInputElement).value = '';
    });

    // ── 프로필 저장 (✅ API로 자동 생성) ──
    document.getElementById('adspower-save-profile-btn')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('adspower-new-profile-name') as HTMLInputElement;
        const name = nameInput?.value?.trim();

        if (!name) {
            alert('프로필 이름을 입력해 주세요.');
            return;
        }

        const saveBtn = document.getElementById('adspower-save-profile-btn') as HTMLButtonElement;
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 생성 중...'; }

        try {
            // AdsPower API로 프로필 생성
            const result = await (window as any).api.adsPowerCreateProfile(name);

            if (result.success && result.profileId) {
                // localStorage에 저장
                const profiles = JSON.parse(localStorage.getItem('adspower_profiles') || '[]');
                profiles.push({
                    name,
                    profileId: result.serialNumber || result.profileId,
                    adsPowerId: result.profileId,
                    createdAt: Date.now(),
                });
                localStorage.setItem('adspower_profiles', JSON.stringify(profiles));

                nameInput.value = '';
                const form = document.getElementById('adspower-add-profile-form');
                if (form) form.style.display = 'none';

                renderAdsPowerProfileList();
                console.log(`[AdsPower] ✅ 프로필 자동 생성 완료: ${name} (ID: ${result.profileId})`);
            } else {
                alert(`프로필 생성 실패: ${result.message}\n\nAdsPower가 실행 중인지 확인해 주세요.`);
            }
        } catch (e) {
            alert(`프로필 생성 오류: ${(e as Error).message}`);
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✅ 생성'; }
        }
    });

    // ── 설정 완료 (뒤로가기) ──
    document.getElementById('settings-adspower-save-btn')?.addEventListener('click', () => {
        const section = document.getElementById('settings-section-adspower');
        const navButtons = document.getElementById('settings-nav-buttons');
        if (section) section.style.display = 'none';
        if (navButtons) navButtons.style.display = 'flex';
    });

    // ── 사용방법 가이드 ──
    document.getElementById('adspower-guide-btn')?.addEventListener('click', showAdsPowerGuideModal);

    // 초기 프로필 목록 렌더링
    renderAdsPowerProfileList();

    console.log('[SettingsModal] ✅ AdsPower 설정 이벤트 연결 완료');
}

/** 프로필 목록 렌더링 */
function renderAdsPowerProfileList(): void {
    const listEl = document.getElementById('adspower-profile-list');
    if (!listEl) return;

    const profiles = JSON.parse(localStorage.getItem('adspower_profiles') || '[]');

    if (profiles.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem 0;">
                등록된 프로필이 없습니다.<br>
                <span style="font-size: 0.72rem; opacity: 0.7;">➕ 프로필 추가 버튼을 눌러주세요.</span>
            </div>
        `;
        return;
    }

    listEl.innerHTML = profiles.map((p: any, i: number) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.75rem; background: rgba(249, 115, 22, 0.04); border-radius: 8px; border: 1px solid rgba(249, 115, 22, 0.1); margin-bottom: 0.4rem;">
            <div style="flex: 1;">
                <div style="font-weight: 700; color: var(--text-strong); font-size: 0.85rem;">${p.name}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.1rem;">ID: ${p.profileId}</div>
            </div>
            <button type="button" class="adspower-delete-profile" data-index="${i}"
                style="padding: 0.3rem 0.6rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 0.72rem; font-weight: 700;">
                🗑️ 삭제
            </button>
        </div>
    `).join('');

    // 삭제 버튼 이벤트 (✅ API로 자동 삭제)
    listEl.querySelectorAll('.adspower-delete-profile').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
            const profiles = JSON.parse(localStorage.getItem('adspower_profiles') || '[]');
            const target = profiles[idx];

            if (!target) return;
            if (!confirm(`"${target.name}" 프로필을 삭제하시겠습니까?`)) return;

            // AdsPower API로 삭제 시도
            if (target.adsPowerId) {
                try {
                    await (window as any).api.adsPowerDeleteProfile([target.adsPowerId]);
                } catch (e) {
                    console.warn('[AdsPower] API 삭제 실패 (로컬만 삭제):', e);
                }
            }

            profiles.splice(idx, 1);
            localStorage.setItem('adspower_profiles', JSON.stringify(profiles));
            console.log(`[AdsPower] 프로필 삭제: ${target.name}`);
            renderAdsPowerProfileList();
        });
    });
}

/** AdsPower 초보자 가이드 모달 */
function showAdsPowerGuideModal(): void {
    // 기존 가이드 모달 제거
    const existing = document.getElementById('adspower-guide-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adspower-guide-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);';
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 20px; border: 2px solid rgba(249, 115, 22, 0.3); max-width: 500px; width: 92%; max-height: 85vh; overflow-y: auto; padding: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem;">
                <h3 style="color: #f97316; margin: 0; font-size: 1.2rem; font-weight: 800;">📖 AdsPower 사용방법</h3>
                <button type="button" id="adspower-guide-close" style="background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer;">×</button>
            </div>

            <!-- Step 1 -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
                    <span style="background: #f97316; color: white; min-width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">1</span>
                    <div style="font-weight: 700; color: var(--text-strong, #fff); font-size: 0.95rem;">AdsPower 다운로드 & 설치</div>
                </div>
                <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.6; padding-left: 2.4rem;">
                    위의 <strong style="color: #f97316;">📥 AdsPower 다운로드</strong> 버튼을 클릭하세요.<br>
                    → 공식 사이트에서 Windows 버전을 다운로드합니다.<br>
                    → 설치 파일 실행 후 기본 설정으로 설치하세요.
                </div>
            </div>

            <!-- Step 2 -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
                    <span style="background: #f97316; color: white; min-width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">2</span>
                    <div style="font-weight: 700; color: var(--text-strong, #fff); font-size: 0.95rem;">무료 계정 가입</div>
                </div>
                <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.6; padding-left: 2.4rem;">
                    AdsPower를 실행하면 로그인 화면이 나옵니다.<br>
                    → <strong>Sign Up</strong> 버튼을 클릭합니다.<br>
                    → 이메일만 있으면 <strong style="color: #22c55e;">무료 가입 가능</strong>합니다.<br>
                    → 무료 플랜으로 <strong>프로필 2개</strong>까지 영구 무료!
                </div>
            </div>

            <!-- Step 3 -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
                    <span style="background: #f97316; color: white; min-width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">3</span>
                    <div style="font-weight: 700; color: var(--text-strong, #fff); font-size: 0.95rem;">프로필 만들기</div>
                </div>
                <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.6; padding-left: 2.4rem;">
                    로그인 후 메인 화면에서:<br>
                    → <strong style="color: #f97316;">+ New Profile</strong> 버튼 클릭<br>
                    → 이름을 입력하고 <strong>Create</strong> 버튼 클릭<br>
                    → 프로필이 목록에 나타납니다.
                </div>
            </div>

            <!-- Step 4 -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
                    <span style="background: #f97316; color: white; min-width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">4</span>
                    <div style="font-weight: 700; color: var(--text-strong, #fff); font-size: 0.95rem;">여기서 프로필 생성 (자동!)</div>
                </div>
                <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.6; padding-left: 2.4rem;">
                    위의 <strong style="color: #f97316;">➕ 프로필 추가</strong> 버튼을 클릭합니다.<br>
                    → 프로필 이름만 입력하면 <strong style="color: #22c55e;">AdsPower에서 자동 생성</strong>됩니다!<br>
                    → ID 복사할 필요 없이 바로 사용 가능합니다.
                </div>
            </div>

            <!-- 비용 안내 -->
            <div style="background: rgba(34, 197, 94, 0.06); border: 1px solid rgba(34, 197, 94, 0.15); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="font-weight: 700; color: #22c55e; font-size: 0.88rem; margin-bottom: 0.5rem;">💰 요금 안내</div>
                <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.8;">
                    • <strong style="color: #22c55e;">무료</strong>: 프로필 <strong>2개</strong> (영구 무료)<br>
                    • <strong>유료</strong>: 10개 ~ 월 $7.2 / 50개 ~ 월 $20+<br>
                    • 크롤링 횟수 제한 <strong>없음</strong> (무료도 무제한)
                </div>
            </div>

            <!-- API 일일 한도 안내 -->
            <div style="background: rgba(251, 191, 36, 0.06); border: 1px solid rgba(251, 191, 36, 0.15); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
                <div style="font-weight: 700; color: #fbbf24; font-size: 0.88rem; margin-bottom: 0.5rem;">⚠️ Local API 일일 한도</div>
                <div style="color: #d1d5db; font-size: 0.82rem; line-height: 1.8;">
                    • 브라우저 열기 일일 한도 = <strong style="color: #fbbf24;">프로필 수 × 10</strong><br>
                    <span style="font-size: 0.76rem; opacity: 0.7; padding-left: 0.6rem;">→ 무료 2개 = 하루 20회 / 10개 = 하루 100회</span><br>
                    • API 속도 제한: <strong>120회/분</strong> (최소 1초/1요청)<br>
                    <span style="font-size: 0.76rem; opacity: 0.7; padding-left: 0.6rem;">→ 리더가 자동으로 최적화하여 한도를 절약합니다</span>
                </div>
            </div>

            <button type="button" id="adspower-guide-confirm"
                style="width: 100%; padding: 0.85rem; background: linear-gradient(135deg, #f97316, #ea580c); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3); transition: all 0.15s;"
            >확인 ✅</button>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('adspower-guide-close')?.addEventListener('click', closeModal);
    document.getElementById('adspower-guide-confirm')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// ✅ [2026-03-17] 프록시(SmartProxy) 설정 이벤트 핸들러
function setupProxySettings(): void {
    console.log('[SettingsModal] 🛡️ 프록시 설정 이벤트 연결 시작...');

    const toggle = document.getElementById('proxy-settings-toggle') as HTMLInputElement;
    const toggleBg = document.getElementById('proxy-settings-toggle-bg');
    const toggleDot = document.getElementById('proxy-settings-toggle-dot');
    const toggleWrap = document.getElementById('proxy-settings-toggle-wrap');
    const statusText = document.getElementById('proxy-status-text');
    const navStatus = document.getElementById('nav-proxy-status');

    // 토글 시각 업데이트
    const updateToggleVisual = (enabled: boolean) => {
        if (toggleBg) toggleBg.style.background = enabled ? '#a855f7' : 'rgba(255,255,255,0.1)';
        if (toggleDot) toggleDot.style.left = enabled ? '24px' : '2px';
    };

    // 네비게이션 버튼 상태 텍스트 업데이트
    const updateNavStatus = (enabled: boolean) => {
        if (navStatus) {
            navStatus.textContent = enabled ? '✅ 프록시 활성 (SmartProxy)' : '❌ 프록시 비활성 (직접 연결)';
        }
    };

    // 상태 정보 로드
    const loadProxyStatus = async () => {
        try {
            const status = await (window as any).api?.getProxyStatus?.();
            if (status && statusText) {
                const lines = [
                    `• 상태: ${status.enabled ? '✅ 활성' : '❌ 비활성'}`,
                    `• 프로바이더: ${status.provider || 'N/A'}`,
                    `• 엔드포인트: ${status.endpoint || 'N/A'}`,
                    `• 설정 완료: ${status.configured ? '✅' : '❌ 자격증명 미설정'}`,
                ];
                statusText.innerHTML = lines.join('<br>');
            }
        } catch (err) {
            if (statusText) statusText.textContent = '상태 조회 실패';
        }
    };

    // ✅ [2026-04-03 FIX] 앱 시작 시 항상 프록시 비활성화
    // 프록시는 사용자가 매 세션마다 수동으로 켜야 함 (localStorage 이전 값 무시)
    const initProxy = async () => {
        try {
            const enabled = false; // 항상 비활성화로 시작
            localStorage.setItem('proxy_enabled', 'false');

            if (toggle) {
                toggle.checked = false;
                updateToggleVisual(false);
                updateNavStatus(false);
            }
            // 백엔드와 동기화
            await (window as any).api?.setProxyEnabled?.(false);
        } catch (err) {
            console.warn('[SettingsModal] 프록시 초기 상태 로드 실패:', err);
            if (toggle) {
                toggle.checked = false;
                updateToggleVisual(false);
                updateNavStatus(false);
            }
        }
        // 상태 정보 로드
        loadProxyStatus();
    };

    initProxy();

    // 토글 클릭 이벤트
    toggleWrap?.addEventListener('click', async () => {
        if (!toggle) return;
        toggle.checked = !toggle.checked;
        const enabled = toggle.checked;

        localStorage.setItem('proxy_enabled', enabled ? 'true' : 'false');
        updateToggleVisual(enabled);
        updateNavStatus(enabled);

        // 백엔드 동기화
        try {
            await (window as any).api?.setProxyEnabled?.(enabled);
        } catch (err) {
            console.error('[SettingsModal] 프록시 토글 IPC 오류:', err);
        }

        // 상태 정보 갱신
        loadProxyStatus();

        if ((window as any).toastManager) {
            if (enabled) {
                (window as any).toastManager.success('🛡️ 프록시 활성화 — SmartProxy IP 보호 ON');
            } else {
                (window as any).toastManager.info('📡 프록시 비활성화 — 직접 연결 (테더링 IP)');
            }
        }
    });

    // 설정 완료 버튼
    document.getElementById('settings-proxy-save-btn')?.addEventListener('click', () => {
        if ((window as any).toastManager) {
            (window as any).toastManager.success('✅ 프록시 설정이 저장되었습니다!');
        }

        const section = document.getElementById('settings-section-proxy');
        const navButtons = document.getElementById('settings-nav-buttons');
        if (section) section.style.display = 'none';
        if (navButtons) navButtons.style.display = 'flex';

        console.log('[SettingsModal] ✅ 프록시 설정 완료 저장');
    });

    console.log('[SettingsModal] ✅ 프록시 설정 이벤트 연결 완료');
}

// ✅ [2026-03-24] 캐시 관리 설정 이벤트 핸들러 (v2: confirm 대화상자 + 조회 시간 + api 방어)
function setupCacheSettings(): void {
    console.log('[SettingsModal] 🗑️ 캐시 관리 이벤트 연결 시작...');

    const api = (window as any).api;
    if (!api?.getCacheSize || !api?.clearAppCache) {
        console.warn('[SettingsModal] ⚠️ 캐시 관리 API가 preload에 없음 — 이벤트 연결 생략');
        return;
    }

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${(bytes / 1073741824).toFixed(2)} GB`;
    };

    const refreshCacheSize = async () => {
        try {
            const sizes = await api.getCacheSize();
            const el = (id: string) => document.getElementById(id);
            if (el('cache-size-images')) el('cache-size-images')!.textContent = formatBytes(sizes.images);
            if (el('cache-size-generated')) el('cache-size-generated')!.textContent = formatBytes(sizes.generated);
            if (el('cache-size-sessions')) el('cache-size-sessions')!.textContent = formatBytes(sizes.sessions);
            if (el('cache-size-browser')) el('cache-size-browser')!.textContent = formatBytes(sizes.browser);
            if (el('cache-size-total')) el('cache-size-total')!.textContent = formatBytes(sizes.total);
            // ✅ 마지막 조회 시간 표시
            const timeEl = el('cache-last-checked');
            if (timeEl) {
                const now = new Date();
                timeEl.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} 조회됨`;
            }
            console.log(`[SettingsModal] 캐시 용량: ${formatBytes(sizes.total)}`);
        } catch (err) {
            console.error('[SettingsModal] 캐시 용량 조회 실패:', err);
        }
    };

    // 캐시 섹션이 열릴 때 자동 조회
    document.getElementById('nav-cache-btn')?.addEventListener('click', () => {
        setTimeout(refreshCacheSize, 100);
    });

    // 새로고침 버튼
    document.getElementById('cache-refresh-btn')?.addEventListener('click', refreshCacheSize);

    // ✅ 공통 삭제 핸들러 (중복 코드 제거)
    const handleClear = async (category: 'images' | 'sessions' | 'all', btn: HTMLButtonElement | null, originalLabel: string) => {
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ 삭제 중...'; }
        try {
            const result = await api.clearAppCache(category);
            if ((window as any).toastManager) {
                (window as any).toastManager[result.success ? 'success' : 'error'](
                    result.success ? `✅ ${result.message}` : `❌ ${result.message}`
                );
            }
            await refreshCacheSize();
        } catch (err) {
            if ((window as any).toastManager) (window as any).toastManager.error(`❌ 오류: ${(err as Error).message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
        }
    };

    // 이미지 캐시 삭제
    document.getElementById('clear-cache-images-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('clear-cache-images-btn') as HTMLButtonElement;
        handleClear('images', btn, '🖼️ 이미지 캐시 삭제');
    });

    // 세션 캐시 삭제
    document.getElementById('clear-cache-sessions-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('clear-cache-sessions-btn') as HTMLButtonElement;
        handleClear('sessions', btn, '🌐 세션 캐시 삭제');
    });

    // 전체 캐시 비우기 (✅ confirm 대화상자 추가 — 위험 작업 보호)
    document.getElementById('clear-cache-all-btn')?.addEventListener('click', () => {
        if (!confirm('⚠️ 전체 캐시를 삭제하시겠습니까?\n\n• 이미지, 세션, 브라우저 캐시가 모두 삭제됩니다\n• 네이버 로그인을 다시 해야 할 수 있습니다\n• 설정과 라이선스는 유지됩니다')) {
            return;
        }
        const btn = document.getElementById('clear-cache-all-btn') as HTMLButtonElement;
        handleClear('all', btn, '🗑️ 전체 캐시 비우기');
    });

    console.log('[SettingsModal] ✅ 캐시 관리 이벤트 연결 완료');
}

// 전역 노출
(window as any).openSettingsModal = openSettingsModal;
(window as any).closeSettingsModal = closeSettingsModal;
(window as any).initSettingsModal = initSettingsModal;

// ✅ [2026-02-08 FIX] 자체 DOMContentLoaded 호출 제거
// renderer.ts에서 initSettingsModalFunc()을 DOMContentLoaded에서 호출하므로
// 여기서 중복 호출하면 이벤트 리스너가 2번 등록되어 UI 깜빡거림 발생
// (기존: DOMContentLoaded + 직접호출로 이중 초기화됨 → 제거)
