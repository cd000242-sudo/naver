// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 아이디/비밀번호 저장 모듈
// renderer.ts에서 추출 — 네이버 계정 자격증명 자동 저장/로드
// ═══════════════════════════════════════════════════════════════════

declare const window: Window & {
    api: any;
};

interface AppConfig {
    [key: string]: any;
    rememberCredentials?: boolean;
    savedNaverId?: string;
    savedNaverPassword?: string;
}

export async function initCredentialsSave(): Promise<void> {
    // DOM 요소가 로드될 때까지 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 200));

    // 전역 토스트 참조
    const toastManager = (window as any).toastManager || {
        success: () => { }, info: () => { }, error: () => { }
    };

    // 통합 탭의 네이버 계정 필드 사용
    const rememberCheckbox = document.getElementById('remember-credentials') as HTMLInputElement;
    const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
    const naverPasswordInput = document.getElementById('naver-password') as HTMLInputElement;

    if (!rememberCheckbox || !naverIdInput || !naverPasswordInput) {
        console.error('[자격증명] 필수 DOM 요소를 찾을 수 없습니다.');
        return;
    }

    // ✅ [v2.7.69] 비밀번호 표시/숨김 토글 (눈 버튼)
    const togglePwBtn = document.getElementById('toggle-naver-password') as HTMLButtonElement | null;
    if (togglePwBtn) {
        togglePwBtn.addEventListener('click', () => {
            const isHidden = naverPasswordInput.type === 'password';
            naverPasswordInput.type = isHidden ? 'text' : 'password';
            togglePwBtn.textContent = isHidden ? '🙈' : '👁️';
            togglePwBtn.setAttribute('aria-label', isHidden ? '비밀번호 숨기기' : '비밀번호 보이기');
        });
    }

    // 저장된 자격증명 로드
    try {
        const config = await window.api.getConfig();
        console.log('[자격증명] 설정 로드됨:', {
            savedNaverId: config.savedNaverId ? '있음' : '없음',
            savedNaverPassword: config.savedNaverPassword ? '있음' : '없음',
            rememberCredentials: config.rememberCredentials
        });

        // ✅ 저장된 값이 있으면 무조건 로드 (rememberCredentials 체크 여부와 관계없이)
        if (config.savedNaverId || config.savedNaverPassword) {
            // 체크박스 자동 체크
            rememberCheckbox.checked = true;

            // 저장된 값 표시
            if (config.savedNaverId) {
                naverIdInput.value = config.savedNaverId;
                console.log('[자격증명] 네이버 아이디 자동 입력:', config.savedNaverId.substring(0, 3) + '***');
            }

            if (config.savedNaverPassword) {
                naverPasswordInput.value = config.savedNaverPassword;
                console.log('[자격증명] 네이버 비밀번호 자동 입력: ***');
            }
        } else {
            console.log('[자격증명] 저장된 네이버 계정 정보가 없습니다.');
        }
    } catch (error) {
        console.error('[자격증명] 로드 실패:', error);
    }

    // 저장 체크박스 변경 시 자동 저장
    if (rememberCheckbox) {
        rememberCheckbox.addEventListener('change', async () => {
            try {
                const config = await window.api.getConfig();

                if (rememberCheckbox.checked) {
                    // ✅ 체크 시: 현재 입력된 값 저장
                    const updatedConfig: AppConfig = {
                        ...config,
                        rememberCredentials: true,
                        savedNaverId: naverIdInput?.value.trim() || config.savedNaverId,
                        savedNaverPassword: naverPasswordInput?.value.trim() || config.savedNaverPassword,
                    };
                    await window.api.saveConfig(updatedConfig);
                    toastManager.success('✅ 네이버 계정 정보가 저장되었습니다.');
                } else {
                    // ✅ 체크 해제 시: 저장된 값 삭제
                    const updatedConfig: AppConfig = {
                        ...config,
                        rememberCredentials: false,
                        savedNaverId: undefined,
                        savedNaverPassword: undefined,
                    };
                    await window.api.saveConfig(updatedConfig);
                    // 입력 필드도 초기화
                    if (naverIdInput) naverIdInput.value = '';
                    if (naverPasswordInput) naverPasswordInput.value = '';
                    toastManager.info('네이버 계정 정보 저장이 해제되었습니다.');
                }
            } catch (error) {
                console.error('[자격증명] 저장 실패:', error);
                toastManager.error('계정 정보 저장에 실패했습니다.');
            }
        });
    }

    // 아이디/비밀번호 입력 시 자동 저장 (체크박스가 체크되어 있을 때만)
    if (naverIdInput) {
        let saveTimeout: NodeJS.Timeout | null = null;
        naverIdInput.addEventListener('input', () => {
            if (rememberCheckbox?.checked) {
                if (saveTimeout) clearTimeout(saveTimeout);
                saveTimeout = setTimeout(async () => {
                    try {
                        const config = await window.api.getConfig();
                        const updatedConfig: AppConfig = {
                            ...config,
                            savedNaverId: naverIdInput.value.trim() || undefined,
                        };
                        await window.api.saveConfig(updatedConfig);
                        console.log('[자격증명] 아이디 자동 저장 완료');
                    } catch (error) {
                        console.error('아이디 저장 실패:', error);
                    }
                }, 500);
            }
        });
    }

    if (naverPasswordInput) {
        let saveTimeout: NodeJS.Timeout | null = null;
        naverPasswordInput.addEventListener('input', () => {
            if (rememberCheckbox?.checked) {
                if (saveTimeout) clearTimeout(saveTimeout);
                saveTimeout = setTimeout(async () => {
                    try {
                        const config = await window.api.getConfig();
                        const updatedConfig: AppConfig = {
                            ...config,
                            savedNaverPassword: naverPasswordInput.value.trim() || undefined,
                        };
                        await window.api.saveConfig(updatedConfig);
                        console.log('[자격증명] 비밀번호 자동 저장 완료');
                    } catch (error) {
                        console.error('비밀번호 저장 실패:', error);
                    }
                }, 500);
            }
        });
    }
}
