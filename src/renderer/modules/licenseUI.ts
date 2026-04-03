// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 라이선스 UI 모듈
// renderer.ts에서 추출 — 라이선스 배지, 모달, 고객센터, 전체 초기화
// ═══════════════════════════════════════════════════════════════════

import { toastManager } from '../utils/uiManagers.js';
import { initAccountSettings, onAccountLogin, onAccountLogout } from './accountSettingsManager.js';

// TS 컴파일용 — 런타임에서는 renderer.ts의 동일 스코프 함수 사용
declare function appendLog(message: string, logOutputId?: string): void;
declare function withErrorHandling<T>(fn: () => Promise<T>, context: string, options?: any): Promise<T | null>;
declare function connectToAdminPanel(): Promise<void>;
declare var ImageManager: any;

// ============================================
// 라이선스 코드 테스트 (개발용)
// ============================================
export async function testLicenseCode(code: string): Promise<void> {
    const result = await withErrorHandling(
        async () => {
            console.log('[Renderer] 라이선스 코드 테스트 시작:', code);

            const deviceId = await window.api.getDeviceId();
            const result = await window.api.verifyLicense(code, deviceId);
            console.log('[Renderer] 라이선스 검증 결과:', result);

            if (result.valid) {
                toastManager.success(`✅ 라이선스 코드 유효!\n${JSON.stringify(result.license, null, 2)}`);
            } else {
                toastManager.error(`❌ 라이선스 코드无效!\n메시지: ${result.message}`);
            }

            return result;
        },
        'LicenseTest',
        { showToast: false, logError: false } // 이미 내부에서 처리
    );
}


// ============================================
// 라이선스 배지 초기화 및 업데이트
// ============================================
export async function initLicenseBadge(): Promise<void> {
    const licenseBadge = document.getElementById('license-badge') as HTMLDivElement;
    const licenseBadgeText = document.getElementById('license-badge-text') as HTMLSpanElement;

    if (!licenseBadge || !licenseBadgeText) {
        console.warn('[LicenseBadge] 라이선스 배지 요소를 찾을 수 없습니다.');
        return;
    }

    const floatingContainer = document.getElementById('right-floating-buttons') as HTMLDivElement | null;
    const leftStatusContainer = document.getElementById('left-status-badges') as HTMLDivElement | null;
    const escapeHtml = (input: string): string =>
        String(input)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    const ensureMemberBadge = (): HTMLDivElement | null => {
        if (!leftStatusContainer) return null;
        let memberBadge = document.getElementById('member-badge') as HTMLDivElement | null;
        if (!memberBadge) {
            memberBadge = document.createElement('div');
            memberBadge.id = 'member-badge';
            memberBadge.style.display = 'none';
            memberBadge.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.22), rgba(255, 215, 0, 0.12))';
            memberBadge.style.border = '1px solid rgba(212, 175, 55, 0.62)';
            memberBadge.style.borderRadius = '14px';
            memberBadge.style.padding = '0.7rem 0.9rem';
            memberBadge.style.fontSize = '0.85rem';
            memberBadge.style.fontWeight = '700';
            memberBadge.style.color = '#22c55e';
            memberBadge.style.boxShadow = '0 12px 30px rgba(0,0,0,0.35)';
            memberBadge.style.textAlign = 'center';
            memberBadge.style.minWidth = '160px';
            memberBadge.style.letterSpacing = '0.2px';
            memberBadge.style.backdropFilter = 'blur(10px)';
            memberBadge.innerHTML =
                '<span style="display:inline-flex;align-items:center;gap:0.6rem;justify-content:center;">' +
                '<span id="member-badge-icon" style="width:22px;height:22px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(212,175,55,0.20);border:1px solid rgba(212,175,55,0.55);font-size:12px;color:#22c55e;">👤</span>' +
                '<span id="member-badge-text">회원</span>' +
                '<button id="logout-btn" style="margin-left:0.5rem;padding:2px 8px;font-size:0.7rem;font-weight:600;border:1px solid rgba(255,100,100,0.4);border-radius:8px;background:rgba(255,100,100,0.12);color:#ff6b6b;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background=\'rgba(255,100,100,0.25)\'" onmouseout="this.style.background=\'rgba(255,100,100,0.12)\'">로그아웃</button>' +
                '</span>';
            leftStatusContainer.appendChild(memberBadge);

            // 로그아웃 버튼 클릭 핸들러
            const logoutBtn = memberBadge.querySelector('#logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmed = confirm('정말 로그아웃하시겠습니까?\n\n앱이 재시작되며 로그인 화면으로 돌아갑니다.');
                    if (!confirmed) return;

                    try {
                        if (window.api && window.api.logout) {
                            await window.api.logout();
                        }
                    } catch (err) {
                        console.error('[Logout] 로그아웃 실패:', err);
                        alert('로그아웃 중 오류가 발생했습니다.');
                    }
                });
            }
        }
        return memberBadge;
    };

    const ensureFreeQuotaCounter = (): HTMLDivElement | null => {
        if (!leftStatusContainer) return null;
        let counter = document.getElementById('free-quota-counter') as HTMLDivElement | null;
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'free-quota-counter';
            counter.style.display = 'none';
            counter.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(5, 150, 105, 0.10))';
            counter.style.border = '2px solid rgba(16, 185, 129, 0.55)';
            counter.style.borderRadius = '14px';
            counter.style.padding = '0.9rem 0.95rem';
            counter.style.fontSize = '1.05rem';
            counter.style.fontWeight = '900';
            counter.style.color = '#22c55e';
            counter.style.boxShadow = '0 12px 30px rgba(0,0,0,0.28)';
            counter.style.textAlign = 'center';
            counter.style.minWidth = '160px';
            counter.style.lineHeight = '1.25';
            counter.style.backdropFilter = 'blur(10px)';

            leftStatusContainer.appendChild(counter);
        }
        return counter;
    };

    const showWelcomeOnce = (userLabel: string): void => {
        try {
            if (sessionStorage.getItem('welcome_shown_v1') === '1') return;
            sessionStorage.setItem('welcome_shown_v1', '1');
            const safe = escapeHtml(userLabel);
            toastManager.info(
                `<div style="font-weight:800;font-size:14px;letter-spacing:0.2px;">${safe}님 환영합니다</div><div style="margin-top:4px;opacity:0.95;font-size:12px;">Better Life Naver에 오신 것을 환영해요.</div>`,
                4200,
            );
        } catch (e) {
            console.warn('[licenseUI] catch ignored:', e);
        }
    };

    let freeQuotaInterval: number | null = null;
    const updateFreeQuota = async (): Promise<void> => {
        try {
            const counter = ensureFreeQuotaCounter();
            if (!counter) return;
            if (typeof (window as any).api?.getQuotaStatus !== 'function') {
                counter.style.display = 'block';
                counter.innerHTML = '<div style="font-size:12px;color:red;">API Error</div>';
                return;
            }
            const status = await (window as any).api.getQuotaStatus();

            // 디버깅: 상태가 올바르지 않으면 에러 표시
            if (!status?.success) {
                counter.style.display = 'block';
                counter.innerHTML = `<div style="font-size:11px;color:red;line-height:1.2;">Error: ${status?.message || 'Unknown'}</div>`;
                return;
            }
            if (!status?.isFree) {
                // ✅ 유료 사용자는 쿼터 표시 안 함 - 완전히 숨김
                counter.style.display = 'none';
                return;
            }

            const q = status.quota;
            if (!q || !q.usage) {
                counter.style.display = 'block';
                counter.innerHTML = `<div style="font-size:11px;color:red;">No Quota Data</div>`;
                return;
            }

            // ✅ 발행 쿼터만 체크 (글생성+발행 = 1세트)
            const usedPublish = Number((q as any)?.usage?.publish) || 0;
            const limitPublish = Number((q as any)?.limits?.publish) || 2;
            const remaining = Math.max(0, limitPublish - usedPublish);

            // ✅ "0/2" 형태로 표시
            const isExhausted = remaining <= 0;
            const color = isExhausted ? '#ef4444' : '#22c55e';
            const text = `${usedPublish}/${limitPublish}`;
            counter.innerHTML =
                `<div style="font-size:0.85rem;font-weight:900;letter-spacing:0.2px;color:rgba(255,255,255,0.92);margin-bottom:4px;">오늘 발행</div>` +
                `<div style="font-size:1.45rem;font-weight:1000;color:${color};letter-spacing:0.2px;">${text}</div>`;
            counter.style.display = 'block';
        } catch (e) {
            const counter = ensureFreeQuotaCounter();
            if (counter) {
                counter.style.display = 'block';
                counter.innerHTML = `<div style="font-size:11px;color:red;">Exec Error: ${(e as Error).message}</div>`;
            }
        }
    };
    // ✅ [2026-01-16] 외부에서 호출 가능하도록 전역 노출
    (window as any).updateFreeQuota = updateFreeQuota;


    async function updateLicenseBadge(): Promise<void> {
        try {
            const result = await window.api.getLicense();

            if (result.license && result.license.isValid) {
                const licenseType = String((result.license as any).licenseType || '').trim();
                const memberBadge = ensureMemberBadge();
                const memberUserId = String((result.license as any).userId || '').trim();
                const memberLabel = licenseType === 'free' ? '무료사용자' : memberUserId;
                if (memberBadge) {
                    const memberIcon = memberBadge.querySelector('#member-badge-icon') as HTMLElement | null;
                    const memberText = memberBadge.querySelector('#member-badge-text') as HTMLElement | null;
                    if (memberText) {
                        memberText.textContent = licenseType === 'free' ? '무료사용자' : `회원: ${memberLabel || '회원'}`;
                    }
                    if (memberIcon) {
                        memberIcon.textContent = licenseType === 'free' ? '🆓' : '👤';
                        memberIcon.style.background = 'rgba(212,175,55,0.20)';
                        memberIcon.style.borderColor = 'rgba(212,175,55,0.55)';
                        memberIcon.style.color = '#22c55e';
                    }
                    memberBadge.style.display = 'block';
                }

                if (licenseType === 'free') {
                    licenseBadge.style.display = 'none';
                } else {
                    licenseBadge.style.display = 'flex';
                }

                if (memberLabel) {
                    showWelcomeOnce(memberLabel);
                }

                if (licenseType === 'free') {
                    if (freeQuotaInterval === null) {
                        await updateFreeQuota();
                        freeQuotaInterval = window.setInterval(() => {
                            void updateFreeQuota();
                        }, 30 * 1000);
                    }
                    return;
                } else {
                    const counter = document.getElementById('free-quota-counter') as HTMLDivElement | null;
                    if (counter) counter.style.display = 'none';
                    if (freeQuotaInterval !== null) {
                        window.clearInterval(freeQuotaInterval);
                        freeQuotaInterval = null;
                    }
                }

                // 만료일이 있는 경우 남은 기간 계산
                if (result.license.expiresAt) {
                    const expiresAt = new Date(result.license.expiresAt);
                    const now = new Date();

                    // 날짜만 비교 (만료일은 해당 날짜의 끝까지 유효)
                    const expiresDate = new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate(), 23, 59, 59, 999);
                    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

                    const diffTime = expiresDate.getTime() - nowDate.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays < 0) {
                        licenseBadgeText.textContent = '⚠️ 라이선스 만료됨';
                        licenseBadge.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1))';
                        licenseBadge.style.borderColor = '#ef4444';
                        licenseBadgeText.style.color = '#ef4444';
                    } else if (diffDays <= 7) {
                        licenseBadgeText.textContent = `⚠️ ${diffDays}일 남음`;
                        licenseBadge.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.1))';
                        licenseBadge.style.borderColor = '#f59e0b';
                        licenseBadgeText.style.color = '#f59e0b';
                    } else if (diffDays <= 30) {
                        licenseBadgeText.textContent = `⏰ ${diffDays}일 남음`;
                        licenseBadge.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(255, 215, 0, 0.1))';
                        licenseBadge.style.borderColor = '#FFD700';
                        licenseBadgeText.style.color = '#FFD700';
                    } else {
                        licenseBadgeText.textContent = `✅ ${diffDays}일 남음`;
                        licenseBadge.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))';
                        licenseBadge.style.borderColor = '#22c55e';
                        licenseBadgeText.style.color = '#22c55e';
                    }
                } else {
                    try {
                        console.log('[LicenseBadge] 만료일 정보 없음, 서버에서 재검증 시도...');
                        const revalidateResult = await window.api.revalidateLicense();
                        if (revalidateResult) {
                            const updatedResult = await window.api.getLicense();
                            if (updatedResult.license?.expiresAt) {
                                const expiresAt = new Date(updatedResult.license.expiresAt);
                                const now = new Date();
                                const expiresDate = new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate(), 23, 59, 59, 999);
                                const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                                const diffTime = expiresDate.getTime() - nowDate.getTime();
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                if (diffDays < 0) {
                                    licenseBadgeText.textContent = '⚠️ 라이선스 만료됨';
                                    licenseBadge.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1))';
                                    licenseBadge.style.borderColor = '#ef4444';
                                    licenseBadgeText.style.color = '#ef4444';
                                } else if (diffDays <= 7) {
                                    licenseBadgeText.textContent = `⚠️ ${diffDays}일 남음`;
                                    licenseBadge.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.1))';
                                    licenseBadge.style.borderColor = '#f59e0b';
                                    licenseBadgeText.style.color = '#f59e0b';
                                } else if (diffDays <= 30) {
                                    licenseBadgeText.textContent = `⏰ ${diffDays}일 남음`;
                                    licenseBadge.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(255, 215, 0, 0.1))';
                                    licenseBadge.style.borderColor = '#FFD700';
                                    licenseBadgeText.style.color = '#FFD700';
                                } else {
                                    licenseBadgeText.textContent = `✅ ${diffDays}일 남음`;
                                    licenseBadge.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))';
                                    licenseBadge.style.borderColor = '#22c55e';
                                    licenseBadgeText.style.color = '#22c55e';
                                }
                                return;
                            } else {
                                console.log('[LicenseBadge] 재검증 후에도 만료일이 없음 - 영구 라이선스로 판단');
                                licenseBadgeText.textContent = '♾️ 영구 라이선스';
                                licenseBadge.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))';
                                licenseBadge.style.borderColor = '#22c55e';
                                licenseBadgeText.style.color = '#22c55e';
                                return;
                            }
                        } else {
                            console.log('[LicenseBadge] 재검증 실패 - 영구 라이선스로 판단');
                            licenseBadgeText.textContent = '♾️ 영구 라이선스';
                            licenseBadge.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))';
                            licenseBadge.style.borderColor = '#22c55e';
                            licenseBadgeText.style.color = '#22c55e';
                        }
                    } catch (error) {
                        console.error('[LicenseBadge] 서버 재검증 실패:', error);
                        licenseBadgeText.textContent = '♾️ 영구 라이선스';
                        licenseBadge.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))';
                        licenseBadge.style.borderColor = '#22c55e';
                        licenseBadgeText.style.color = '#22c55e';
                    }
                }
            } else {
                licenseBadge.style.display = 'none';
                const memberBadge = document.getElementById('member-badge') as HTMLDivElement | null;
                if (memberBadge) memberBadge.style.display = 'none';
                const counter = document.getElementById('free-quota-counter') as HTMLDivElement | null;
                if (counter) counter.style.display = 'none';
                if (freeQuotaInterval !== null) {
                    window.clearInterval(freeQuotaInterval);
                    freeQuotaInterval = null;
                }
            }
        } catch (error) {
            console.error('[LicenseBadge] 라이선스 정보 업데이트 실패:', error);
            licenseBadge.style.display = 'none';
            const memberBadge = document.getElementById('member-badge') as HTMLDivElement | null;
            if (memberBadge) memberBadge.style.display = 'none';
            const counter = document.getElementById('free-quota-counter') as HTMLDivElement | null;
            if (counter) counter.style.display = 'none';
            if (freeQuotaInterval !== null) {
                window.clearInterval(freeQuotaInterval);
                freeQuotaInterval = null;
            }
        }
    }

    // 초기 업데이트
    await updateLicenseBadge();

    // 1시간마다 업데이트 (만료일이 가까워질 수 있으므로)
    setInterval(updateLicenseBadge, 60 * 60 * 1000);
}

// ============================================
// 고객센터 버튼 초기화
// ============================================
export function initCustomerServiceButton(): void {
    const customerServiceBtn = document.getElementById('customer-service-btn') as HTMLButtonElement;

    if (!customerServiceBtn) {
        console.warn('[CustomerService] 고객센터 버튼을 찾을 수 없습니다.');
        return;
    }

    customerServiceBtn.addEventListener('click', async () => {
        const kakaoOpenChatUrl = 'https://open.kakao.com/o/sPcaslwh';

        try {
            if (window.api && window.api.openExternalUrl) {
                await window.api.openExternalUrl(kakaoOpenChatUrl);
                console.log('[CustomerService] 기본 브라우저로 카카오톡 오픈챗 열기:', kakaoOpenChatUrl);
            } else {
                window.open(kakaoOpenChatUrl, '_blank');
            }
        } catch (error) {
            console.error('[CustomerService] 오픈챗 열기 실패:', error);
            window.open(kakaoOpenChatUrl, '_blank');
        }
    });
}

// ============================================
// 전체 초기화 버튼 초기화
// ============================================
export function initGlobalRefreshButton(): void {
    const globalRefreshBtn = document.getElementById('global-refresh-btn');
    if (globalRefreshBtn) {
        globalRefreshBtn.addEventListener('click', () => {
            const confirmed = window.confirm(
                '⚠️ 전체 초기화\n\n' +
                '모든 입력 필드, 생성된 콘텐츠, 로그가 초기화됩니다.\n' +
                '(설정, 네이버 계정, 생성된 글 목록은 유지됩니다)\n\n' +
                '정말 초기화하시겠습니까?'
            );

            if (confirmed) {
                performGlobalRefresh();
            }
        });
    }
}

// 전체 초기화 실행
export function performGlobalRefresh(): void {
    try {
        appendLog('🔄 전체 초기화를 시작합니다...');

        // 네이버 아이디/비밀번호 백업
        const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
        const naverPasswordInput = document.getElementById('naver-password') as HTMLInputElement;
        const naverRememberCheckbox = document.getElementById('remember-credentials') as HTMLInputElement;

        const savedNaverId = naverIdInput?.value || '';
        const savedNaverPassword = naverPasswordInput?.value || '';
        const savedRememberState = naverRememberCheckbox?.checked || false;

        // 1. 모든 입력 필드 초기화
        const allInputs = document.querySelectorAll('input[type="text"], input[type="url"], input[type="number"], input[type="datetime-local"], input[type="password"], textarea');
        allInputs.forEach(input => {
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                if (!input.closest('#settings-modal') &&
                    input.id !== 'naver-id' &&
                    input.id !== 'naver-password') {
                    input.value = '';
                }
            }
        });

        // 2. 모든 셀렉트 박스 초기화
        const allSelects = document.querySelectorAll('select');
        allSelects.forEach(select => {
            if (select instanceof HTMLSelectElement) {
                if (!select.closest('#settings-modal')) {
                    select.selectedIndex = 0;
                }
            }
        });

        // 3. 체크박스 초기화
        const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        allCheckboxes.forEach(checkbox => {
            if (checkbox instanceof HTMLInputElement) {
                if (!checkbox.closest('#settings-modal') &&
                    checkbox.id !== 'remember-credentials') {
                    checkbox.checked = false;
                }
            }
        });

        // 4. 로그 초기화
        const logOutputs = ['unified-log-output', 'images-log-output'];
        logOutputs.forEach(id => {
            const logElement = document.getElementById(id);
            if (logElement) {
                logElement.innerHTML = '';
            }
        });

        // 5. 진행상황 초기화
        const progressContainers = ['unified-progress-container', 'images-progress-container'];
        progressContainers.forEach(id => {
            const progressElement = document.getElementById(id);
            if (progressElement) {
                progressElement.innerHTML = '';
                progressElement.style.display = 'none';
            }
        });

        // 6. 생성된 이미지 미리보기 초기화
        const imageGrids = ['unified-generated-images-grid', 'images-generated-images-grid'];
        imageGrids.forEach(id => {
            const gridElement = document.getElementById(id);
            if (gridElement) {
                gridElement.innerHTML = '';
            }
        });

        // 7. 반자동 모드 섹션 숨기기
        const semiAutoSection = document.getElementById('unified-semi-auto-section');
        if (semiAutoSection) {
            semiAutoSection.style.display = 'none';
        }

        // 8. 전역 변수 초기화
        if (typeof window !== 'undefined') {
            (window as any).currentStructuredContent = null;
            (window as any).generatedImages = [];
            (window as any).currentPostId = null;
        }

        // 8-1. ✅ [2026-02-23 FIX] 이미지 캐시 완전 초기화
        try {
            if (typeof ImageManager !== 'undefined') {
                ImageManager.clear();
                ImageManager.clearAll();
                appendLog('🖼️ ImageManager 캐시 초기화 완료');
            }
        } catch (imgErr) {
            console.warn('[performGlobalRefresh] ImageManager 초기화 실패:', imgErr);
        }

        // 8-2. ✅ [2026-02-23 FIX] 메인 프로세스 이미지 생성 상태 초기화
        try {
            if (typeof (window as any).api?.resetImageState === 'function') {
                (window as any).api.resetImageState().then((result: any) => {
                    if (result?.success) {
                        console.log('[performGlobalRefresh] ✅ 메인 프로세스 이미지 상태 초기화 완료');
                    }
                }).catch((err: any) => {
                    console.warn('[performGlobalRefresh] 메인 프로세스 이미지 상태 초기화 실패:', err);
                });
            }
        } catch (ipcErr) {
            console.warn('[performGlobalRefresh] IPC 이미지 상태 초기화 실패:', ipcErr);
        }

        // 9. 임시 저장 데이터 삭제
        try {
            localStorage.removeItem('autosave_unified_url');
            localStorage.removeItem('autosave_unified_keywords');
            localStorage.removeItem('autosave_unified_title');
            localStorage.removeItem('autosave_unified_content');
            localStorage.removeItem('autosave_unified_hashtags');
        } catch (e) {
            // localStorage 접근 실패 시 무시
        }

        // 10. 네이버 아이디/비밀번호 복원
        if (naverIdInput && savedNaverId) {
            naverIdInput.value = savedNaverId;
        }
        if (naverPasswordInput && savedNaverPassword) {
            naverPasswordInput.value = savedNaverPassword;
        }
        if (naverRememberCheckbox) {
            naverRememberCheckbox.checked = savedRememberState;
        }

        // 11. 첫 번째 탭으로 이동
        const firstTab = document.querySelector('.tab-button[data-tab="main"]') as HTMLButtonElement;
        if (firstTab) {
            firstTab.click();
        }

        appendLog('✅ 전체 초기화가 완료되었습니다! (네이버 계정 정보는 유지됨)');
        toastManager.success('✅ 전체 초기화 완료!');

        // 성공 메시지 표시 후 로그도 초기화
        setTimeout(() => {
            logOutputs.forEach(id => {
                const logElement = document.getElementById(id);
                if (logElement) {
                    logElement.innerHTML = '<div class="log-entry" style="color: var(--success);">✅ 초기화 완료! 새로운 작업을 시작하세요.</div>';
                }
            });
        }, 1000);

    } catch (error) {
        console.error('전체 초기화 중 오류:', error);
        appendLog(`❌ 초기화 중 오류 발생: ${(error as Error).message}`);
        toastManager.error('❌ 초기화 중 오류가 발생했습니다.');
    }
}

// ============================================
// 라이선스 모달 초기화
// ============================================
export async function initLicenseModal(): Promise<void> {
    const licenseModal = document.getElementById('license-modal') as HTMLDivElement | null;
    const settingsModal = document.getElementById('settings-modal') as HTMLDivElement | null;
    const externalLinksModal = document.getElementById('external-links-modal') as HTMLDivElement | null;
    const licenseStatusText = document.getElementById('license-status-text') as HTMLParagraphElement;
    const licenseInputSection = document.getElementById('license-input-section') as HTMLDivElement;
    const licenseCodeInput = document.getElementById('license-code-input') as HTMLInputElement;
    const verifyLicenseBtn = document.getElementById('verify-license-btn') as HTMLButtonElement;
    const openSettingsFromLicense = document.getElementById('open-settings-from-license') as HTMLButtonElement;
    const openExternalLinksFromLicense = document.getElementById('open-external-links-from-license') as HTMLButtonElement;

    // 라이선스 상태 확인
    try {
        const result = await window.api.getLicense();
        if (result.license && result.license.isValid) {
            if (licenseStatusText) {
                licenseStatusText.textContent = `✅ 라이선스 인증 완료 (${result.license.licenseType || 'standard'})`;
            }

            // ✅ [2026-02-26] 계정별 세팅 초기화 — 라이선스 userId로 세팅 분리 로드
            let acctUserId = (result.license as any).userId || '';
            // 무료 사용자는 userId가 없으므로 deviceId를 식별자로 사용
            if (!acctUserId) {
                try {
                    acctUserId = await window.api.getDeviceId() || '';
                } catch { /* ignore */ }
            }
            if (acctUserId) {
                await onAccountLogin(acctUserId);
                console.log(`[LicenseModal] ✅ 계정별 세팅 로드 완료: ${acctUserId}`);
            }

            // 관리자 패널 연동
            await connectToAdminPanel();
        } else {
            // ✅ [2026-02-26 FIX] 메인창에서 라이선스 모달 자동 표시 제거
            // 인증은 인증창(auth window)에서 처리하므로 메인창에서 모달을 띄우면 무료체험 사용자가 차단됨
            console.log('[LicenseModal] 라이선스 미인증 상태 — 모달 표시 안 함 (인증창에서 처리)');
            if (licenseStatusText) {
                licenseStatusText.textContent = '❌ 라이선스가 인증되지 않았습니다.';
            }
        }
    } catch (error) {
        // ✅ [2026-02-26 FIX] 에러 시에도 모달 자동 표시 안 함
        console.warn('[LicenseModal] 라이선스 확인 중 오류:', error);
        if (licenseStatusText) {
            licenseStatusText.textContent = `오류: ${(error as Error).message}`;
        }
    }

    // 인증 버튼
    if (verifyLicenseBtn && licenseCodeInput) {
        verifyLicenseBtn.addEventListener('click', async () => {
            const code = licenseCodeInput.value.trim();
            if (!code) {
                alert('라이선스 코드를 입력해주세요.');
                return;
            }

            verifyLicenseBtn.disabled = true;
            verifyLicenseBtn.textContent = '인증 중...';

            try {
                const deviceId = await window.api.getDeviceId();
                const result = await window.api.verifyLicense(code, deviceId);
                if (result.valid && result.license) {
                    // ✅ [2026-02-26] 인증 성공 시 계정별 세팅 초기화
                    const userId = (result.license as any).userId || '';
                    if (userId) {
                        await onAccountLogin(userId);
                    }
                    alert('✅ 라이선스 인증이 완료되었습니다!');
                    if (licenseModal) {
                        licenseModal.setAttribute('aria-hidden', 'true');
                        licenseModal.style.display = 'none';
                    }
                    await initLicenseBadge();
                    location.reload();
                } else {
                    alert(`❌ 인증 실패: ${result.message || '알 수 없는 오류'}`);
                }
            } catch (error) {
                alert(`❌ 오류: ${(error as Error).message}`);
            } finally {
                verifyLicenseBtn.disabled = false;
                verifyLicenseBtn.textContent = '인증하기';
            }
        });
    }

    // 환경 설정 열기
    if (openSettingsFromLicense && settingsModal) {
        openSettingsFromLicense.addEventListener('click', () => {
            if (licenseModal) {
                licenseModal.setAttribute('aria-hidden', 'true');
                licenseModal.style.display = 'none';
            }
            settingsModal.setAttribute('aria-hidden', 'false');
            settingsModal.style.display = 'flex';
        });
    }

    // ✅ 외부유입 열기
    if (openExternalLinksFromLicense && externalLinksModal) {
        openExternalLinksFromLicense.addEventListener('click', async () => {
            console.log('[Settings] 외부유입 모달 열기');

            try {
                const licenseResult = await window.api.getLicense();
                if (licenseResult.license && licenseResult.license.expiresAt) {
                    console.log('[Settings] 라이선스 만료일:', new Date(licenseResult.license.expiresAt).toLocaleDateString('ko-KR'));
                } else {
                    console.log('[Settings] 라이선스 정보 없음 - 기본 모드로 진행');
                }
            } catch (licenseError) {
                console.warn('[Settings] 라이선스 확인 실패, 기본 모드로 진행:', licenseError);
            }

            if (licenseModal) {
                licenseModal.setAttribute('aria-hidden', 'true');
                licenseModal.style.display = 'none';
            }
            externalLinksModal.setAttribute('aria-hidden', 'false');
            externalLinksModal.style.display = 'flex';
        });
    }
}

// ============================================
// ✅ 오류 알림 모달 (수동으로 닫기)
// ============================================
export function showErrorAlertModal(title: string, message: string): void {
    const existingModal = document.getElementById('error-alert-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'error-alert-modal';
    modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.7); display: flex; align-items: center;
    justify-content: center; z-index: 10000; backdrop-filter: blur(4px);
  `;

    modal.innerHTML = `
    <div style="background: var(--bg-secondary); border-radius: 16px; padding: 2rem; max-width: 500px; width: 90%; border: 2px solid #ef4444; box-shadow: 0 20px 60px rgba(239, 68, 68, 0.3);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
        <div style="width: 48px; height: 48px; background: rgba(239, 68, 68, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">⚠️</div>
        <h3 style="margin: 0; color: #ef4444; font-size: 1.3rem;">${title}</h3>
      </div>
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
        <p style="margin: 0; color: var(--text-strong); line-height: 1.6; white-space: pre-wrap;">${message}</p>
      </div>
      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
        <p style="margin: 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5;">
          💡 <strong>해결 방법:</strong><br>
          1. 스케줄 관리 탭에서 실패한 항목을 확인하세요.<br>
          2. "시간 변경 후 재시도" 버튼으로 새 시간을 설정하세요.<br>
          3. 캡차가 필요하면 브라우저에서 직접 해결해주세요.
        </p>
      </div>
      <button type="button" id="error-alert-close-btn" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 1rem; cursor: pointer;">
        확인
      </button>
    </div>
  `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('error-alert-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.remove());
    }
}
